use serde::{Deserialize, Serialize};
use specta::Type;

/// A general note.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: f64,
    pub updated_at: f64,
}

/// Errors specific to note operations.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum NoteError {
    NotFound { id: String },
    ValidationError { message: String },
    IoError { message: String },
}

impl std::fmt::Display for NoteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NoteError::NotFound { id } => write!(f, "Note not found: {id}"),
            NoteError::ValidationError { message } => write!(f, "Validation error: {message}"),
            NoteError::IoError { message } => write!(f, "IO error: {message}"),
        }
    }
}
