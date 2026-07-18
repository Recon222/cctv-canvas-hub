use serde::{Deserialize, Serialize};
use specta::Type;

/// Example data structure demonstrating feature-scoped types.
///
/// All feature types need these derives for tauri-specta integration:
/// - `Serialize`/`Deserialize` for JSON serialization over IPC
/// - `Type` for automatic TypeScript binding generation
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExampleData {
    pub id: String,
    pub name: String,
    pub value: i32,
}

/// Feature-specific error type.
///
/// Uses `#[serde(tag = "type")]` for discriminated union in TypeScript,
/// allowing the frontend to match on error variants by the `type` field.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum ExampleError {
    NotFound { id: String },
    ValidationError { message: String },
    IoError { message: String },
}

impl std::fmt::Display for ExampleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExampleError::NotFound { id } => write!(f, "Not found: {id}"),
            ExampleError::ValidationError { message } => {
                write!(f, "Validation error: {message}")
            }
            ExampleError::IoError { message } => write!(f, "IO error: {message}"),
        }
    }
}

impl From<std::io::Error> for ExampleError {
    fn from(err: std::io::Error) -> Self {
        ExampleError::IoError {
            message: err.to_string(),
        }
    }
}
