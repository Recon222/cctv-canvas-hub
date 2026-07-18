# Copy-paste harness template

A temporary, **untracked** overlay component. It auto-runs a sequence, subscribes to backend events,
renders its own timestamped log on screen (so a screenshot is the artifact), and shows live store
state.

Put it at `src/features/<feature>/__smoke__/XSmoke.tsx`. Delete the whole `__smoke__` directory at
teardown.

## The component

```tsx
/**
 * TEMPORARY — smoke harness. NOT COMMITTED.
 * Delete this file and revert the two lines in PipelineEventProvider.tsx when done.
 */
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
// import the FEATURE'S SERVICE, never `invoke` directly (services own IPC):
// import { voiceService } from '@/features/voice'
// import { useVoiceStore } from '@/features/voice'

export function XSmoke() {
  const [lines, setLines] = useState<string[]>([])
  // const machineState = useVoiceStore(s => s.machineState)   // selector syntax, never destructure

  useEffect(() => {
    const t0 = performance.now()
    const log = (m: string) =>
      setLines(prev => [...prev, `+${((performance.now() - t0) / 1000).toFixed(2)}s  ${m}`])

    let cancelled = false
    const uns: (() => void)[] = []

    // --- subscribe to whatever the backend emits -------------------------
    void listen('voice:ready', () => log('EVENT voice:ready')).then(u => uns.push(u))
    void listen('voice:engine_down', () => log('EVENT voice:engine_down  <<<< SIGNAL')).then(u => uns.push(u))
    void listen<{ message: string }>('voice:error', e =>
      log(`EVENT voice:error ${JSON.stringify(e.payload)}`)
    ).then(u => uns.push(u))

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // --- the sequence. Automate it: clicking is far too slow for races. ---
    void (async () => {
      await sleep(1500)            // let the app settle
      if (cancelled) return

      log('PHASE A — start')
      try {
        // await voiceService.startEngine()
        log('   ok')
      } catch (e) {
        log(`   THREW: ${String(e)}`)
      }

      await sleep(2500)
      if (cancelled) return

      log('PHASE B — stop(); start()  [BACK-TO-BACK]')   // the race window
      try {
        // await voiceService.stopEngine()
        // await voiceService.startEngine()
        log('   ok')
      } catch (e) {
        log(`   THREW: ${String(e)}`)
      }

      await sleep(3500)
      if (cancelled) return
      log('PHASE C — settled. EXPECT: <state your expectation here>')
      log('SMOKE COMPLETE')
    })()

    return () => {
      cancelled = true
      uns.forEach(u => u())
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        color: '#3f6',
        font: '15px/1.55 Consolas, monospace',
        padding: '28px',
        overflow: 'auto',
      }}
    >
      <div style={{ color: '#fff', fontSize: '20px', marginBottom: '10px' }}>
        SMOKE HARNESS (temporary)
      </div>
      {/* <div style={{ color: '#ff0', marginBottom: 14 }}>machineState: {machineState}</div> */}
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</pre>
    </div>
  )
}
```

## Mounting it

Two lines in `src/features/shared/components/PipelineEventProvider.tsx` — **back that file up outside
the repo first**:

```tsx
import { XSmoke } from '@/features/<feature>/__smoke__/XSmoke'  // TEMP: smoke, revert
...
      <VoiceEngineListener />
      <XSmoke />
      <PopoutCoordinator />
```

`PipelineEventProvider` wraps the whole app on every view, so the overlay appears regardless of
`currentView` and you never have to navigate to it.

## Variations worth knowing

**Full-screen overlay vs corner panel.** `inset: 0` covers the UI, which is ideal when you only care
about the log. Use `bottom: 0; right: 0; width: 40%` when you need to see and click the real UI
underneath.

**Navigate instead of clicking:**

```ts
import { useUIStore } from '@/store/ui-store'
useUIStore.getState().setCurrentView('claw-direct')
```

**Read store state without re-render games** — inside callbacks always use `getState()`:

```ts
const { machineState } = useVoiceStore.getState()
```

In the component body use the selector form (`useVoiceStore(s => s.machineState)`); destructuring the
store is an ast-grep violation in this repo and causes render cascades.

**Force a race window.** If a back-to-back sequence still doesn't reproduce, the window may be
closing before you reach it. Widen it on the *Rust* side (a `std::thread::sleep` in the handler under
test), rebuild via the watcher, and A/B with one variable. See `live-smoke-testing`.

**Timing you can trust.** `performance.now()` deltas relative to mount are stable. Wall-clock
timestamps in the *dev log* line up with Rust-side events — correlate the two when ordering matters.

## Teardown

```bash
cp "$BACKUP/PipelineEventProvider.tsx.orig" src/features/shared/components/PipelineEventProvider.tsx
rm -rf src/features/<feature>/__smoke__
md5sum "$BACKUP/PipelineEventProvider.tsx.orig" src/features/shared/components/PipelineEventProvider.tsx
git status --porcelain | grep -vE '^\?\?'      # must print nothing
```
