use super::types::{Note, NoteError};

/// Business logic for note operations.
pub struct NoteService;

impl NoteService {
    pub fn new() -> Self {
        Self
    }

    /// Load a note by ID.
    pub async fn load(&self, id: &str) -> Result<Note, NoteError> {
        // Placeholder: replace with actual data loading
        Ok(Note {
            id: id.to_string(),
            title: format!("Note {id}"),
            content: "Sample content".to_string(),
            tags: vec![],
            created_at: 0.0,
            updated_at: 0.0,
        })
    }

    /// Save a note.
    pub async fn save(&self, note: &Note) -> Result<(), NoteError> {
        if note.title.is_empty() {
            return Err(NoteError::ValidationError {
                message: "Title cannot be empty".to_string(),
            });
        }
        log::info!("Saving note: {}", note.id);
        Ok(())
    }

    /// List all notes.
    pub async fn list(&self) -> Result<Vec<Note>, NoteError> {
        // Placeholder: replace with actual data listing
        Ok(vec![])
    }

    /// Delete a note by ID.
    pub async fn delete(&self, id: &str) -> Result<(), NoteError> {
        log::info!("Deleting note: {id}");
        // Placeholder: replace with actual deletion
        Ok(())
    }
}
