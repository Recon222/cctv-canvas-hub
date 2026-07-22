# Supabase Integration

How this app talks to the agency cloud: the client singleton, the encrypted
session vault beneath it, the connection-health machine above it, and the one
mock seam every test uses. Written at Phase 6.4 (M6); the authoritative design
lives in `docs/plans/canvas-hub/01-canvas-hub-architecture.md`.

## The client singleton (`src/lib/supabase/client.ts`)

Every supabase-js consumer reaches the cloud through **`getSupabase()`** — a
module singleton created by `initSupabase(config)` during bootstrap
(`useAuthBootstrap`, Flow A/B). It throws `SupabaseNotInitializedError` before
init; nothing should catch that to "retry" — a context without a client has no
session to act on.

```ts
initSupabase(config)      // creates the singleton (vault-backed auth storage)
getSupabase()             // the only read path — and the only mock seam
teardownSupabase()        // re-enrollment only; sign-out keeps the client
createProbeClient(url, k) // transient pre-init client for the enrollment probe
ensureFreshSession(sb)    // wake-path session check (6.2 — see below)
```

Auth options are pinned: `storage: vaultStorage, persistSession: true,
autoRefreshToken: true, detectSessionInUrl: false`. The probe client is the one
deliberate exception to the singleton (`persistSession: false`,
`autoRefreshToken: false`) — the enrollment probe runs **before** `initSupabase`.

### Rules

- **Services own the calls.** Components never import the client; feature
  `services/` files do (`authService`, `configService`, `canvassService`,
  `realtimeService`, `mediaService`). `vault-storage.ts` calling `commands.*`
  outside a `services/` dir is the one sanctioned adapter — it IS the client's
  storage seam.
- **Positional generics stay inferred.** `SupabaseClient` is
  `ReturnType<typeof createClient<Database>>` — annotating with the bare
  library type re-parameterizes the generics and trips `no-unsafe-assignment`.

## The session vault (AD5)

GoTrue's persisted session goes through `vaultStorage`
(`src/lib/supabase/vault-storage.ts`) → Rust `cloud_session` commands →
AES-256-GCM (`secure-vault` crate) with the key in the OS keychain and
`nonce‖ciphertext` at `{app_data}/session.vault`.

- **Single-blob invariant:** the adapter binds the first session-class storage
  key it sees and fails LOUDLY (key names only, never values) if a different
  one arrives. Transient `…-code-verifier` keys live in memory only.
- **Key lifecycle:** only `keyring::Error::NoEntry` creates a new key; any
  other keychain error fails closed — regenerating over a stored key would
  silently force re-sign-in on every relaunch.
- **No-log rule (T3):** vault services/commands never log or debug-format
  values, arguments, or results. Re-grep on every touch of
  `src-tauri/src/features/cloud_session/` (the M1 verification obligation).
- **Status without plaintext:** the SYSTEM lane's `vault_status` command
  reports presence (`config_present` / `vault_present` /
  `keyring_key_present` / `vault_mtime_ms`) and **never decrypts** —
  `vault_get` is the wrong tool for status. A locked/unreachable keychain is
  an `Err`, never an all-false "absent".

## Connection health (AD11)

`src/store/health-store.ts` is the global home of `HealthState`,
`ChannelStatus`, the timing constants, and the **catch-up allow-list**:

- The machine only degrades on evidence and only upgrades on positive
  confirmation (`recordFetchOk` / `recordEvent`); `SUBSCRIBED` alone is never
  `live`.
- Constants: `STALE_AFTER_MS = 90_000`, `RECONCILE_MS = 35_000`,
  `FETCH_BUDGET_MS = 20_000`, with the test-pinned invariant
  `2 × RECONCILE_MS + FETCH_BUDGET_MS ≤ STALE_AFTER_MS` (one missed reconcile
  must never flash a false STALE).
- **Registration obligation:** every new case-data query family MUST be added
  to `CASE_DATA_KEY_FAMILIES` or it gets **no catch-up refetch** — after a
  sleep/wake it would render pre-sleep data behind a green dot. Signed URLs
  are excluded *by not being in the allow-list* (they refresh on their own
  interval).

### Wake catch-up (6.2, Flow E3)

Every wake path (`online`, tab visible, channel resubscribe) converges on one
path in `useConnectionHealth`:

1. `ensureFreshSession(getSupabase())` — refresh **only** within
   `SESSION_EXPIRY_MARGIN_MS` of expiry (`autoRefreshToken` owns routine
   rotation; racing its ticker can submit an already-rotated refresh token),
   then `realtime.setAuth()` with the rotated token;
2. invalidate the `CASE_DATA_KEY_FAMILIES` queries;
3. on refresh failure: toast + `signed-out` — never a silent stale board.

## Session states the data plane must honor

`active` and `locked` both keep data flowing — queries, realtime, and the
media poll all gate on `session === 'active' || session === 'locked'` plus
`canPoll(health)`. Lock (Flow F) is interaction-only: the overlay swallows
input and the keyboard-shortcut hook gates on `locked`; content is never
altered. The lock is **durable** (PR #9 H1): lock/unlock persist a flag in
`cloud-config.json` (cleared on sign-out too), and bootstrap re-enters
`locked` when a session restores with the flag set — a reload or relaunch
never drops the wall without a password. Leaving `active`/`locked` (board
unmount) purges the canvass store, the health marks, and every
`CASE_DATA_KEY_FAMILIES` cache entry (`CanvassRoot`'s unmount effect).

## Testing: the one mock seam

Tests never fake supabase-js internals — they mock the module at its choke
point and hand back a minimal fake from `getSupabase()`:

```ts
vi.mock('@/lib/supabase/client') // whole-module automock, or partial:

import type * as supabaseClientModule from '@/lib/supabase/client'
vi.mock('@/lib/supabase/client', async importOriginal => ({
  ...(await importOriginal<typeof supabaseClientModule>()), // real helpers/errors
  getSupabase: vi.fn(),
}))
```

The fake covers **only the surfaces the code under test touches**:

```ts
const fake = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
  realtime: { setAuth: vi.fn(async () => undefined) },
  removeAllChannels: vi.fn(async () => []),
  from: vi.fn(() => chain),          // PostgREST: a self-returning chain
  channel: vi.fn(() => channelFake), // realtime: .on().subscribe()
  storage: { from: vi.fn(() => ({ createSignedUrl })) },
}
vi.mocked(getSupabase).mockReturnValue(fake as never)
```

- The **PostgREST chain** is a thenable whose builder methods
  (`select/is/neq/eq/in/order/limit`) return itself and whose `then` resolves
  `{ data, error, status }` — see `queries.test.ts` (`fakeQuery`).
- **Error shapes matter:** postgrest-js resolves an unreachable host as
  `{ error, status: 0 }` (it does not reject), and GoTrue surfaces network
  failures as retryable errors with `status` 0/undefined — the
  rejected-vs-unreachable classifiers (`probeProject`, `reauthenticate`)
  branch on exactly that.
- The **probe** path mocks `createProbeClient` from the same module (test
  #11); it never goes through `getSupabase()`.
- Rust command mocks (vault, config, `readLogTail`, `vaultStatus`) live in
  `src/test/setup.ts` — override per test with `vi.mocked(commands.x)`.

## Live smoke targets

`canvas-hub-dev` (see `CLAUDE.local.md`) is the byte-for-byte v1 agency cloud
for end-to-end verification: sign in as an investigator via supabase-js to
drive real RLS-bounded broadcasts; the hub signs in as the coordinator.
