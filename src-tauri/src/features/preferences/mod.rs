//! Preferences Feature
//!
//! Manages application preferences including theme, language, and shortcuts.
//! Preferences persist to disk as JSON.

pub mod commands;
pub mod types;

// Re-export commonly used items (public API for app code; unused within the template)
#[allow(unused_imports)]
pub use types::AppPreferences;
