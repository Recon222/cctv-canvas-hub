use serde::{Deserialize, Serialize};
use specta::Type;

/// Application preferences that persist to disk.
/// Only contains settings that should be saved between sessions.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AppPreferences {
    pub theme: String,
    /// Global shortcut for quick pane (e.g., "CommandOrControl+Shift+.")
    /// If None, uses the default shortcut
    pub quick_pane_shortcut: Option<String>,
    /// User's preferred language (e.g., "en", "es", "de")
    /// If None, uses system locale detection
    pub language: Option<String>,
    /// Mapbox access token for the map view (M3).
    /// If None, the map renders its token-gate designed state.
    pub mapbox_token: Option<String>,
    /// Map style id: "standard-satellite" | "standard" | "dark-v11".
    /// If None, uses the satellite-night default.
    pub map_style: Option<String>,
    /// Minutes of inactivity before the board locks (M6).
    /// If None, uses the default of 15.
    pub idle_lock_minutes: Option<u32>,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            quick_pane_shortcut: None, // None means use default
            language: None,            // None means use system locale
            mapbox_token: None,        // None means token-gate state
            map_style: None,           // None means satellite-night default
            idle_lock_minutes: None,   // None means default 15
        }
    }
}

/// Validates theme value.
pub fn validate_theme(theme: &str) -> Result<(), String> {
    match theme {
        "light" | "dark" | "system" => Ok(()),
        _ => Err("Invalid theme: must be 'light', 'dark', or 'system'".to_string()),
    }
}

/// Validates string input length (by character count, not bytes).
pub fn validate_string_input(input: &str, max_len: usize, field_name: &str) -> Result<(), String> {
    let char_count = input.chars().count();
    if char_count > max_len {
        return Err(format!("{field_name} too long (max {max_len} characters)"));
    }
    Ok(())
}
