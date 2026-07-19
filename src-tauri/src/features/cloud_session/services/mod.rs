//! Config + vault persistence for the cloud session.
//!
//! SECURITY (T3): vault code paths never log or debug-format values,
//! arguments, or results — the decrypted session JSON carries the refresh
//! token. Do not add logging here (the preferences `{preferences:?}` idiom
//! must not be copied — it would bypass the vault via the on-disk log).

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::types::CloudConfig;

const CONFIG_FILE: &str = "cloud-config.json";
const VAULT_FILE: &str = "session.vault";
/// Keychain coordinates for the vault key (doc 01 §5.3).
const KEYRING_SERVICE: &str = "com.tauri-app.app";
const KEYRING_ENTRY: &str = "session-vault-key";

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    Ok(dir)
}

/// Atomic write (temp file + rename) — a crash mid-write degrades to a
/// missing/corrupt file that parses as absent, never a half-file.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, bytes).map_err(|e| format!("Failed to write file: {e}"))?;
    if let Err(rename_err) = std::fs::rename(&temp, path) {
        // Clean up the temp file to avoid leaving orphans on disk.
        let _ = std::fs::remove_file(&temp);
        return Err(format!("Failed to finalize file: {rename_err}"));
    }
    Ok(())
}

// ---- Cloud config (plain JSON — designed-public values, T4) ----

pub fn load_config(app: &AppHandle) -> Result<Option<CloudConfig>, String> {
    let path = app_data_dir(app)?.join(CONFIG_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read cloud config: {e}"))?;
    let config: CloudConfig = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse cloud config: {e}"))?;
    Ok(Some(config))
}

pub fn save_config(app: &AppHandle, config: &CloudConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize cloud config: {e}"))?;
    atomic_write(&app_data_dir(app)?.join(CONFIG_FILE), json.as_bytes())
}

pub fn clear_config(app: &AppHandle) -> Result<(), String> {
    remove_if_exists(&app_data_dir(app)?.join(CONFIG_FILE), "cloud config")
}

// ---- Session vault (AES-256-GCM; key in OS keychain — AD5, G5) ----

/// Read the vault key from the OS keychain, creating it on first use.
///
/// ONLY `keyring::Error::NoEntry` takes the create path. Any other keyring
/// error fails closed and propagates: a transient keychain failure must
/// never be treated as absence — regenerating over the stored key would
/// make every later `open` fail `AuthFailed` and silently force re-sign-in
/// on each relaunch (Flow B).
fn get_or_create_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ENTRY)
        .map_err(|e| format!("Failed to access keychain: {e}"))?;
    match entry.get_secret() {
        // map_err discards the Vec — key material must never reach an error string.
        Ok(bytes) => bytes
            .try_into()
            .map_err(|_| "Keychain vault key has unexpected length".to_string()),
        Err(keyring::Error::NoEntry) => {
            let key = secure_vault::generate_key();
            entry
                .set_secret(&key)
                .map_err(|e| format!("Failed to store vault key in keychain: {e}"))?;
            Ok(key)
        }
        Err(e) => Err(format!("Failed to read vault key from keychain: {e}")),
    }
}

pub fn vault_get(app: &AppHandle) -> Result<Option<String>, String> {
    let path = app_data_dir(app)?.join(VAULT_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let sealed = std::fs::read(&path).map_err(|e| format!("Failed to read session vault: {e}"))?;
    let key = get_or_create_key()?;
    let plaintext = secure_vault::open(&key, &sealed)
        .map_err(|e| format!("Failed to open session vault: {e}"))?;
    // map_err discards the FromUtf8Error — it carries the decrypted bytes.
    String::from_utf8(plaintext)
        .map(Some)
        .map_err(|_| "Session vault content is not valid UTF-8".to_string())
}

pub fn vault_set(app: &AppHandle, value: &str) -> Result<(), String> {
    let key = get_or_create_key()?;
    let sealed = secure_vault::seal(&key, value.as_bytes())
        .map_err(|e| format!("Failed to seal session vault: {e}"))?;
    atomic_write(&app_data_dir(app)?.join(VAULT_FILE), &sealed)
}

pub fn vault_clear(app: &AppHandle) -> Result<(), String> {
    remove_if_exists(&app_data_dir(app)?.join(VAULT_FILE), "session vault")
}

fn remove_if_exists(path: &Path, what: &str) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to clear {what}: {e}")),
    }
}
