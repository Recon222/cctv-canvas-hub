//! Shared utilities between documentation sub-features.
//!
//! Code that is used by both case_notes and notes sub-features
//! lives here to avoid duplication.

/// Common formatting utilities for documentation content.
// Template stub: unused until a documentation command calls it.
#[allow(dead_code)]
pub fn truncate_content(content: &str, max_len: usize) -> String {
    if content.chars().count() <= max_len {
        content.to_string()
    } else {
        let truncated: String = content.chars().take(max_len).collect();
        format!("{truncated}...")
    }
}
