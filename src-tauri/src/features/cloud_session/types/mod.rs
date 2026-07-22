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
    /// Idle-lock durability (PR #9 H1): set on lock, cleared on
    /// unlock/sign-out, so a reload/relaunch re-enters `locked` instead
    /// of `active`. Not a secret — it gates nothing by itself (the
    /// session stays in the vault); absent on pre-M6 files ⇒ unlocked.
    #[serde(default)]
    pub locked: bool,
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
