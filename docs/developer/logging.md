# Logging

Simple logging setup for both Rust backend and TypeScript frontend.

## Quick Start

### Rust (Backend)

```rust
log::info!("Application starting up");
log::debug!("Debug info: {}", some_value);
log::warn!("Something unexpected happened");
log::error!("Error occurred: {}", error);
```

### TypeScript (Frontend)

```typescript
import { logger } from '@/lib/logger'

logger.info('User action completed')
logger.debug('Debug data', { userId: 123, action: 'click' })
logger.warn('Performance warning')
logger.error('Request failed', { error: response.error })
```

## Configuration

### Rust Backend

- Uses `tauri-plugin-log` with standard Rust `log` crate
- **Development**: Debug level; **Production**: Info level
- **Targets**: stdout + webview console on all platforms. A log-file target (`LogDir`) is wired for **macOS only** (`#[cfg(target_os = "macos")]` in `lib.rs`). Windows/Linux get stdout + webview only — no file. Add a non-gated `LogDir` target if you need file logs on those platforms.
- Configuration in `src-tauri/src/lib.rs`

### TypeScript Frontend

- **Development**: All logs go to browser console
- **Production**: Console logging only (keeps it simple)
- Logger utility at `src/lib/logger.ts`

## Log Levels

| Level   | When to Use            | Dev | Prod |
| ------- | ---------------------- | --- | ---- |
| `trace` | Most verbose debugging | ✅  | ❌   |
| `debug` | Development debugging  | ✅  | ❌   |
| `info`  | General information    | ✅  | ✅   |
| `warn`  | Warning conditions     | ✅  | ✅   |
| `error` | Error conditions       | ✅  | ✅   |

## Where Logs Appear

### Development

- **Rust**: Terminal (stdout) + Browser DevTools console (webview)
- **TypeScript**: Browser DevTools console

### Production

- **Rust**: Terminal (stdout) everywhere; **on macOS also** a log file in the app log directory (`~/Library/Logs/`). Windows/Linux have no file target by default.
- **TypeScript**: Browser DevTools console

## Examples

### Rust Tauri Commands

```rust
#[tauri::command]
async fn save_data(data: MyData) -> Result<(), String> {
    log::info!("Saving data for user: {}", data.user_id);

    match save_to_disk(&data).await {
        Ok(_) => {
            log::info!("Data saved successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to save data: {}", e);
            Err(format!("Save failed: {}", e))
        }
    }
}
```

### TypeScript React Components

```typescript
import { logger } from '@/lib/logger'

function MyComponent() {
  const handleClick = () => {
    logger.debug('Button clicked', { component: 'MyComponent' })

    try {
      performAction()
      logger.info('Action completed successfully')
    } catch (error) {
      logger.error('Action failed', { error })
    }
  }

  return <button onClick={handleClick}>Click me</button>
}
```

## Best Practices

1. **Use appropriate log levels** - Don't log everything as `info`
2. **Include context** - Add relevant data to help debugging
3. **Log errors with details** - Include error messages and context
4. **Keep messages concise** - But descriptive enough to be useful
5. **Use structured logging** - Include objects/context for complex data

See [error-handling.md](./error-handling.md) for patterns on when to log vs show errors to users.

## Production Considerations

- On macOS, Rust logs also go to the app's log directory; on Windows/Linux they go to stdout only (no file target wired by default)
- No sensitive data should be logged (passwords, tokens, etc.)
- The plugin supports log rotation when a file target is configured
- Frontend logs stay in browser - not sent to backend by default
