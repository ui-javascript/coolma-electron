//! 文件日志：对齐原版 Electron 的 electron-log 落盘行为。
//!
//! 原版把主进程 console 全部改写到 `userData/logs/<年>/<月>/main.log`，
//! 单文件超过 5 MB 自动轮转；「打开日志」入口用 shell.showItemInFolder 定位到该文件。
//! Tauri 版没有主进程 console，改为由 Rust 提供 append_log 命令，渲染层与 Rust 侧
//! （启动、panic）共用同一份文件。

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use chrono::{Datelike, Local};
use tauri_plugin_opener::OpenerExt;

/// 原版 electron-log 的默认 maxSize 是 5 MB。
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const MAX_MESSAGE_BYTES: usize = 4 * 1024;

fn logs_dir_at(data: &Path, year: i32, month: u32) -> PathBuf {
    // 原版用 `new Date().getMonth() + 1` 直接拼目录，月份不补零，这里保持一致。
    data.join("logs").join(year.to_string()).join(month.to_string())
}

fn log_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let now = Local::now();
    Ok(logs_dir_at(&crate::data_dir(app)?, now.year(), now.month()))
}

fn append(path: &Path, line: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    if fs::metadata(path)
        .map(|meta| meta.len() > MAX_LOG_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::rename(path, path.with_file_name("main.old.log"));
    }
    let mut file = fs::OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(line.as_bytes())?;
    file.write_all(b"\n")
}

pub fn write(app: &tauri::AppHandle, level: &str, message: &str) -> Result<(), String> {
    let path = log_dir(app)?.join("main.log");
    let stamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    append(&path, &format!("{stamp} [{level}] {message}"))
        .map_err(|error| format!("无法写入日志：{error}"))
}

#[tauri::command]
pub fn append_log(app: tauri::AppHandle, level: String, message: String) -> Result<(), String> {
    if message.len() > MAX_MESSAGE_BYTES {
        return Err("日志内容过长".into());
    }
    let level = match level.as_str() {
        "debug" | "warn" | "error" => level.as_str(),
        _ => "info",
    };
    write(&app, level, &message)
}

/// 原版 open-log-files 是 shell.showItemInFolder(日志文件)，这里同样定位到文件本身。
#[tauri::command]
pub fn open_log_file(app: tauri::AppHandle) -> Result<(), String> {
    let path = log_dir(&app)?.join("main.log");
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| format!("无法创建日志目录：{error}"))?;
    }
    if !path.exists() {
        fs::write(&path, "").map_err(|error| format!("无法创建日志文件：{error}"))?;
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| format!("无法打开日志文件：{error}"))
}

/// 启动时写一行版本信息，并把 panic 也落到同一个文件，方便排查无控制台的 release 崩溃。
pub fn install(app: &tauri::AppHandle) {
    let _ = write(
        app,
        "info",
        &format!("Coolma Tauri {} 启动", env!("CARGO_PKG_VERSION")),
    );

    let previous = std::panic::take_hook();
    let handle = app.clone();
    std::panic::set_hook(Box::new(move |info| {
        let _ = write(&handle, "error", &format!("panic: {info}"));
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 不用系统临时目录：本机构建环境的 TMP 指向受限目录，这里落在 target 下。
    fn scratch (name: &str) -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("log-tests")
            .join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn month_directory_is_not_zero_padded() {
        let dir = logs_dir_at(Path::new("C:\\data"), 2026, 3);
        assert!(dir.ends_with("logs/2026/3") || dir.ends_with("logs\\2026\\3"));
    }

    #[test]
    fn appends_newline_and_creates_directory() {
        let temp = scratch("append");
        let path = temp.join("logs").join("2026").join("11").join("main.log");
        append(&path, "2026-11-21 15:04:05.123 [info] 第一行").expect("append");
        append(&path, "2026-11-21 15:04:06.000 [warn] 第二行").expect("append");
        let text = fs::read_to_string(&path).expect("read");
        assert_eq!(
            text,
            "2026-11-21 15:04:05.123 [info] 第一行\n2026-11-21 15:04:06.000 [warn] 第二行\n"
        );
    }

    #[test]
    fn rotates_when_file_exceeds_limit() {
        let temp = scratch("rotate");
        let path = temp.join("main.log");
        fs::write(&path, vec![b'x'; MAX_LOG_BYTES as usize + 1]).expect("seed");
        append(&path, "新的一行").expect("append");
        assert!(path.with_file_name("main.old.log").exists());
        assert_eq!(fs::read_to_string(&path).expect("read"), "新的一行\n");
    }
}
