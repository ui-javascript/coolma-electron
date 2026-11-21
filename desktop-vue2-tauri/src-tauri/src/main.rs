#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io::Write, path::PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_plugin_opener::OpenerExt;

mod credential;
mod crash;
mod files;
mod logging;
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

#[cfg(test)]
mod app_root_tests {
    use super::*;

    #[test]
    fn release_root_follows_executable_directory() {
        let exe = PathBuf::from(r"C:\Program Files\Coolma\coolma-tauri.exe");
        assert_eq!(
            app_root_from_exe(Some(&exe), false),
            PathBuf::from(r"C:\Program Files\Coolma")
        );
    }

    #[test]
    fn release_root_without_executable_is_empty() {
        assert_eq!(app_root_from_exe(None, false), PathBuf::new());
    }

    #[test]
    fn debug_root_points_at_bundle_dir() {
        let root = app_root_from_exe(None, true);
        assert!(root.ends_with("desktop-vue2-tauri"), "unexpected root: {root:?}");
    }

    #[test]
    fn root_is_not_the_data_directory() {
        // 回归点：曾把 get-app-path 误接到 app_data_path。
        let root = app_root_dir();
        assert!(!root.ends_with("dev"), "unexpected root: {root:?}");
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

/// 应用根目录（可执行文件所在目录）。
///
/// 与原版 `desktop-vue2/src-electron/main-process/api.js:332` 的 `app.getAppPath()`
/// 语义对齐：渲染层拿它拼内置资源路径（`_plugins/<id>/dist/index.html`、
/// microApp 资源根等），指向的是「应用装在哪」，不是「用户数据存哪」。
/// 早期误接 `app_data_path`，导致这些路径落到 `%LOCALAPPDATA%\cn.coolma.tauri`。
fn app_root_dir() -> PathBuf {
    app_root_from_exe(std::env::current_exe().ok().as_deref(), cfg!(debug_assertions))
}

fn app_root_from_exe(
    exe: Option<&std::path::Path>,
    is_debug: bool,
) -> PathBuf {
    if is_debug {
        // dev 下可执行文件在 target/<profile> 里，没有可比的应用根；
        // 取打包目录（src-tauri 的上一级），与原版 dev 返回仓库根的行为对齐。
        return PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    }
    exe.and_then(std::path::Path::parent)
        .map(PathBuf::from)
        .unwrap_or_default()
}

#[tauri::command]
fn app_root_path() -> Result<String, String> {
    Ok(app_root_dir().to_string_lossy().to_string())
}

/// 原版 `view.devtool`（CmdOrCtrl+Shift+P）：打开独立窗口的开发者工具。
/// 启用 tauri 的 `devtools` feature 后 release 构建同样可用，与原版一致。
#[tauri::command]
fn open_dev_tools(window: WebviewWindow) -> Result<(), String> {
    window.open_devtools();
    Ok(())
}

#[tauri::command]
fn open_database_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    // 对齐原版 api.js:329 的 `shell.showItemInFolder(userData/memocast.db)`：
    // 库文件在就定位并选中它，不在才退化成打开目录。
    let database = dir.join("memocast.db");
    if database.exists() {
        return app
            .opener()
            .reveal_item_in_dir(&database)
            .map_err(|error| error.to_string());
    }
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
            logging::install(app.handle());
            // 上次残留的 run-marker 说明进程没正常走完，落一份报告给渲染层提示
            crash::begin(app.handle());
            if let Some(window) = app.get_webview_window("main") {
                restore_window_state(&window);
                // 原版在非 PROD 下自动打开调试面板（detach），这里对应 debug 构建。
                #[cfg(debug_assertions)]
                window.open_devtools();
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            database_read,
            database_write,
            app_data_path,
            app_root_path,
            open_database_folder,
            window_quit,
            open_dev_tools,
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
            logging::append_log,
            logging::open_log_file,
            sidecar::sidecar_send,
            sidecar::sidecar_stop,
            sidecar::sidecar_status,
            credential::credential_set,
            credential::credential_get,
            credential::credential_delete,
            credential::legacy_data_dir,
            credential::legacy_key_secrets,
            credential::dpapi_unprotect,
            crash::last_crash_report
        ])
        .build(tauri::generate_context!())
        .expect("Unable to build Coolma Tauri")
        .run(|app, event| {
            // 正常退出时清掉运行标记，避免下次启动误报崩溃
            if let tauri::RunEvent::Exit = event {
                crash::end(app);
            }
        });
}
