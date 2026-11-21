#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io::Write, path::PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_plugin_opener::OpenerExt;

mod credential;
mod files;
mod sidecar;
mod wiz_resources;
mod wiznote;

#[cfg(test)]
mod window_state_tests {
    use super::*;

    #[test]
    fn clamps_restored_size_to_original_minimum() {
        let size = clamped_window_size(500, 300);
        assert_eq!(size.width, 600);
        assert_eq!(size.height, 400);
        let kept = clamped_window_size(1200, 900);
        assert_eq!(kept.width, 1200);
        assert_eq!(kept.height, 900);
    }

    #[test]
    fn window_state_roundtrips_maximized_flag() {
        let state = WindowState {
            x: Some(10),
            y: Some(20),
            width: Some(900),
            height: Some(600),
            maximized: true,
        };
        let json = serde_json::to_string(&state).expect("serialize");
        let parsed: WindowState = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.x, Some(10));
        assert_eq!(parsed.height, Some(600));
        assert!(parsed.maximized);
    }
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| {
            if cfg!(debug_assertions) {
                dir.join("dev")
            } else {
                dir
            }
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn app_data_path(app: tauri::AppHandle) -> Result<PathBuf, String> {
    data_dir(&app)
}

#[tauri::command]
fn open_database_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn database_read(app: tauri::AppHandle) -> Result<Response, String> {
    match fs::read(data_dir(&app)?.join("memocast.db")) {
        Ok(bytes) => Ok(Response::new(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Response::new(Vec::new())),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn database_write(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected a binary SQLite snapshot".into());
    };
    if !bytes.starts_with(b"SQLite format 3\0") {
        return Err("Invalid SQLite snapshot".into());
    }
    let dir = data_dir(&app)?;
    let destination = dir.join("memocast.db");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(&dir).map_err(|error| error.to_string())?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| error.to_string())?;
    temporary
        .persist(destination)
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// 与原版 electron-window-state 对齐：记住主窗口的位置与大小。
/// Electron 存在 userData/window-state.json，这里存到应用数据目录，字段含义一致。
#[derive(Serialize, Deserialize, Default, Clone, Copy)]
struct WindowState {
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
    #[serde(default)]
    maximized: bool,
}

fn window_state_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    data_dir(app).ok().map(|dir| dir.join("window-state.json"))
}

fn read_window_state(app: &tauri::AppHandle) -> Option<WindowState> {
    let path = window_state_file(app)?;
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// 坐标是否落在某块屏幕里，避免换显示器后窗口恢复到看不见的地方。
fn position_is_visible(app: &tauri::AppHandle, position: PhysicalPosition<i32>) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        return true;
    };
    monitors.iter().any(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        position.x >= origin.x - 200
            && position.y >= origin.y - 100
            && position.x <= origin.x + size.width as i32 - 100
            && position.y <= origin.y + size.height as i32 - 50
    })
}

const MIN_WINDOW_WIDTH: u32 = 600;
const MIN_WINDOW_HEIGHT: u32 = 400;

fn clamped_window_size(width: u32, height: u32) -> PhysicalSize<u32> {
    // 原版有 600x400 的下限夹取，历史状态可能小于当前布局要求。
    PhysicalSize::new(width.max(MIN_WINDOW_WIDTH), height.max(MIN_WINDOW_HEIGHT))
}

fn restore_window_state(window: &WebviewWindow) {
    let app = window.app_handle();
    let Some(state) = read_window_state(app) else {
        return;
    };
    if let (Some(x), Some(y)) = (state.x, state.y) {
        let position = PhysicalPosition::new(x, y);
        if position_is_visible(app, position) {
            let _ = window.set_position(position);
        }
    }
    if let (Some(width), Some(height)) = (state.width, state.height) {
        let _ = window.set_size(clamped_window_size(width, height));
    }
    if state.maximized {
        let _ = window.maximize();
    }
}

fn persist_window_state(window: &WebviewWindow) {
    let app = window.app_handle();
    let Some(path) = window_state_file(app) else {
        return;
    };
    let mut state = read_window_state(app).unwrap_or_default();
    let maximized = window.is_maximized().unwrap_or(false);
    state.maximized = maximized;
    // 最大化时 outer_position 是屏幕原点，不能覆盖掉还原后的正常尺寸。
    if !maximized {
        if let Ok(position) = window.outer_position() {
            state.x = Some(position.x);
            state.y = Some(position.y);
        }
        if let Ok(size) = window.inner_size() {
            state.width = Some(size.width);
            state.height = Some(size.height);
        }
    }
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_vec(&state) {
        let _ = fs::write(path, json);
    }
}

fn persist_main_window_state(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        persist_window_state(&window);
    }
}

/// 原版标题栏「关闭」走的是 window-quit：二次确认后真正退出进程。
#[tauri::command]
fn window_quit(app: tauri::AppHandle) {
    persist_main_window_state(&app);
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .manage(wiznote::client().expect("Unable to initialize WizNote HTTP client"))
        .manage(wiz_resources::Sources::default())
        .manage(sidecar::Sidecar::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                restore_window_state(&window);
            }
            Ok(())
        })
        // 对齐 Electron：普通关闭只隐藏到后台（原版 close 事件里 preventDefault + hide），
        // 真正退出走 window_quit；隐藏后再次启动会由单实例插件把窗口拉回前台。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                    persist_window_state(&webview);
                }
                let _ = window.hide();
            }
        })
        .register_asynchronous_uri_scheme_protocol("coolma-resource", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                responder.respond(wiz_resources::serve(app, request).await);
            });
        })
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            database_read,
            database_write,
            app_data_path,
            open_database_folder,
            window_quit,
            files::path_exists,
            files::read_file_bytes,
            files::read_file_text,
            files::write_file_text,
            files::write_file_bytes,
            files::create_dir,
            files::list_files,
            files::download_file,
            files::document_dir,
            files::picture_dir,
            files::picgo_upload,
            files::reveal_path,
            files::open_folder,
            files::open_external,
            wiznote::wiznote_request,
            wiznote::wiznote_upload,
            wiz_resources::wiznote_cache_file,
            wiz_resources::wiznote_export_resources,
            sidecar::sidecar_send,
            sidecar::sidecar_stop,
            sidecar::sidecar_status,
            credential::credential_set,
            credential::credential_get,
            credential::credential_delete
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Coolma Tauri");
}
