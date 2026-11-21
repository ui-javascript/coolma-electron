use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use percent_encoding::percent_decode_str;
use reqwest::{Client, Url};
use serde::Serialize;
use serde_json::Value;
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager,
};
use tauri_plugin_opener::OpenerExt;

use crate::wiz_resources::FILE_LIMIT;

/// 前端只应传入绝对路径；相对路径无法确定基准，直接拒绝。
fn absolute(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("路径不能为空".into());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("只接受绝对路径".into());
    }
    Ok(path)
}

fn write_bytes(target: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > FILE_LIMIT {
        return Err("文件超过 32 MB".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建目录：{error}"))?;
    }
    fs::write(target, bytes).map_err(|error| format!("无法写入文件：{error}"))
}

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(absolute(&path)?.exists())
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Response, String> {
    let target = absolute(&path)?;
    let metadata = fs::metadata(&target).map_err(|error| format!("无法读取文件：{error}"))?;
    if !metadata.is_file() {
        return Err("目标不是文件".into());
    }
    if metadata.len() > FILE_LIMIT as u64 {
        return Err("文件超过 32 MB".into());
    }
    let bytes = fs::read(&target).map_err(|error| format!("无法读取文件：{error}"))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    let target = absolute(&path)?;
    let metadata = fs::metadata(&target).map_err(|error| format!("无法读取文件：{error}"))?;
    if !metadata.is_file() {
        return Err("目标不是文件".into());
    }
    if metadata.len() > FILE_LIMIT as u64 {
        return Err("文件超过 32 MB".into());
    }
    fs::read_to_string(&target).map_err(|error| format!("无法读取文件：{error}"))
}

#[tauri::command]
pub fn write_file_text(path: String, contents: String) -> Result<(), String> {
    if contents.len() > FILE_LIMIT {
        return Err("文件超过 32 MB".into());
    }
    write_bytes(&absolute(&path)?, contents.as_bytes())
}

/// 二进制写入：路径放在 `x-coolma-file` 请求头（百分号编码），请求体是原始字节。
#[tauri::command]
pub fn write_file_bytes(request: Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("x-coolma-file")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| percent_decode_str(value).decode_utf8().ok())
        .ok_or("无效的文件路径")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("文件数据格式无效".into());
    };
    write_bytes(&absolute(&path)?, bytes)
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(absolute(&path)?).map_err(|error| format!("无法创建目录：{error}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
    modified: u64,
}

#[tauri::command]
pub fn list_files(dir: String, extension: Option<String>) -> Result<Vec<FileEntry>, String> {
    let root = absolute(&dir)?;
    let entries = fs::read_dir(&root).map_err(|error| format!("无法读取目录：{error}"))?;
    let wanted = extension.map(|value| value.to_ascii_lowercase());
    let mut result = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !metadata.is_dir() {
            let matches = match &wanted {
                Some(ext) => name.to_ascii_lowercase().ends_with(ext.as_str()),
                None => true,
            };
            if !matches {
                continue;
            }
        }
        result.push(FileEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            size: metadata.len(),
            is_dir: metadata.is_dir(),
            modified: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0),
        });
    }
    Ok(result)
}

fn http_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "URL 格式无效")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.username() != ""
        || url.password().is_some()
    {
        return Err("只允许无凭据的 HTTP 或 HTTPS 地址".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    url: String,
    path: String,
) -> Result<(), String> {
    let url = http_url(&url)?;
    let target = absolute(&path)?;
    let client = app.state::<Client>();
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("下载失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载失败：HTTP {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|size| size > FILE_LIMIT as u64)
    {
        return Err("文件超过 32 MB".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("下载失败：{error}"))?
    {
        if chunk.len() > FILE_LIMIT - bytes.len() {
            return Err("文件超过 32 MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    write_bytes(&target, &bytes)
}

#[tauri::command]
pub async fn picgo_upload(app: tauri::AppHandle, paths: Vec<String>) -> Result<Value, String> {
    let paths = paths
        .iter()
        .map(|path| absolute(path).map(|path| path.to_string_lossy().into_owned()))
        .collect::<Result<Vec<_>, _>>()?;
    let client = app.state::<Client>();
    let response = client
        .post("http://127.0.0.1:36677/upload")
        .json(&serde_json::json!({ "list": paths }))
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|error| {
            if error.is_connect() {
                "PICGO_UNREACHABLE".to_string()
            } else {
                format!("PicGo 上传失败：{error}")
            }
        })?;
    if !response.status().is_success() {
        return Err(format!("PicGo 上传失败：HTTP {}", response.status()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|_| "PicGo 返回内容不是 JSON".into())
}

#[tauri::command]
pub fn reveal_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = absolute(&path)?;
    // 目标不存在时退回所在目录，避免“打开日志/主题目录”这类入口直接失败。
    let target = if target.exists() {
        target
    } else {
        target
            .parent()
            .map(Path::to_path_buf)
            .ok_or("目标路径不存在")?
    };
    app.opener()
        .reveal_item_in_dir(&target)
        .map_err(|error| format!("无法打开文件位置：{error}"))
}

#[tauri::command]
pub fn open_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = absolute(&path)?;
    fs::create_dir_all(&target).map_err(|error| format!("无法创建目录：{error}"))?;
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|error| format!("无法打开目录：{error}"))
}

#[tauri::command]
pub fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = Url::parse(url.trim()).map_err(|_| "URL 格式无效")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("只允许打开 HTTP 或 HTTPS 链接".into());
    }
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| format!("无法打开链接：{error}"))
}
