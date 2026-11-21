//! 异常退出检测。
//!
//! 原版用 electron-unhandled 在崩溃时弹窗，并给一键提 GitHub issue 的入口。
//! Tauri 没有等价插件：这里改成「运行标记 + 崩溃报告」——
//! 启动时写标记，正常退出时清掉；下次启动发现标记还在，说明上次没正常走完，
//! 就落一份报告让渲染层提示用户并直连日志。

use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::Local;
use serde::{Deserialize, Serialize};

const MARKER_FILE: &str = "run-marker.json";
const REPORT_FILE: &str = "last-crash.json";

#[derive(Debug, Serialize, Deserialize)]
struct RunMarker {
    started_at: String,
    pid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashReport {
    /// 上次进程的启动时间，用来告诉用户"哪一次"崩了
    pub started_at: String,
    /// 日志文件绝对路径，前端可以直接交给 open_log_file
    pub log_path: String,
}

fn data_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = crate::data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(name))
}

fn read_marker(dir: &Path) -> Option<RunMarker> {
    let text = fs::read_to_string(dir.join(MARKER_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

/// 启动：残留标记 → 写崩溃报告；随后写新标记。
fn begin_in(dir: &Path, log_path: &str) -> Option<CrashReport> {
    let report = read_marker(dir).map(|marker| CrashReport {
        started_at: marker.started_at,
        log_path: log_path.to_string(),
    });
    if let Some(report) = report.as_ref() {
        let json = serde_json::to_string(report).unwrap_or_default();
        let _ = fs::write(dir.join(REPORT_FILE), json);
    }
    let marker = RunMarker {
        started_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        pid: std::process::id(),
    };
    let json = serde_json::to_string(&marker).unwrap_or_default();
    let _ = fs::write(dir.join(MARKER_FILE), json);
    report
}

/// 正常退出：清标记与报告，下次启动就不会误报。
fn end_in(dir: &Path) {
    let _ = fs::remove_file(dir.join(MARKER_FILE));
    let _ = fs::remove_file(dir.join(REPORT_FILE));
}

pub fn begin(app: &tauri::AppHandle) {
    let Ok(dir) = crate::data_dir(app) else {
        return;
    };
    let _ = fs::create_dir_all(&dir);
    let log_path = crate::logging::log_file_path(app)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    if let Some(report) = begin_in(&dir, &log_path) {
        let _ = crate::logging::write(
            app,
            "warn",
            &format!("检测到上次异常退出（{} 启动的进程）", report.started_at),
        );
    }
}

pub fn end(app: &tauri::AppHandle) {
    if let Ok(dir) = crate::data_dir(app) {
        end_in(&dir);
    }
}

/// 渲染层启动后读一次。读完即删，避免每次启动都提示同一次崩溃。
#[tauri::command]
pub fn last_crash_report(app: tauri::AppHandle) -> Option<CrashReport> {
    let path = data_path(&app, REPORT_FILE).ok()?;
    let text = fs::read_to_string(&path).ok()?;
    let _ = fs::remove_file(path);
    serde_json::from_str(&text).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("crash-tests")
            .join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn clean_run_produces_no_report() {
        let dir = scratch("clean");
        assert!(begin_in(&dir, "C:\\log\\main.log").is_none());
        assert!(dir.join(MARKER_FILE).exists());
        end_in(&dir);
        assert!(!dir.join(MARKER_FILE).exists());
        assert!(!dir.join(REPORT_FILE).exists());
    }

    #[test]
    fn stale_marker_turns_into_report() {
        let dir = scratch("stale");
        fs::write(
            dir.join(MARKER_FILE),
            r#"{"started_at":"2026-11-20 10:00:00","pid":1234}"#,
        )
        .expect("seed marker");
        let report = begin_in(&dir, "C:\\log\\main.log").expect("报告");
        assert_eq!(report.started_at, "2026-11-20 10:00:00");
        assert!(dir.join(REPORT_FILE).exists());
        // 报告写完后新标记已就位；正常退出清掉，再启动就不会重复报
        end_in(&dir);
        assert!(begin_in(&dir, "C:\\log\\main.log").is_none());
    }

    #[test]
    fn end_clears_report_so_it_is_not_repeated() {
        let dir = scratch("cleared");
        fs::write(dir.join(MARKER_FILE), r#"{"started_at":"x","pid":1}"#).expect("seed");
        assert!(begin_in(&dir, "L").is_some());
        end_in(&dir);
        assert!(!dir.join(REPORT_FILE).exists());
        assert!(begin_in(&dir, "L").is_none());
    }
}
