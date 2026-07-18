import React, { useState } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/config'
import {
  ThemeProviderContext,
  type Theme,
  type ThemeProviderState,
} from '@/lib/theme-context'

/**
 * Create a fresh QueryClient for each test to avoid shared state.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

/**
 * Mock ThemeProvider for tests that doesn't depend on Tauri or localStorage
 */
function MockThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  const value: ThemeProviderState = {
    theme,
    setTheme,
  }

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

interface FeatureTestWrapperProps {
  children: React.ReactNode
}

/**
 * Test wrapper for feature components.
 *
 * Provides QueryClient, i18n, and theme context.
 * Use this instead of AllTheProviders when testing individual features.
 *
 * @example
 * ```ts
 * const { result } = renderHook(() => useMyHook(), {
 *   wrapper: FeatureTestWrapper,
 * })
 * ```
 */
export function FeatureTestWrapper({ children }: FeatureTestWrapperProps) {
  const queryClient = createTestQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MockThemeProvider>{children}</MockThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

/**
 * Render a component with all feature providers.
 *
 * @example
 * ```ts
 * const { getByText } = renderWithFeatureProviders(<MyComponent />)
 * ```
 */
export function renderWithFeatureProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: FeatureTestWrapper, ...options })
}
