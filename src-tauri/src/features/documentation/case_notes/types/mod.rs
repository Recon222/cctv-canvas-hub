use serde::{Deserialize, Serialize};
use specta::Type;

/// A case note document.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CaseNote {
    pub id: String,
    pub case_id: String,
    pub title: String,
    pub content: String,
    pub created_at: f64,
    pub updated_at: f64,
}

/// Options for PDF export.
// Template stub: consumed by CaseNoteService::export_pdf once wired to a command.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PdfExportOptions {
    pub include_header: bool,
    pub include_footer: bool,
    pub page_size: String,
}

/// Errors specific to case note operations.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum CaseNoteError {
    NotFound { id: String },
    ValidationError { message: String },
    ExportError { message: String },
    IoError { message: String },
}

impl std::fmt::Display for CaseNoteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CaseNoteError::NotFound { id } => write!(f, "Case note not found: {id}"),
            CaseNoteError::ValidationError { message } => {
                write!(f, "Validation error: {message}")
            }
            CaseNoteError::ExportError { message } => write!(f, "Export error: {message}"),
            CaseNoteError::IoError { message } => write!(f, "IO error: {message}"),
        }
    }
}
