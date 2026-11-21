#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io::Write, path::PathBuf};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager,
};
use tauri_plugin_opener::OpenerExt;

mod files;
mod wiz_resources;
mod wiznote;

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

fn main() {
    tauri::Builder::default()
        .manage(wiznote::client().expect("Unable to initialize WizNote HTTP client"))
        .manage(wiz_resources::Sources::default())
        .register_asynchronous_uri_scheme_protocol("coolma-resource", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                responder.respond(wiz_resources::serve(app, request).await);
            });
        })
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
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
            wiz_resources::wiznote_export_resources
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Coolma Tauri");
}
