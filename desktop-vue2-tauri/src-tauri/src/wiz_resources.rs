use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

use percent_encoding::{percent_decode_str, utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::{Client, Url};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{
    http::{Request, Response, StatusCode},
    ipc::{InvokeBody, Request as IpcRequest},
    Manager,
};

pub const FILE_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Default)]
pub struct Sources(Mutex<HashMap<String, Url>>);

fn segments(path: &str, count: usize) -> Option<Vec<String>> {
    let parts: Vec<_> = path
        .split('/')
        .map(|part| {
            let decoded = percent_decode_str(part).decode_utf8().ok()?;
            if decoded.is_empty()
                || decoded == "."
                || decoded == ".."
                || decoded.len() > 512
                || decoded
                    .chars()
                    .any(|c| c == '/' || c == '\\' || c.is_control())
            {
                return None;
            }
            Some(decoded.into_owned())
        })
        .collect::<Option<_>>()?;
    (parts.len() == count).then_some(parts)
}

pub fn note_ids(url: &Url, route: &str) -> Option<Vec<String>> {
    segments(url.path().rsplit_once(route)?.1, 2)
}

fn key(kb: &str, note: &str, name: &str) -> String {
    Sha256::digest(format!("{kb}\0{note}\0{name}"))
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn official_https(url: &Url) -> bool {
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|host| host == "wiz.cn" || host.ends_with(".wiz.cn"))
}

fn allowed_source(note_url: &Url, source: &Url) -> bool {
    source.username().is_empty()
        && source.password().is_none()
        && source.fragment().is_none()
        && (note_url.origin() == source.origin()
            || (official_https(note_url) && official_https(source)))
}

impl Sources {
    pub fn register_note(&self, url: &Url, data: &Value) {
        let Some(ids) = note_ids(url, "/ks/note/download/") else {
            return;
        };
        if data["returnCode"].as_u64() != Some(200) && data["code"].as_u64() != Some(200) {
            return;
        }
        let Some(resources) = data["result"]["resources"].as_array() else {
            return;
        };
        let Ok(mut sources) = self.0.lock() else {
            return;
        };
        for resource in resources {
            let (Some(name), Some(source)) = (resource["name"].as_str(), resource["url"].as_str())
            else {
                continue;
            };
            let Ok(source) = url.join(source) else {
                continue;
            };
            if !allowed_source(url, &source) {
                continue;
            }
            if sources.len() >= 4096 {
                if let Some(old) = sources.keys().next().cloned() {
                    sources.remove(&old);
                }
            }
            sources.insert(key(&ids[0], &ids[1], name), source);
        }
    }
}

fn cache_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    Ok(crate::data_dir(app)?.join("wiznote-resources").join(key))
}

fn write_cache(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().expect("resource cache has a parent");
    fs::create_dir_all(dir)?;
    let mut file = tempfile::NamedTempFile::new_in(dir)?;
    file.write_all(bytes)?;
    file.persist(path)?;
    Ok(())
}

#[tauri::command]
pub fn wiznote_cache_file(app: tauri::AppHandle, request: IpcRequest<'_>) -> Result<(), String> {    let path = request
        .headers()
        .get("x-coolma-resource")
        .and_then(|value| value.to_str().ok())
        .and_then(|path| segments(path, 3))
        .ok_or("无效的笔记资源标识")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("文件数据格式无效".into());
    };
    if bytes.len() > FILE_LIMIT {
        return Err("笔记资源超过 32 MB".into());
    }
    write_cache(
        &cache_path(&app, &key(&path[0], &path[1], &path[2]))?,
        bytes,
    )
    .map_err(|_| "无法缓存笔记资源".into())
}

async fn download(client: &Client, url: Url) -> Result<Vec<u8>, StatusCode> {
    // The URLs returned with a note authorize the download themselves. Never forward the account token.
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !response.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }
    if response
        .content_length()
        .is_some_and(|size| size > FILE_LIMIT as u64)
    {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?
    {
        if chunk.len() > FILE_LIMIT - bytes.len() {
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn image_type(name: &str) -> Option<&'static str> {
    match name.rsplit_once('.')?.1.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

async fn resource(
    app: &tauri::AppHandle,
    request: Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, StatusCode> {
    if request.method() != "GET" {
        return Err(StatusCode::METHOD_NOT_ALLOWED);
    }
    let path = request.uri().path().strip_prefix('/').unwrap_or_default();
    let path = segments(path, 3).ok_or(StatusCode::NOT_FOUND)?;
    let key = key(&path[0], &path[1], &path[2]);
    let cache = cache_path(app, &key).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let bytes = match fs::read(&cache) {
        Ok(bytes) => bytes,
        Err(_) => {
            let sources = app.state::<Sources>();
            let url = sources
                .0
                .lock()
                .ok()
                .and_then(|sources| sources.get(&key).cloned())
                .ok_or(StatusCode::NOT_FOUND)?;
            let bytes = download(&app.state::<Client>(), url).await?;
            let _ = write_cache(&cache, &bytes);
            bytes
        }
    };
    let content_type = image_type(&path[2]);
    let mut response = Response::builder()
        .header(
            "Content-Type",
            content_type.unwrap_or("application/octet-stream"),
        )
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "sandbox; default-src 'none'");
    if content_type.is_none() {
        response = response.header(
            "Content-Disposition",
            format!(
                "attachment; filename*=UTF-8''{}",
                utf8_percent_encode(&path[2], NON_ALPHANUMERIC)
            ),
        );
    }
    response
        .body(bytes)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn serve(app: tauri::AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    resource(&app, request)
        .await
        .unwrap_or_else(|status| Response::builder().status(status).body(Vec::new()).unwrap())
}

fn valid_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value != "."
        && value != ".."
        && !value.contains(['/', '\\'])
        && !value.chars().any(char::is_control)
}

/// 导出笔记时把已缓存的图片复制到 Markdown 旁边的 `ExportImage/`。
/// 只复制缓存里已有的文件，未加载过的图片保持占位，与原版 Electron 行为一致。
#[tauri::command]
pub fn wiznote_export_resources(
    app: tauri::AppHandle,
    kb_guid: String,
    doc_guid: String,
    names: Vec<String>,
    target_dir: String,
) -> Result<Vec<String>, String> {
    if !valid_segment(&kb_guid) || !valid_segment(&doc_guid) {
        return Err("无效的笔记标识".into());
    }
    let target = PathBuf::from(target_dir.trim());
    if !target.is_absolute() {
        return Err("导出目录必须是绝对路径".into());
    }
    let export = target.join("ExportImage");
    fs::create_dir_all(&export).map_err(|_| "无法创建 ExportImage 目录".to_string())?;
    let mut copied = Vec::new();
    for name in names.into_iter().take(512) {
        if !valid_segment(&name) {
            continue;
        }
        let source = cache_path(&app, &key(&kb_guid, &doc_guid, &name))?;
        if !source.is_file() {
            continue;
        }
        if fs::copy(&source, export.join(&name)).is_ok() {
            copied.push(name);
        }
    }
    Ok(copied)
}
