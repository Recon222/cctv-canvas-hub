import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { useGreeting } from '../hooks/useExampleData'
import { FeatureTestWrapper } from '@/test/feature-test-utils'

/**
 * Mock the service layer — plain async functions, not class instances.
 *
 * vi.mock hoists to the top of the file, so all imports from the
 * mocked module resolve to mock functions automatically.
 */
vi.mock('../services/exampleService', () => ({
  greetUser: vi.fn().mockResolvedValue('Hello, World!'),
}))

describe('useGreeting', () => {
  it('loads greeting via TanStack Query when name is provided', async () => {
    const { result } = renderHook(() => useGreeting('World'), {
      wrapper: FeatureTestWrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toBe('Hello, World!')
  })

  it('does not fetch when name is empty', () => {
    const { result } = renderHook(() => useGreeting(''), {
      wrapper: FeatureTestWrapper,
    })

    // Query should be disabled (not fetching)
    expect(result.current.isFetching).toBe(false)
    expect(result.current.data).toBeUndefined()
  })
})
