import { render, screen } from '@/test/test-utils'
import { describe, it, expect } from 'vitest'
import App from './App'

// Tauri bindings are mocked globally in src/test/setup.ts

describe('App', () => {
  it('renders the session shell and boots to setup with no cloud config', async () => {
    render(<App />)
    // loadCloudConfig is mocked to null (setup.ts), so the bootstrap lands
    // in needs-setup and the enrollment screen renders (Flow A step 1).
    expect(
      await screen.findByRole('heading', {
        name: /connect to your agency cloud/i,
      })
    ).toBeInTheDocument()
  })

  it('renders title bar with traffic light buttons', () => {
    render(<App />)
    // Find specifically the window control buttons in the title bar
    const titleBarButtons = screen
      .getAllByRole('button')
      .filter(
        button =>
          button.getAttribute('aria-label')?.includes('window') ||
          button.className.includes('window-control')
      )
    // Should have at least the window control buttons
    expect(titleBarButtons.length).toBeGreaterThan(0)
  })
})
