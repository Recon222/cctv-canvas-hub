# Tauri Commands (tauri-specta)

Type-safe Tauri command bindings using [tauri-specta](https://github.com/specta-rs/tauri-specta).

## Overview

This app uses tauri-specta to generate TypeScript bindings from Rust commands, providing:

- **Compile-time type checking** - TypeScript catches errors before runtime
- **Auto-generated types** - No manual sync between Rust and TypeScript
- **IDE autocomplete** - Full IntelliSense for command names, parameters, and return types
- **Safe refactoring** - Rename commands safely across the stack

## Usage

### Calling Commands

```typescript
import { commands, type AppPreferences } from '@/lib/tauri-bindings'

// Commands return Result types for error handling
const result = await commands.loadPreferences()

if (result.status === 'ok') {
  console.log(result.data.theme) // Type-safe access
} else {
  console.error(result.error) // Type-safe error
}
```

### Result Type Pattern

Commands that can fail return a `Result<T, E>` type:

```typescript
type Result<T, E> = { status: 'ok'; data: T } | { status: 'error'; error: E }
```

See [error-handling.md](./error-handling.md) for comprehensive error handling patterns including structured error types, retry logic, and user feedback.

Handle both cases:

```typescript
const result = await commands.savePreferences({ theme: 'dark' })

if (result.status === 'error') {
  toast.error('Failed to save', { description: result.error })
  return
}

// result.data is available here
toast.success('Saved!')
```

### unwrapResult Helper

For cases where you want errors to propagate (throw) rather than handle them inline, use the `unwrapResult` helper:

```typescript
import { commands, unwrapResult } from '@/lib/tauri-bindings'

// Throws on error, returns data on success
const preferences = unwrapResult(await commands.loadPreferences())
```

**When to use each pattern:**

| Pattern          | Use When                                                        |
| ---------------- | --------------------------------------------------------------- |
| `unwrapResult`   | TanStack Query functions, errors should propagate to a boundary |
| Manual `if/else` | Event handlers, need explicit error handling (toasts, UI state) |

**TanStack Query example** (preferred pattern for data fetching):

```typescript
import { useQuery } from '@tanstack/react-query'
import { commands, unwrapResult } from '@/lib/tauri-bindings'

const { data, error } = useQuery({
  queryKey: ['preferences'],
  queryFn: async () => unwrapResult(await commands.loadPreferences()),
})
// TanStack Query handles the thrown error automatically
```

**Event handler example** (explicit error handling):

```typescript
const handleSave = async () => {
  const result = await commands.savePreferences(preferences)
  if (result.status === 'error') {
    toast.error('Failed to save', { description: result.error })
    return
  }
  toast.success('Preferences saved!')
}
```

## Adding New Commands

Commands live in feature modules (`src-tauri/src/features/<feature>/commands/mod.rs`), not in `lib.rs` (which has zero commands). See [rust-architecture.md](./rust-architecture.md) for the full feature-module layout; the binding-specific steps are below.

### 1. Define the Rust command in its feature

```rust
// src-tauri/src/features/my_feature/commands/mod.rs

#[tauri::command]
#[specta::specta]  // Required for binding generation
pub async fn my_new_command(arg: String) -> Result<MyType, MyError> {
    // Thin wrapper — delegate to the feature's service
}
```

### 2. Add Type derive to structs

```rust
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MyType {
    pub field: String,
}
```

### 3. Register in bindings.rs

Re-export the feature's command module in `src-tauri/src/features/mod.rs` (`pub use my_feature::commands as my_feature_commands;`), then list the command in `bindings.rs`:

```rust
// src-tauri/src/bindings.rs

pub fn generate_bindings() -> Builder<tauri::Wry> {
    use crate::features::{/* ...existing... */ my_feature_commands};

    Builder::<tauri::Wry>::new().commands(collect_commands![
        // ... existing commands
        my_feature_commands::my_new_command,  // Add here
    ])
}
```

### 4. Regenerate TypeScript bindings

```bash
npm run rust:bindings
```

This runs the `gen_bindings` binary (`cargo run --bin gen_bindings`), which writes `src/lib/bindings.ts`. Debug builds also re-export on launch. Do **not** regenerate with `cargo test export_bindings` — it fails on Windows with `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139), because the test harness runs without the staged WebView2 loader DLL.

### 5. Use in frontend

```typescript
import { commands, type MyType } from '@/lib/tauri-bindings'

const result = await commands.myNewCommand('arg')
```

### 6. Commit both files

Always commit:

- Rust changes (feature `commands/mod.rs`, `src-tauri/src/features/mod.rs`, `src-tauri/src/bindings.rs`)
- Generated TypeScript (`src/lib/bindings.ts`)

## File Structure

```
src-tauri/src/
├── features/<feature>/commands/mod.rs  # Commands with #[specta::specta]
├── features/mod.rs                     # Re-exports each feature's command module
├── bindings.rs                         # generate_bindings() + export_ts_bindings()
└── lib.rs                              # App setup (no commands)

src-tauri/Cargo.toml    # specta, tauri-specta dependencies

src/lib/
├── bindings.ts         # Generated (DO NOT EDIT)
└── tauri-bindings.ts   # Re-exports with project conventions
```

## Known Limitations

### serde_json::Value becomes JsonValue/unknown

Commands using `serde_json::Value` (like `saveEmergencyData`) have `JsonValue` typed parameters:

```typescript
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | Partial<{ [key in string]: JsonValue }>
```

Cast when needed:

```typescript
await commands.saveEmergencyData(filename, data as JsonValue)
```

### Bindings generated at runtime

TypeScript bindings are generated when the app runs in debug mode, or via:

```bash
npm run rust:bindings
```

This must be run after changing Rust commands.

## Testing

Mock the commands in tests:

```typescript
// src/test/setup.ts
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    loadPreferences: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: { theme: 'system' } }),
    savePreferences: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    // ... other commands
  },
}))
```

## Available Commands

| Command                       | Parameters                            | Returns                             | Description               |
| ----------------------------- | ------------------------------------- | ----------------------------------- | ------------------------- |
| `greet`                       | `name: string`                        | `Result<string, string>`            | Simple greeting           |
| `loadPreferences`             | none                                  | `Result<AppPreferences, string>`    | Load preferences          |
| `savePreferences`             | `preferences: AppPreferences`         | `Result<null, string>`              | Save preferences          |
| `sendNativeNotification`      | `title: string, body: string \| null` | `Result<null, string>`              | System notification       |
| `saveEmergencyData`           | `filename: string, data: JsonValue`   | `Result<null, RecoveryError>`       | Save recovery data        |
| `loadEmergencyData`           | `filename: string`                    | `Result<JsonValue, RecoveryError>`  | Load recovery data        |
| `cleanupOldRecoveryFiles`     | none                                  | `Result<number, RecoveryError>`     | Cleanup old files         |
| `showQuickPane`               | none                                  | `Result<null, string>`              | Show quick pane window    |
| `dismissQuickPane`            | none                                  | `Result<null, string>`              | Hide quick pane window    |
| `toggleQuickPane`             | none                                  | `Result<null, string>`              | Toggle quick pane window  |
| `getDefaultQuickPaneShortcut` | none                                  | `string`                            | Default shortcut constant |
| `updateQuickPaneShortcut`     | `shortcut: string \| null`            | `Result<null, string>`              | Update quick pane shortcut |
| `loadExampleData`             | `dataId: string`                      | `Result<ExampleData, ExampleError>` | Load example data         |
| `saveExampleData`             | `data: ExampleData`                   | `Result<null, ExampleError>`        | Save example data         |

## Dependencies

```toml
# src-tauri/Cargo.toml
specta = { version = "=2.0.0-rc.22", features = ["derive", "serde_json"] }
tauri-specta = { version = "=2.0.0-rc.21", features = ["typescript"] }
specta-typescript = "=0.0.9"
```

Note: Using exact versions (`=`) during RC phase to prevent breaking changes.

## References

- [tauri-specta GitHub](https://github.com/specta-rs/tauri-specta)
- [Specta documentation](https://specta.dev/docs/tauri-specta/v2)
