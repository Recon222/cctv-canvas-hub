//! Example Feature
//!
//! This module demonstrates the feature-based backend structure.
//! Each feature owns its commands, services, and types.
//!
//! ## Structure
//! - `commands/` - Tauri command handlers (thin wrappers delegating to services)
//! - `services/` - Business logic (DB access, file I/O, etc.)
//! - `types/` - Feature-specific types with specta integration

pub mod commands;
pub mod services;
pub mod types;

// Re-export commonly used items (public API for app code; unused within the template)
#[allow(unused_imports)]
pub use types::{ExampleData, ExampleError};
