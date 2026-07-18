use crate::features::example_feature::{
    services::ExampleService,
    types::{ExampleData, ExampleError},
};

/// Load example data by ID.
///
/// Commands are thin wrappers that delegate to services for business logic.
/// Both `#[tauri::command]` and `#[specta::specta]` are required for
/// type-safe TypeScript binding generation.
#[tauri::command]
#[specta::specta]
pub async fn load_example_data(data_id: String) -> Result<ExampleData, ExampleError> {
    let service = ExampleService::new();
    service.load_data(&data_id).await
}

/// Save example data.
#[tauri::command]
#[specta::specta]
pub async fn save_example_data(data: ExampleData) -> Result<(), ExampleError> {
    let service = ExampleService::new();
    service.save_data(&data).await
}
