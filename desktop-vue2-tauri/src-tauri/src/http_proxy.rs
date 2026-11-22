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

#[derive(Serialize, Clone)]
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
            let _ = on_event.send(StreamEvent::Error {
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
    if on_event
        .send(StreamEvent::Open { status, headers })
        .is_err()
    {
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
                let _ = on_event.send(StreamEvent::Error {
                    message: error.to_string(),
                });
                return Ok(());
            }
        };

        total += chunk.len();
        if total > limit {
            let _ = on_event.send(StreamEvent::Error {
                message: format!("响应超过 {} 字节上限", limit),
            });
            return Ok(());
        }

        pending.extend_from_slice(&chunk);
        if let Some(text) = take_utf8_prefix(&mut pending) {
            if on_event.send(StreamEvent::Chunk { text }).is_err() {
                return Ok(());
            }
        }
    }

    if !pending.is_empty() {
        let text = String::from_utf8_lossy(&pending).to_string();
        let _ = on_event.send(StreamEvent::Chunk { text });
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
