//! Documentation Feature
//!
//! A complex feature demonstrating nested sub-features for domains
//! that span multiple related capabilities.
//!
//! ## Sub-features
//! - `case_notes` - PDF generation and case note management
//! - `notes` - General note management
//! - `shared` - Utilities shared between sub-features

pub mod case_notes;
pub mod notes;
pub mod shared;

// Re-export sub-feature commands for bindings registration
pub use case_notes::commands as case_notes_commands;
pub use notes::commands as notes_commands;
