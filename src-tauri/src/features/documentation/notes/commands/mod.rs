use super::{
    services::NoteService,
    types::{Note, NoteError},
};

/// Load a note by ID.
#[tauri::command]
#[specta::specta]
pub async fn load_note(note_id: String) -> Result<Note, NoteError> {
    let service = NoteService::new();
    service.load(&note_id).await
}

/// Save a note.
#[tauri::command]
#[specta::specta]
pub async fn save_note(note: Note) -> Result<(), NoteError> {
    let service = NoteService::new();
    service.save(&note).await
}

/// List all notes.
#[tauri::command]
#[specta::specta]
pub async fn list_notes() -> Result<Vec<Note>, NoteError> {
    let service = NoteService::new();
    service.list().await
}

/// Delete a note by ID.
#[tauri::command]
#[specta::specta]
pub async fn delete_note(note_id: String) -> Result<(), NoteError> {
    let service = NoteService::new();
    service.delete(&note_id).await
}
