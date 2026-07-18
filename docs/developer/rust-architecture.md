# Rust Architecture

Feature-based module organization and patterns for the Tauri backend.

## Module Structure

```
src-tauri/src/
├── main.rs          # Entry point (just calls lib::run())
├── lib.rs           # App setup, plugins, startup logic
├── bindings.rs      # tauri-specta command registration
├── types.rs         # Shared types and constants (cross-feature)
├── features/        # Feature modules organized by domain
│   ├── mod.rs       # Feature registry and command re-exports
│   ├── preferences/
│   │   ├── mod.rs
│   │   ├── commands/mod.rs   # Tauri command handlers
│   │   └── types/mod.rs      # Feature-specific types
│   ├── notifications/
│   │   ├── mod.rs
│   │   └── commands/mod.rs
│   ├── quick_pane/
│   │   ├── mod.rs
│   │   └── commands/mod.rs
│   ├── recovery/
│   │   ├── mod.rs
│   │   ├── commands/mod.rs
│   │   └── types/mod.rs
│   ├── example_feature/      # Template for new features
│   │   ├── mod.rs
│   │   ├── commands/mod.rs
│   │   ├── services/mod.rs
│   │   └── types/mod.rs
│   └── documentation/        # Complex nested feature example
│       ├── mod.rs
│       ├── case_notes/
│       │   ├── commands/mod.rs
│       │   ├── services/mod.rs
│       │   └── types/mod.rs
│       ├── notes/
│       │   ├── commands/mod.rs
│       │   ├── services/mod.rs
│       │   └── types/mod.rs
│       └── shared/mod.rs
└── utils/           # Cross-cutting utility modules
    ├── mod.rs
    └── platform.rs  # Platform-specific helpers
```

## Feature Structure

Each feature owns its domain logic in a self-contained module:

```
features/<feature_name>/
├── mod.rs           # Module root, re-exports
├── commands/        # Tauri command handlers (thin wrappers)
│   └── mod.rs
├── services/        # Business logic (optional, for complex features)
│   └── mod.rs
└── types/           # Feature-specific types (optional)
    └── mod.rs
```

### Key Rules

1. **Features own their domain** - All backend code for a feature lives together
2. **Commands are thin** - Delegate to services for business logic
3. **No cross-feature imports** - Features communicate via Tauri events only
4. **Feature-local types** stay in `features/<name>/types/`
5. **Shared types** that cross feature boundaries go in `src-tauri/src/types.rs`

## Adding a New Feature

### 1. Create the feature directory

```bash
cd src-tauri/src/features
mkdir -p my_feature/{commands,services,types}
```

### 2. Create feature types

```rust
// features/my_feature/types/mod.rs
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MyData {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum MyError {
    NotFound { id: String },
    ValidationError { message: String },
    IoError { message: String },
}
```

### 3. Create feature service (business logic)

```rust
// features/my_feature/services/mod.rs
use super::types::{MyData, MyError};

pub struct MyService;

impl MyService {
    pub fn new() -> Self { Self }

    pub async fn load(&self, id: &str) -> Result<MyData, MyError> {
        // Business logic here
        todo!()
    }
}
```

### 4. Create feature commands (thin wrappers)

```rust
// features/my_feature/commands/mod.rs
use super::{services::MyService, types::{MyData, MyError}};

#[tauri::command]
#[specta::specta]
pub async fn load_my_data(data_id: String) -> Result<MyData, MyError> {
    let service = MyService::new();
    service.load(&data_id).await
}
```

### 5. Create feature mod.rs

```rust
// features/my_feature/mod.rs
pub mod commands;
pub mod services;
pub mod types;
```

### 6. Register in features/mod.rs

```rust
pub mod my_feature;
pub use my_feature::commands as my_feature_commands;
```

### 7. Register commands in bindings.rs

```rust
use crate::features::my_feature_commands;

Builder::<tauri::Wry>::new().commands(collect_commands![
    my_feature_commands::load_my_data,
    // ... other commands
])
```

### 8. Regenerate TypeScript bindings

```bash
npm run rust:bindings
```

## Nested Features (Complex Domains)

For features with sub-domains, use nested sub-features:

```rust
// features/documentation/mod.rs
pub mod case_notes;
pub mod notes;
pub mod shared;

pub use case_notes::commands as case_notes_commands;
pub use notes::commands as notes_commands;
```

Each sub-feature follows the same structure as a top-level feature.

## Type Patterns

### Feature-Scoped Types

Types used by only one feature live in that feature's `types/` module:

```rust
// features/recovery/types/mod.rs
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum RecoveryError {
    FileNotFound,
    IoError { message: String },
}
```

### Shared Types (types.rs)

Types needed by multiple features or by app setup stay in `src-tauri/src/types.rs`:

```rust
// types.rs - only cross-feature constants and types
pub const DEFAULT_QUICK_PANE_SHORTCUT: &str = "CommandOrControl+Shift+.";
```

### Error Types

Use typed enums with `#[serde(tag = "type")]` for discriminated unions in TypeScript:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum MyError {
    NotFound { id: String },
    ValidationError { message: String },
}
```

The frontend can match on the `type` field:

```typescript
if (error.type === 'ValidationError') {
  console.log(error.message)
}
```

## Platform-Specific Code

Use conditional compilation for platform-specific behavior:

```rust
#[cfg(target_os = "macos")]
fn macos_specific() { /* ... */ }

#[cfg(desktop)]
fn desktop_only() { /* ... */ }
```

Platform utilities live in `utils/platform.rs`.

## Plugin Registration (lib.rs)

Plugins are registered in `lib.rs` during app setup:

```rust
#[cfg(desktop)]
{
    app_builder = app_builder.plugin(tauri_plugin_window_state::Builder::new().build());
}

app_builder = app_builder
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
```

**Order matters:** Single-instance plugin must be registered first.

## Conventions

| Pattern           | Example                                                       |
| ----------------- | ------------------------------------------------------------- |
| Command naming    | `snake_case` (`load_preferences`, not `loadPreferences`)      |
| Error returns     | `Result<T, String>` for simple errors, typed enum for complex |
| Logging           | Use `log::info!`, `log::debug!`, etc.                         |
| String formatting | `format!("{variable}")` not `format!("{}", variable)`         |
| App handle        | Pass `AppHandle` not `Window` when possible                   |
| Feature naming    | `snake_case` for Rust modules (`my_feature`)                  |
| Type derives      | `#[derive(Debug, Clone, Serialize, Deserialize, Type)]`       |
| Command macros    | Both `#[tauri::command]` and `#[specta::specta]`              |

## Data Flow

```
Frontend (TypeScript)
  --> commands.myCommand(args)    # Type-safe IPC call
    --> Tauri IPC bridge
      --> features/<name>/commands/  # Thin command handler
        --> features/<name>/services/  # Business logic
          --> Storage / File I/O
      --> Result<T, E>
    --> TypeScript Result type
  --> TanStack Query cache update
```
