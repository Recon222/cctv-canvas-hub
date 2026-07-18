use super::types::{CaseNote, CaseNoteError, PdfExportOptions};

/// Business logic for case note operations.
pub struct CaseNoteService;

impl CaseNoteService {
    pub fn new() -> Self {
        Self
    }

    /// Load a case note by ID.
    pub async fn load(&self, id: &str) -> Result<CaseNote, CaseNoteError> {
        // Placeholder: replace with actual data loading
        Ok(CaseNote {
            id: id.to_string(),
            case_id: "case-001".to_string(),
            title: format!("Case Note {id}"),
            content: "Sample content".to_string(),
            created_at: 0.0,
            updated_at: 0.0,
        })
    }

    /// Save a case note.
    pub async fn save(&self, note: &CaseNote) -> Result<(), CaseNoteError> {
        if note.title.is_empty() {
            return Err(CaseNoteError::ValidationError {
                message: "Title cannot be empty".to_string(),
            });
        }
        log::info!("Saving case note: {}", note.id);
        Ok(())
    }

    /// Export a case note to PDF.
    // Template stub: no export_pdf command is wired yet.
    #[allow(dead_code)]
    pub async fn export_pdf(
        &self,
        note: &CaseNote,
        _options: &PdfExportOptions,
    ) -> Result<Vec<u8>, CaseNoteError> {
        log::info!("Exporting case note {} to PDF", note.id);
        // Placeholder: replace with actual PDF generation
        Ok(Vec::new())
    }
}
