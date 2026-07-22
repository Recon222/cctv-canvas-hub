import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './i18n'
import './App.css'
import { queryClient } from './lib/query-client'
import { ThemeProvider } from './components/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LanguageSync } from './components/LanguageSync'
import { SecondaryRoot } from '@/features/canvass'
import type { PopOutView } from '@/lib/services/sessionEvents'

/**
 * Secondary-window entry (Phase 7.1B, `quick-pane.html` precedent): a
 * SEPARATE JS context — the module singletons imported here (query
 * client, stores, supabase holder) are this window's own instances,
 * never shared with main (A1 ground truth). The view is fixed by the
 * URL the Rust builder opened (`window.html?view=case|map`); the case
 * arrives via the `view-context` handshake, and auth via the pushed
 * access token (AD13 — this context never touches the vault).
 */

/** The Rust `ViewWindow` enum makes invalid views unrepresentable over
 * IPC; a missing/foreign param only happens on a hand-typed URL —
 * default to the map (A1's headline use). */
function parseView(): PopOutView {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'case' ? 'case' : 'map'
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

ReactDOM.createRoot(rootElement).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageSync />
        <SecondaryRoot view={parseView()} />
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
)
