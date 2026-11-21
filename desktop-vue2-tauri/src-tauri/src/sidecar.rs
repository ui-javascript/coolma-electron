//! 博客构建 / SFTP 用的 Node sidecar。
//!
//! 渲染层把一条 JSON 请求写到 sidecar 的 stdin，sidecar 把结果和事件逐行
//! 写到 stdout，这里再把每一行转发成 Tauri 事件 `sidecar-line`，由前端
//! `src/desktop/sidecar.js` 解析。延用 Electron 版的「长驻子进程」语义：
//! 构建中途可以 cancel，进度能持续推送。

use std::{
    env,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::Mutex,
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct Sidecar {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
}

fn script_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = env::var("COOLMA_SIDECAR") {
        if !path.is_empty() {
            candidates.push(PathBuf::from(path));
        }
    }
    if let Ok(path) = app
        .path()
        .resolve("sidecar/node-bridge.js", tauri::path::BaseDirectory::Resource)
    {
        candidates.push(path);
    }
    if let Ok(exe) = env::current_exe() {
        // 开发态：src-tauri/target/debug/coolma-tauri.exe -> desktop-vue2-tauri/sidecar
        if let Some(dir) = exe.parent() {
            for depth in 1..=4 {
                let mut base = dir.to_path_buf();
                for _ in 0..depth {
                    base = match base.parent() {
                        Some(parent) => parent.to_path_buf(),
                        None => break,
                    };
                }
                candidates.push(base.join("sidecar").join("node-bridge.js"));
            }
        }
    }
    if let Ok(cwd) = env::current_dir() {
        // 开发态：cwd 通常是 src-tauri 或 desktop-vue2-tauri
        candidates.push(cwd.join("sidecar").join("node-bridge.js"));
        candidates.push(cwd.join("..").join("sidecar").join("node-bridge.js"));
    }
    candidates
}

fn locate_script(app: &AppHandle) -> Result<PathBuf, String> {
    script_candidates(app)
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "找不到 sidecar/node-bridge.js".to_string())
}

fn node_candidates(app: &AppHandle, script_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = env::var("COOLMA_NODE") {
        if !path.is_empty() {
            candidates.push(PathBuf::from(path));
        }
    }
    if let Ok(resource) = app
        .path()
        .resolve("node", tauri::path::BaseDirectory::Resource)
    {
        candidates.push(resource.join("node.exe"));
        candidates.push(resource.join("node"));
    }
    // 开发态常见位置：sidecar 目录的上一级放了便携 node
    candidates.push(script_dir.join("node.exe"));
    candidates.push(script_dir.join("node"));
    // 打包态：prepare-sidecar.js 把 Node 放进 sidecar/node
    candidates.push(script_dir.join("node").join("node.exe"));
    candidates.push(script_dir.join("node").join("node"));
    candidates
}

fn locate_node(app: &AppHandle, script_dir: &Path) -> String {
    node_candidates(app, script_dir)
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "node".to_string())
}

fn dependency_path(script_dir: &Path) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Ok(value) = env::var("COOLMA_SIDECAR_DEPS") {
        if !value.is_empty() {
            parts.push(value);
        }
    }
    let bundled = script_dir.join("node_modules");
    if bundled.is_dir() {
        parts.push(bundled.to_string_lossy().to_string());
    }
    // 开发态兜底：直接借用 desktop-vue2 已经装好的 fs-extra / ssh2。
    // src-tauri/sidecar -> src-tauri -> desktop-vue2-tauri -> 仓库根 -> desktop-vue2
    let dev = script_dir
        .join("..")
        .join("..")
        .join("..")
        .join("desktop-vue2")
        .join("node_modules");
    if dev.is_dir() {
        parts.push(dev.to_string_lossy().to_string());
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(if cfg!(windows) { ";" } else { ":" }))
    }
}

fn spawn(app: &AppHandle, state: &Sidecar) -> Result<(), String> {
    let script = locate_script(app)?;
    let script_dir = script.parent().map(Path::to_path_buf).unwrap_or_default();
    let node = locate_node(app, &script_dir);
    let mut command = Command::new(&node);
    command
        .arg(&script)
        .current_dir(&script_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(deps) = dependency_path(&script_dir) {
        command.env("NODE_PATH", deps);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("启动 sidecar 失败（{}）：{}", node, error))?;
    let stdout = child.stdout.take().ok_or("sidecar stdout 不可用")?;
    let stderr = child.stderr.take().ok_or("sidecar stderr 不可用")?;
    let stdin = child.stdin.take().ok_or("sidecar stdin 不可用")?;

    let out_app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let _ = out_app.emit("sidecar-line", line);
        }
        // 进程退出后清掉句柄，下次请求会重新拉起。
        let state = out_app.state::<Sidecar>();
        if let Ok(mut stdin) = state.stdin.lock() {
            *stdin = None;
        }
        if let Ok(mut child) = state.child.lock() {
            if let Some(mut process) = child.take() {
                let _ = process.wait();
            }
        }
        let _ = out_app.emit("sidecar-exit", ());
    });

    let err_app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            eprintln!("[sidecar] {line}");
            let _ = err_app.emit("sidecar-log", line);
        }
    });

    *state.stdin.lock().map_err(|error| error.to_string())? = Some(stdin);
    *state.child.lock().map_err(|error| error.to_string())? = Some(child);
    Ok(())
}

#[tauri::command]
pub fn sidecar_send(app: AppHandle, state: State<'_, Sidecar>, line: String) -> Result<(), String> {
    let running = state
        .child
        .lock()
        .map_err(|error| error.to_string())?
        .is_some();
    if !running {
        spawn(&app, &state)?;
    }
    let mut guard = state.stdin.lock().map_err(|error| error.to_string())?;
    let stdin = guard.as_mut().ok_or("sidecar 尚未就绪")?;
    writeln!(stdin, "{line}").map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn sidecar_stop(state: State<'_, Sidecar>) -> Result<(), String> {
    {
        let mut stdin = state.stdin.lock().map_err(|error| error.to_string())?;
        *stdin = None;
    }
    let mut child = state.child.lock().map_err(|error| error.to_string())?;
    if let Some(mut process) = child.take() {
        let _ = process.kill();
        let _ = process.wait();
    }
    Ok(())
}

/// 侧车脚本的依赖是否就绪（打包前需要把 fs-extra / ssh2 装进 sidecar/node_modules）。
#[tauri::command]
pub fn sidecar_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let script = locate_script(&app)?;
    let script_dir = script.parent().map(Path::to_path_buf).unwrap_or_default();
    let node = locate_node(&app, &script_dir);
    let deps = dependency_path(&script_dir);
    Ok(serde_json::json!({
        "script": script.to_string_lossy(),
        "node": node,
        "nodeFound": Path::new(&node).is_file(),
        "deps": deps,
        "depsFound": script_dir.join("node_modules").is_dir(),
        "services": service_candidates(&script_dir).into_iter().find(|path| path.is_dir()).map(|path| path.to_string_lossy().to_string())
    }))
}

fn service_candidates(script_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = env::var("COOLMA_SERVICE_DIR") {
        if !path.is_empty() {
            candidates.push(PathBuf::from(path));
        }
    }
    candidates.push(script_dir.join("services"));
    candidates.push(
        script_dir
            .join("..")
            .join("..")
            .join("desktop-vue2")
            .join("src-electron")
            .join("main-process")
            .join("service"),
    );
    candidates
}

