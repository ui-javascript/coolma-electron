// 系统凭据库（Windows 凭据管理器 / macOS Keychain / Linux Secret Service）。
// 对标 Electron 的 safeStorage：密文交给系统保管，SQLite 里只留引用。
use std::path::PathBuf;

use sha2::{Digest, Sha256};

const SERVICE: &str = "cn.coolma.tauri";

fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account)
        .map_err(|error| format!("无法打开系统凭据库: {error}"))
}

#[tauri::command]
pub fn credential_set(account: String, secret: String) -> Result<(), String> {
    if account.trim().is_empty() {
        return Err("凭据账号不能为空".into());
    }
    entry(&account)?
        .set_password(&secret)
        .map_err(|error| format!("无法写入系统凭据库: {error}"))
}

#[tauri::command]
pub fn credential_get(account: String) -> Result<Option<String>, String> {
    if account.trim().is_empty() {
        return Ok(None);
    }
    match entry(&account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("无法读取系统凭据库: {error}")),
    }
}

#[tauri::command]
pub fn credential_delete(account: String) -> Result<(), String> {
    if account.trim().is_empty() {
        return Ok(());
    }
    match entry(&account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("无法删除系统凭据: {error}")),
    }
}

/// 原版 Electron 的用户数据目录（`app.getPath('userData')` = `%APPDATA%\<app.getName()>`）。
/// Tauri 的 `app_data_dir()` 是 `%APPDATA%\<identifier>`，取父目录再拼原版 productName。
fn legacy_user_data_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    let roaming = app.path().app_data_dir().ok()?.parent()?.to_path_buf();
    ["coolma", "Memocast"]
        .iter()
        .map(|name| roaming.join(name))
        .find(|dir| dir.is_dir())
}

#[tauri::command]
pub fn legacy_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    legacy_user_data_dir(&app)
        .map(|dir| dir.to_string_lossy().to_string())
        .ok_or_else(|| "未找到原版 Electron 数据目录".to_string())
}

fn secret_seed(parts: &[&str]) -> String {
    Sha256::digest(parts.join("|").as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn host_names() -> Vec<String> {
    let mut names = Vec::new();
    if let Ok(name) = std::env::var("COMPUTERNAME") {
        if !name.is_empty() {
            names.push(name.clone());
            let lower = name.to_lowercase();
            if lower != name {
                names.push(lower);
            }
        }
    }
    names
}

/// 原版 v1 时期用机器派生密钥的 CryptoJS（`electron-main.js:68-79`），
/// seed = `包名|版本|userData|platform|arch|hostname`。任一项变化都会导致
/// 老密文解不开，所以这里按候选组合穷举，交给前端逐个试解。
pub fn legacy_secret_candidates(app: &tauri::AppHandle) -> Vec<String> {
    let Some(dir) = legacy_user_data_dir(app) else {
        return Vec::new();
    };
    let platform = match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    };
    let mut dirs = vec![dir.to_string_lossy().to_string()];
    if let Some(roaming) = dir.parent() {
        let memocast = roaming.join("Memocast");
        let memocast = memocast.to_string_lossy().to_string();
        if !dirs.contains(&memocast) {
            dirs.push(memocast);
        }
    }
    let versions = [env!("CARGO_PKG_VERSION")];
    let names = ["desktop-vue2", "coolma"];
    let hosts = host_names();
    let mut secrets = Vec::new();
    for name in names {
        for version in versions {
            for dir in &dirs {
                for host in &hosts {
                    secrets.push(secret_seed(&[
                        name, version, dir, platform, arch, host,
                    ]));
                }
            }
        }
    }
    secrets
}

#[tauri::command]
pub fn legacy_key_secrets(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    Ok(legacy_secret_candidates(&app))
}

/// DPAPI 解封（`CryptUnprotectData`）。用于读 Electron safeStorage 留在
/// `Local State` 里的 `os_crypt.encrypted_key`：前端剥掉 `DPAPI` 前缀后把原始字节
/// 传进来，拿回 AES-256-GCM 的原始密钥，再由前端用 WebCrypto 解密密文。
/// 只做解封、不解密内容，密文本身始终不落到 Rust 侧。
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn dpapi_unprotect(payload: Vec<u8>) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    if payload.is_empty() {
        return Err("DPAPI 输入为空".into());
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: payload.len() as u32,
        pbData: payload.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err("DPAPI 解封失败（可能不是当前用户加密的数据）".into());
    }
    let bytes = unsafe {
        std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
    };
    unsafe {
        LocalFree(output.pbData as *mut core::ffi::c_void);
    }
    Ok(bytes)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn dpapi_unprotect(_payload: Vec<u8>) -> Result<Vec<u8>, String> {
    Err("DPAPI 仅在 Windows 可用".into())
}

#[cfg(test)]
mod tests {
    /// 极简 base64 解码，仅测试用（避免为一个测试引入依赖）。
    fn b64_decode(value: &str) -> Option<Vec<u8>> {
        const TABLE: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = Vec::new();
        let mut buf = 0u32;
        let mut bits = 0u32;
        for c in value.bytes() {
            if c == b'=' || c == b'\n' || c == b'\r' {
                continue;
            }
            let idx = TABLE.iter().position(|&t| t == c)? as u32;
            buf = (buf << 6) | idx;
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                out.push((buf >> bits) as u8);
            }
        }
        Some(out)
    }

    #[test]
    #[ignore = "需要本机存在原版 Electron 数据目录（%APPDATA%\\coolma\\Local State）"]
    fn dpapi_unwraps_electron_safe_storage_key() {
        let roaming = std::env::var("APPDATA").expect("APPDATA");
        let state = std::fs::read_to_string(
            std::path::Path::new(&roaming)
                .join("coolma")
                .join("Local State"),
        )
        .expect("读取 Local State");
        let parsed: serde_json::Value = serde_json::from_str(&state).expect("解析 Local State");
        let encoded = parsed["os_crypt"]["encrypted_key"]
            .as_str()
            .expect("os_crypt.encrypted_key 缺失");
        let bytes = b64_decode(encoded).expect("base64 解码");
        assert_eq!(&bytes[..5], b"DPAPI");
        let raw = super::dpapi_unprotect(bytes[5..].to_vec()).expect("DPAPI 解封");
        // Electron 在 Windows 上用 AES-256-GCM，密钥固定 32 字节
        assert_eq!(raw.len(), 32, "解出的密钥长度异常: {}", raw.len());
    }

    // 真实系统凭据库的往返验证，默认跳过（会写入 Windows 凭据管理器）。
    #[test]
    #[ignore = "需要真实系统凭据库，cargo test --ignored 手动跑"]
    fn credential_roundtrip() {
        let account = format!("coolma-selftest-{}", std::process::id());
        super::credential_set(account.clone(), "secret-value".into()).expect("set");
        let value = super::credential_get(account.clone()).expect("get");
        assert_eq!(value.as_deref(), Some("secret-value"));
        super::credential_delete(account.clone()).expect("delete");
        let after = super::credential_get(account).expect("get after delete");
        assert!(after.is_none());
    }
}
