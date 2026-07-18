import { useState, useEffect, useRef } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { dismissQuickPane } from '../services/quickPaneService'

/**
 * QuickPaneApp - A minimal floating window for quick text entry.
 *
 * This component demonstrates the quick pane pattern:
 * - Single text input with submit on Enter
 * - Emits 'quick-pane-submit' event with the entered text
 * - Theme synced with main window via localStorage
 * - Hides window on submit or Escape
 */
// Apply theme from localStorage to document
function applyTheme() {
  const theme = localStorage.getItem('ui-theme') ?? 'system'
  const root = document.documentElement

  root.classList.remove('light', 'dark')

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
      .matches
      ? 'dark'
      : 'light'
    root.classList.add(systemTheme)
  } else {
    root.classList.add(theme)
  }
}

export default function QuickPaneApp() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Apply theme on mount and listen for theme changes from main window
  useEffect(() => {
    applyTheme()

    const unlisten = listen('theme-changed', () => {
      applyTheme()
    })

    return () => {
      void unlisten.then(fn => fn())
    }
  }, [])

  // Focus input when window becomes visible, hide on blur
  useEffect(() => {
    const currentWindow = getCurrentWindow()
    const unlisten = currentWindow.onFocusChanged(({ payload: focused }) => {
      void (async () => {
        if (focused) {
          // Re-apply theme in case it changed while hidden
          applyTheme()
          inputRef.current?.focus()
        } else {
          // Hide window when it loses focus (dismiss on blur)
          // Use dismiss command for consistent behavior (no animation)
          await dismissQuickPane()
        }
      })()
    })

    return () => {
      void unlisten.then(fn => fn())
    }
  }, [])

  // Handle Escape key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault() // Prevent system "boop" sound
        void dismissQuickPane()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (text.trim()) {
      // Emit the event for main window to handle
      await emit('quick-pane-submit', { text: text.trim() })
      setText('')
    }

    // Use dismiss command to avoid space switching on macOS
    await dismissQuickPane()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-screen w-screen items-center rounded-xl border border-border bg-background px-5 shadow-lg"
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Enter text..."
        className="w-full bg-transparent text-lg text-foreground placeholder:text-muted-foreground outline-none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </form>
  )
}
