//! Feature modules organized by domain.
//!
//! Each feature owns its commands, services, and types.
//! Features communicate via Tauri events, not direct calls.

pub mod cloud_session;
pub mod example_feature;
pub mod notifications;
pub mod preferences;
pub mod quick_pane;
pub mod recovery;
pub mod view_windows;

// Re-export all feature commands for registration in bindings.rs
pub use cloud_session::commands as cloud_session_commands;
pub use example_feature::commands as example_feature_commands;
pub use notifications::commands as notifications_commands;
pub use preferences::commands as preferences_commands;
pub use quick_pane::commands as quick_pane_commands;
pub use recovery::commands as recovery_commands;
pub use view_windows::commands as view_windows_commands;
