//! Cloud session commands — thin wrappers over the feature service.
//!
//! All `Result<_, String>` per the accepted convention (callers only surface
//! the message). SECURITY (T3): no logging of values, arguments, or results
//! in the vault paths — see services/mod.rs.

use tauri::AppHandle;

use super::services;
use super::types::{CloudConfig, VaultStatus};

#[tauri::command]
#[specta::specta]
pub async fn load_cloud_config(app: AppHandle) -> Result<Option<CloudConfig>, String> {
    services::load_config(&app)
}

#[tauri::command]
#[specta::specta]
pub async fn save_cloud_config(app: AppHandle, config: CloudConfig) -> Result<(), String> {
    services::save_config(&app, &config)
}

#[tauri::command]
#[specta::specta]
pub async fn clear_cloud_config(app: AppHandle) -> Result<(), String> {
    services::clear_config(&app)
}

#[tauri::command]
#[specta::specta]
pub async fn vault_get(app: AppHandle) -> Result<Option<String>, String> {
    services::vault_get(&app)
}

#[tauri::command]
#[specta::specta]
pub async fn vault_set(app: AppHandle, value: String) -> Result<(), String> {
    services::vault_set(&app, &value)
}

#[tauri::command]
#[specta::specta]
pub async fn vault_clear(app: AppHandle) -> Result<(), String> {
    services::vault_clear(&app)
}

#[tauri::command]
#[specta::specta]
pub async fn read_log_tail(app: AppHandle, lines: u32) -> Result<String, String> {
    services::read_log_tail(&app, lines)
}

#[tauri::command]
#[specta::specta]
pub async fn vault_status(app: AppHandle) -> Result<VaultStatus, String> {
    services::vault_status(&app)
}
