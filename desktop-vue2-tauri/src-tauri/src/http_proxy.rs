use std::collections::HashMap;

use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

const DEFAULT_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    max_bytes: Option<usize>,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum StreamEvent {
    Open {
        status: u16,
        headers: HashMap<String, String>,
    },
    Chunk {
        text: String,
    },
    Error {
        message: String,
    },
}

/// 渲染进程里跨域请求在 WebView2 会被 CORS 拦掉，这里统一由 Rust 侧发出。
/// 响应按块回传，SSE（AI 流式回复）和普通 JSON 共用同一条通道。
#[tauri::command]
pub async fn http_proxy_stream(
    client: tauri::State<'_, Client>,
    request: ProxyRequest,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    stream_request(client.inner(), request, &|event| on_event.send(event).is_ok()).await
}

/// 命令本体与 tauri 类型的解耦版：`emit` 返回 false 表示渲染层已不再接收（窗口关了/请求取消）。
async fn stream_request(
    client: &Client,
    request: ProxyRequest,
    emit: &(dyn Fn(StreamEvent) -> bool + Send + Sync),
) -> Result<(), String> {
    let url = Url::parse(&request.url).map_err(|_| "请求地址无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
        return Err("只支持 http/https 请求".into());
    }

    let method = Method::from_bytes(request.method.as_bytes()).map_err(|_| {
        format!("不支持的请求方法：{}", request.method)
    })?;

    let mut outgoing = client.request(method, url);
    if let Some(timeout_ms) = request.timeout_ms {
        outgoing = outgoing.timeout(std::time::Duration::from_millis(timeout_ms));
    }
    if let Some(headers) = request.headers {
        for (name, value) in headers {
            outgoing = outgoing.header(&name, &value);
        }
    }
    if let Some(body) = request.body {
        outgoing = outgoing.body(body);
    }

    let mut response = match outgoing.send().await {
        Ok(response) => response,
        Err(error) => {
            emit(StreamEvent::Error {
                message: error.to_string(),
            });
            return Ok(());
        }
    };

    let status = response.status().as_u16();
    let mut headers = HashMap::new();
    for (name, value) in response.headers().iter() {
        headers.insert(
            name.as_str().to_string(),
            value.to_str().unwrap_or_default().to_string(),
        );
    }
    if !emit(StreamEvent::Open { status, headers }) {
        return Ok(());
    }

    let limit = request.max_bytes.unwrap_or(DEFAULT_LIMIT);
    let mut total = 0usize;
    let mut pending: Vec<u8> = Vec::new();

    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                emit(StreamEvent::Error {
                    message: error.to_string(),
                });
                return Ok(());
            }
        };

        total += chunk.len();
        if total > limit {
            emit(StreamEvent::Error {
                message: format!("响应超过 {} 字节上限", limit),
            });
            return Ok(());
        }

        pending.extend_from_slice(&chunk);
        if let Some(text) = take_utf8_prefix(&mut pending) {
            if !emit(StreamEvent::Chunk { text }) {
                return Ok(());
            }
        }
    }

    if !pending.is_empty() {
        let text = String::from_utf8_lossy(&pending).to_string();
        emit(StreamEvent::Chunk { text });
    }

    Ok(())
}

