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
