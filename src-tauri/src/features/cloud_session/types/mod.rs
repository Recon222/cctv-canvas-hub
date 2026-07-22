use serde::{Deserialize, Serialize};
use specta::Type;

/// Cloud connection config — designed-public values (project URL +
/// RLS-bounded publishable key), stored as plain JSON in app data (T4).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CloudConfig {
    /// `https://{ref}.supabase.co`
    pub url: String,
    /// `sb_publishable_…` — designed-public, RLS-bounded.
    pub publishable_key: String,
    /// Convenience for the re-auth prompt; NOT a secret.
    pub signed_in_email: Option<String>,
}

/// Presence report for the ProcessPanel's SYSTEM lane (6.3B). Status
/// only — nothing here ever decrypts (`vault_get` is the wrong tool
/// for status; status must never touch plaintext).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct VaultStatus {
    pub config_present: bool,
    pub vault_present: bool,
    pub keyring_key_present: bool,
    /// Last vault write, epoch ms (f64 — specta rejects u64).
    pub vault_mtime_ms: Option<f64>,
}
