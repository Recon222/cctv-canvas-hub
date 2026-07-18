use crate::features::example_feature::types::{ExampleData, ExampleError};

/// Business logic for the example feature.
///
/// Commands are thin wrappers that delegate to service methods.
/// This separation keeps command handlers focused on IPC concerns
/// while business logic stays testable and reusable.
pub struct ExampleService;

impl ExampleService {
    pub fn new() -> Self {
        Self
    }

    /// Load example data by ID.
    pub async fn load_data(&self, id: &str) -> Result<ExampleData, ExampleError> {
        // Placeholder: replace with actual data loading logic
        Ok(ExampleData {
            id: id.to_string(),
            name: format!("Example {id}"),
            value: 42,
        })
    }

    /// Save example data.
    pub async fn save_data(&self, data: &ExampleData) -> Result<(), ExampleError> {
        if data.name.is_empty() {
            return Err(ExampleError::ValidationError {
                message: "Name cannot be empty".to_string(),
            });
        }

        log::info!("Saving example data: {}", data.id);
        // Placeholder: replace with actual data saving logic
        Ok(())
    }
}
