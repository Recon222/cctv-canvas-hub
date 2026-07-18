use super::{
    services::CaseNoteService,
    types::{CaseNote, CaseNoteError},
};

/// Load a case note by ID.
#[tauri::command]
#[specta::specta]
pub async fn load_case_note(note_id: String) -> Result<CaseNote, CaseNoteError> {
    let service = CaseNoteService::new();
    service.load(&note_id).await
}

/// Save a case note.
#[tauri::command]
#[specta::specta]
pub async fn save_case_note(note: CaseNote) -> Result<(), CaseNoteError> {
    let service = CaseNoteService::new();
    service.save(&note).await
}
