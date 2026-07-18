//! Recovery Feature
//!
//! Provides emergency data recovery for crash recovery and session persistence.

pub mod commands;
pub mod types;

// Re-export commonly used items (public API for app code; unused within the template)
#[allow(unused_imports)]
pub use types::RecoveryError;
