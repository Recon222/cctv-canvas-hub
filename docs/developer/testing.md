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

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preferences_default() {
        let prefs = AppPreferences::default();
        assert_eq!(prefs.theme, "system");
    }
}
```

### Async Tests

```rust
#[tokio::test]
async fn test_async_operation() {
    let result = some_async_fn().await;
    assert!(result.is_ok());
}
```

### File Operation Tests

Use `tempfile` for tests that need file system access:

```rust
use tempfile::TempDir;

#[test]
fn test_file_operations() {
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("test.json");

    // Test write
    std::fs::write(&file_path, "{}").unwrap();

    // Test read
    let content = std::fs::read_to_string(&file_path).unwrap();
    assert_eq!(content, "{}");
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
