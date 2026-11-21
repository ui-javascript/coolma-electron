// 系统凭据库（Windows 凭据管理器 / macOS Keychain / Linux Secret Service）。
// 对标 Electron 的 safeStorage：密文交给系统保管，SQLite 里只留引用。
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

#[cfg(test)]
mod tests {
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