/// 从缓冲区里取出完整的 UTF-8 前缀，剩下的（可能是半个多字节字符）留到下一块再解。
fn take_utf8_prefix(buffer: &mut Vec<u8>) -> Option<String> {
    if buffer.is_empty() {
        return None;
    }
    match std::str::from_utf8(buffer) {
        Ok(text) => {
            let owned = text.to_string();
            buffer.clear();
            if owned.is_empty() {
                None
            } else {
                Some(owned)
            }
        }
        Err(error) => {
            let valid = error.valid_up_to();
            if valid == 0 {
                return None;
            }
            let owned = std::str::from_utf8(&buffer[..valid]).ok()?.to_string();
            buffer.drain(..valid);
            Some(owned)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{stream_request, take_utf8_prefix, ProxyRequest, StreamEvent};
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};

    #[test]
    fn flushes_complete_text_and_clears_buffer() {
        let mut buffer = b"data: ok\n\n".to_vec();
        assert_eq!(take_utf8_prefix(&mut buffer).as_deref(), Some("data: ok\n\n"));
        assert!(buffer.is_empty());
    }

    #[test]
    fn keeps_partial_multibyte_tail_for_next_chunk() {
        // "中" 是 3 字节，这里只给前 2 字节
        let mut buffer = b"a\xE4\xB8".to_vec();
        assert_eq!(take_utf8_prefix(&mut buffer).as_deref(), Some("a"));
        assert_eq!(buffer, b"\xE4\xB8");

        buffer.extend_from_slice(b"\xAD b");
        assert_eq!(take_utf8_prefix(&mut buffer).as_deref(), Some("中 b"));
        assert!(buffer.is_empty());
    }

    /// 起一个只服务一次请求的本地 HTTP 服务，按给定的分块写入 chunked 响应。
    fn spawn_server(chunks: Vec<&'static [u8]>, delay_ms: u64) -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buf = [0u8; 2048];
            let _ = socket.read(&mut buf);
            let head = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nTransfer-Encoding: chunked\r\n\r\n";
            socket.write_all(head.as_bytes()).unwrap();
            socket.flush().unwrap();
            for chunk in chunks {
                let frame = format!("{:x}\r\n", chunk.len());
                let _ = socket.write_all(frame.as_bytes());
                let _ = socket.write_all(chunk);
                let _ = socket.write_all(b"\r\n");
                let _ = socket.flush();
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            }
            let _ = socket.write_all(b"0\r\n\r\n");
            let _ = socket.flush();
        });
        port
    }

    fn run(port: u16, max_bytes: Option<usize>) -> (Vec<StreamEvent>, Result<(), String>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        let client = reqwest::Client::builder().build().unwrap();
        let request = ProxyRequest {
            url: format!("http://127.0.0.1:{}/stream", port),
            method: "GET".into(),
            headers: None,
            body: None,
            max_bytes,
            timeout_ms: Some(3000),
        };
        let result = tauri::async_runtime::block_on(stream_request(
            &client,
            request,
            &|event| {
                sink.lock().unwrap().push(event);
                true
            },
        ));
        let collected = events.lock().unwrap();
        let copied = collected.iter().map(clone_event).collect();
        (copied, result)
    }

    fn clone_event(event: &StreamEvent) -> StreamEvent {
        match event {
            StreamEvent::Open { status, headers } => StreamEvent::Open {
                status: *status,
                headers: headers.clone(),
            },
            StreamEvent::Chunk { text } => StreamEvent::Chunk { text: text.clone() },
            StreamEvent::Error { message } => StreamEvent::Error {
                message: message.clone(),
            },
        }
    }

    #[test]
    fn splits_response_into_chunks_and_joins_split_utf8() {
        // 第一块把 "中" 的前两字节切在末尾，第二块补上第三字节
        let port = spawn_server(vec![b"ab\xE4\xB8", b"\xADcd"], 120);
        let (events, result) = run(port, None);
        assert!(result.is_ok(), "{:?}", result);

        match &events[0] {
            StreamEvent::Open { status, .. } => assert_eq!(*status, 200),
            other => panic!("首事件应是 open：{:?}", other),
        }
        let text: String = events
            .iter()
            .filter_map(|event| match event {
                StreamEvent::Chunk { text } => Some(text.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(text, "ab中cd");
        assert_eq!(events.len(), 3, "应该是 open + 两块 chunk：{:?}", events);
    }

    #[test]
    fn stops_when_response_exceeds_limit() {
        let port = spawn_server(vec![b"0123456789", b"0123456789"], 60);
        let (events, result) = run(port, Some(12));
        assert!(result.is_ok(), "{:?}", result);
        assert!(
            matches!(events.last(), Some(StreamEvent::Error { .. })),
            "超限应回传 error：{:?}",
            events
        );
    }
}
