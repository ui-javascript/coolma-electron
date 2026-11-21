use std::time::Duration;

use reqwest::{Client, Method, RequestBuilder, Url};
use serde::Deserialize;
use serde_json::Value;
const RESPONSE_LIMIT: usize = 32 * 1024 * 1024;

pub fn client() -> Result<Client, reqwest::Error> {
    Client::builder()
        .timeout(Duration::from_secs(50))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
}

#[derive(Deserialize)]
pub struct WizRequest {
    url: String,
    method: String,
    token: Option<String>,
    body: Option<Value>,
}

fn endpoint(input: &str) -> Result<Url, String> {
    let url = Url::parse(input).map_err(|_| "为知笔记服务器地址无效")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !["/as/", "/ks/"]
            .iter()
            .any(|segment| url.path().contains(segment))
    {
        return Err("不支持此为知笔记接口地址".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn wiznote_request(
    client: tauri::State<'_, Client>,
    request: WizRequest,
) -> Result<Value, String> {
    let url = endpoint(&request.url)?;
    let method = match request.method.as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "PUT" => Method::PUT,
        "DELETE" => Method::DELETE,
        _ => return Err("不支持此为知笔记请求方法".into()),
    };
    let mut outgoing = client
        .request(method.clone(), url)
        .header("Accept", "application/json");
    if let Some(token) = request.token {
        outgoing = outgoing.header("X-Wiz-Token", token);
    }
    if method != Method::GET {
        if let Some(body) = request.body {
            outgoing = outgoing.json(&body);
        }
    }
    read_json(outgoing).await
}

async fn read_json(outgoing: RequestBuilder) -> Result<Value, String> {
    let mut response = outgoing.send().await.map_err(|error| {
        if error.is_timeout() {
            "连接为知笔记服务器超时"
        } else {
            "无法连接为知笔记服务器"
        }
    })?;
    if response.status().is_redirection() {
        return Err("为知笔记服务器返回了重定向，请直接填写最终地址".into());
    }
    let status = response.status();
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "无法完整读取为知笔记响应")?
    {
        if chunk.len() > RESPONSE_LIMIT - body.len() {
            return Err("为知笔记响应超过 32 MB".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body)
        .map_err(|_| format!("为知笔记服务器未返回有效 JSON（HTTP {}）", status.as_u16()))
}
