# Testing

Testing patterns for Rust and TypeScript, with focus on Tauri-specific mocking.

## Running Tests

```bash
npm run check:all      # All tests and checks
npm run test           # TypeScript tests (watch mode)
npm run test:run       # TypeScript tests (single run)
npm run rust:test      # Rust tests
```

## TypeScript Testing

Uses **Vitest** + **@testing-library/react**. Configuration in `vitest.config.ts`.

### Test File Location

Place tests next to the code they test, or in a `__tests__/` directory within the feature:

```
src/components/ui/Button.tsx
src/components/ui/Button.test.tsx

src/features/my-feature/
├── __tests__/
│   └── useMyHook.test.ts    # Feature tests
├── hooks/
│   └── useMyHook.ts
└── services/
    └── myService.ts
```

### Mocking Tauri APIs (Critical)

Tauri commands must be mocked since tests run outside the Tauri environment. Mocks are configured in `src/test/setup.ts`:

```typescript
// src/test/setup.ts
import { vi } from 'vitest'

// Mock Tauri event APIs
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

// Mock typed Tauri bindings (tauri-specta generated)
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    greet: vi.fn().mockResolvedValue('Hello, test!'),
    loadPreferences: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: { theme: 'system' } }),
    savePreferences: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    sendNativeNotification: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    saveEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    loadEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    cleanupOldRecoveryFiles: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: 0 }),
  },
}))
```

### Testing with Mocked Commands

```typescript
import { vi } from 'vitest'
import { commands } from '@/lib/tauri-bindings'

const mockCommands = vi.mocked(commands)

test('loads preferences', async () => {
  mockCommands.loadPreferences.mockResolvedValue({
    status: 'ok',
    data: { theme: 'dark' },
  })

  // Test code that calls loadPreferences
})
```

### Test Wrappers for Providers

Components and hooks need QueryClient, i18n, and theme context. Two ready-made
helpers provide them — don't hand-roll a wrapper:

| Helper                                   | From                       | Use for                          |
| ---------------------------------------- | -------------------------- | -------------------------------- |
| `render` (custom)                        | `@/test/test-utils`        | Full-provider component tests    |
| `FeatureTestWrapper` / `renderWithFeatureProviders` | `@/test/feature-test-utils` | Feature hook tests (`renderHook`) |

```typescript
// Component test — custom render wraps in all providers
import { render } from '@/test/test-utils'

test('component with query', () => {
  render(<MyComponent />)
})
```

For feature hooks, pass `FeatureTestWrapper` to `renderHook` (see
[Testing Feature Hooks](#testing-feature-hooks-vimock-on-service-functions) below).

### Testing Zustand Stores

```typescript
import { renderHook, act } from '@testing-library/react'
import { useUIStore } from '@/store/ui-store'

test('toggles sidebar visibility', () => {
  const { result } = renderHook(() => useUIStore())

  expect(result.current.leftSidebarVisible).toBe(true)

  act(() => {
    result.current.setLeftSidebarVisible(false)
  })

  expect(result.current.leftSidebarVisible).toBe(false)
})
```

### Testing Feature Hooks (vi.mock on Service Functions)

Feature tests mock the **service layer** (plain async functions), not Tauri commands directly. This keeps tests focused on hook behavior:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { useMyData } from '../hooks/useMyData'
import { FeatureTestWrapper } from '@/test/feature-test-utils'

// Mock the service, not Tauri commands
vi.mock('../services/myService', () => ({
  loadMyData: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
  saveMyData: vi.fn().mockResolvedValue(undefined),
}))

describe('useMyData', () => {
  it('loads data via TanStack Query', async () => {
    const { result } = renderHook(() => useMyData('1'), {
      wrapper: FeatureTestWrapper,
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: '1', name: 'Test' })
    })
  })
})
```

**Why mock services instead of Tauri commands:**

- Tests focus on hook logic, not IPC details
- Plain functions are trivial to mock with `vi.mock`
- No class constructors or prototype chains to stub
- Service errors are already handled (throw vs return defaults)

Use `FeatureTestWrapper` from `src/test/feature-test-utils.tsx` for all feature hook tests. It provides QueryClient, i18n, and theme context.

## Rust Testing

**Where Rust tests go — read this first.** On Windows, a test harness that links the app crate (`tauri_app_lib`) aborts at _load_ with `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139) before any test runs — the test binary runs from `target/debug/deps/` without the staged WebView2 loader DLL. So `src-tauri/Cargo.toml` sets `[lib] test = false` to disable the app crate's unit-test harness, and **you do not put unit tests inside the app crate** (`src-tauri/src/`). Inline `#[cfg(test)]` there will not run.

**Pure logic that needs unit tests lives in a Tauri-free workspace crate.** `src-tauri` is a Cargo workspace; put input→output logic in `src-tauri/crates/<name>/` with no `tauri` dependency. Because such a crate never links WebView2, its ordinary `#[cfg(test)]` tests run cleanly with `cargo test` on every platform — no duplication, no mirroring. `[workspace] default-members` lists the crates so bare `cargo test` (what `npm run rust:test` runs) includes them; the app crate's own harness stays skipped via `test = false`.

`src-tauri/crates/platform-utils/` is the worked example — copy it for new pure-logic crates.

### Creating a pure-logic crate

1. Scaffold `src-tauri/crates/<name>/` (`Cargo.toml` + `src/lib.rs`). Keep it Tauri-free — depend only on `std`, `serde`, and other pure crates.
2. Register it in `src-tauri/Cargo.toml`: append the path to **both** `[workspace] members` and `[workspace] default-members`.
3. If the app consumes it, add a path dependency: `<name> = { path = "crates/<name>" }`.
4. Write tests inline in a `#[cfg(test)] mod tests` next to the code.

### Unit tests (inside a pure crate)

```rust
// src-tauri/crates/<name>/src/lib.rs
pub const fn current_platform() -> &'static str { /* ... */ }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_is_valid() {
        let p = current_platform();
        assert!(p == "macos" || p == "windows" || p == "linux");
    }
}
```

### Types that need TypeScript bindings (optional `specta` feature)

If a crate's public types must appear in `bindings.ts`, gate the `specta::Type` derive behind an **optional `specta` feature** so the crate still tests WebView2-free:

```toml
# crates/<name>/Cargo.toml
[dependencies]
specta = { version = "=2.0.0-rc.22", features = ["derive"], optional = true }

[features]
specta = ["dep:specta"]
```

Default build has no specta (`cargo test -p <name>` is Tauri- and WebView2-free); the app turns the feature on via its path dependency — `<name> = { path = "crates/<name>", features = ["specta"] }` — so tauri-specta emits the types.

### Async and file tests

Same rule — write them inside the pure crate. Use `#[tokio::test]` for async and `tempfile` (a dev-dependency) for filesystem tests:

```rust
#[tokio::test]
async fn does_the_thing() {
    assert!(some_async_fn().await.is_ok());
}

#[test]
fn round_trips_a_file() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("test.json");
    std::fs::write(&path, "{}").unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");
}
```

## Adding New Command Mocks

When adding new Tauri commands, update `src/test/setup.ts`:

```typescript
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    // ... existing mocks
    myNewCommand: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
  },
}))
```

## Best Practices

| Do                                    | Don't                         |
| ------------------------------------- | ----------------------------- |
| Mock Tauri commands in setup.ts       | Call real Tauri APIs in tests |
| Use `vi.mocked()` for type-safe mocks | Use untyped mock assertions   |
| Test user-visible behavior            | Test implementation details   |
| Use `tempfile` for Rust file tests    | Write to real file system     |
