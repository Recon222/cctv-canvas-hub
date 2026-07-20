# Canvas Hub V1 — Implementation Plan

**Role:** the how — single source of truth for technical detail. Companions: `01-canvas-hub-architecture.md` (**the design** — authoritative for data contracts & flows) and `03-canvas-hub-test-spec.md` (**the proof** — the checklist).

**Basis:** `01-canvas-hub-architecture.md`, itself grounded in `canvas-hub-spec.md` §3 and the mobile repo's provisioning/enrollment sources, verified live against `canvas-hub-dev`. **A2 adds a binding design input:** `design-ui-packages/Desktop app for investigators/design_handoff_canvas_hub` (README = design language + per-screen spec; recreate pixel-close, never ship the HTML). **Supersedes:** nothing.

**Overview.** The work lands as six **independently shippable milestones**: session foundation (M1), live data plane (M2), map (M3), media (M4), attention & dashboard (M5), kiosk hardening (M6). Every milestone ends with a working app and a green `npm run check:all`; nothing in a later milestone is load-bearing for an earlier one, so the hub is usable as a live status list after M2 and as a wall-ready map board after M3.

**Prerequisite:** read the architecture doc first — contracts, flows, and the trap list (§5.5 there) are not restated here.

> **Key constraints.**
> **(1) Read-only against the agency cloud** — V1 writes nothing cloud-side; local writes only (config JSON, vault, preferences). Phase-2 writes would fail RLS anyway (verified: coordinator INSERT → 403).
> **(2) Case-partitioned client** — every data query key, store slice, and the realtime consumer API is keyed by `case_id`. (One non-literal exception: `['signed-url', bucket, path]` — the storage path embeds the case id.) This is the one V2 door that must not close (G6).

---

## Architecture Decisions

Resolves every Open Design Decision from doc 01 §8.

| ID  | Decision (OD)             | Choice                                             | Rationale (rejected alternative named)                                                                                                                                                          |
| --- | ------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD1 | Realtime substrate (OD1)  | Broadcast topic `agency:activity`, private channel | Carries full old+new rows (no follow-up fetch) and is the mobile team's designed forward path (V2 = per-case topics, a string swap). _postgres_changes rejected_: second substrate to reason about, per-case channel fan-out on the DB, and V2 continuity is worse. |
| AD2 | Coordinates (OD2)         | Client-side WKB point parser in `geo.ts`           | One query returns everything; parser is ~20 pure lines with full tests. _RPC + client join rejected_: `locations_for_case` omits `user_id`/`form_data` and returns soft-deleted rows (verified live), so the RPC can never be the primary read anyway. |
| AD3 | Media freshness (OD3)     | One per-case media query, `refetchInterval` 20 s, plus event-triggered per-location invalidation | Dev canvass ≈ 10 locations / case: one query is cheap and diffable. _Visible-only per-location polling rejected_: N queries + visibility tracking for no measurable gain at this scale; revisit if a case exceeds ~100 locations (noted, not built). |
| AD4 | Map binding (OD4)         | `react-map-gl` v8 (`react-map-gl/mapbox`) + `mapbox-gl` v3 | Declarative viewport/markers matches React 19 + compiler. _Raw mapbox-gl rejected_: imperative lifecycle code we'd write and test ourselves for zero added capability.                         |
| AD5 | Session at rest (OD5)     | `secure-vault` crate: AES-256-GCM, key in OS keychain, `nonce‖ciphertext` file in app data | Windows credential blobs cap ≈ 2.5 KB < GoTrue session JSON. _Keychain-only rejected_: silent truncation/failure on Windows. _Plaintext file rejected_: spec §7 hard requirement. Mirrors mobile `LargeSecureStore`. |
| AD6 | Idle lock UX (OD6)        | **Interaction-only lock**; board stays visible and unchanged; password re-auth. DVR credentials are ordinary strings (owner directive 2026-07-20) — never masked in any state or window | A blanked wall display defeats the product (spec §1 vs §7 tension — resolved in favor of both: visible board, dead controls). _Full blank lock rejected_ for the primary persona; _credential masking rejected by the owner_ — the credentials carry no secrecy semantics; the secured room is the perimeter. |
| AD7 | Feed persistence (OD7)    | In-memory ring, cap 200, session-scoped            | No stated consumer for history (spec §6 wants "recent"). _Persisted feed rejected_: schema + retention questions with no requirement behind them (YAGNI).                                        |
| AD8 | Investigator identity (OD8) | `requester_name` (+ badge) from location rows; fallback short `user_id` | Publishable key cannot list auth users — verified. _Auth admin listing rejected_: requires the secret key, which must never live on the hub (spec §7).                                          |
| AD9 | Template sidebars (OD9)   | Stop rendering panels in `MainWindow`; files stay  | Smallest diff that satisfies "no edge-docked panels". _Deleting files rejected for V1_: touches menus/shortcuts/commands/tests for zero product value; scheduled for a later `/cleanup`.        |
| AD10 | Schema gate              | `APP_REQUIRED_SCHEMA_VERSION = 1` checked after sign-in; mismatch blocks the app | Mirrors the phones' fail-closed gate so a stale/partial cloud can't render a half-true board. _No gate rejected_: violates Honest Liveness (principle 1).                                       |
| AD11 | Cross-feature seams (net-new; no OD) | Connection health lives in the **global layer** (`src/store/health-store.ts` + `src/hooks/useConnectionHealth.ts`), not inside either feature — `HealthState` and `ChannelStatus` are defined there, once; catch-up invalidation targets **case-data queries only** via an exclusion predicate on the `SIGNED_URL_KEY_PREFIX` constant — owned by the **global health-store from M2** (no cross-milestone forward reference; the predicate harmlessly matches nothing until M4's `useSignedUrl` builds its keys from the same constant) — signed URLs refresh on their own interval (4.1B) and must not be mass-regenerated on every wifi blip; the only feature→feature imports are **one-way, read-only barrel consumptions**: canvass → cloud-session (session state for gating/lock state) and canvass/cloud-session → preferences via the **barrel-exported `usePreferences` hook** — the preferences *service* is not barrel-exported, and `App.tsx`'s existing relative deep import of it predates this plan and must not be copied (an aliased deep import fails `ast:lint`). `lib/supabase/vault-storage.ts` calling `commands.*` outside a feature `services/` dir is a sanctioned adapter (it *is* the storage seam of the client singleton). | Architecture-guide rule 5 says features communicate via events, and today zero feature→feature imports exist — so the seams are named and bounded here instead of appearing ad hoc. _Event-bus health signals rejected_: health is shared **state** (a store), not a notification; the global-store layer is the documented home for exactly this. _cloud-session-owned health rejected_: canvass would then import cloud-session services (a cycle risk). _Unfiltered invalidation rejected_: it refetches every mounted signed-URL query — N storage calls + a visible thumbnail flash per reconnect. |
| AD12 (A1) | Three-view IA + nav rail | Views: **Cases** (landing: one card per active case) → **Case dashboard** → **Map**, switched by a slim icon `NavRail` (repurposed `LeftSideBar` slot); rail sized for a fourth entry | Product decision (Kris, 2026-07-19). _CaseSwitcher dropdown rejected_: hides the multi-case reality the forensic-office persona lives in (spec §1). _V1 admin dashboard rejected_: the hub is read-only and the secret key never lands here — an admin surface has no legitimate V1 job; it becomes real with V2 `case_members`/assignment (rail slot reserved). |
| AD13 (A1) | Pop-out window auth topology | Main window is the **sole auth owner** (vault + keyring + refresh ticker); secondaries receive the access token via Tauri events (`session-token` on open + every `TOKEN_REFRESHED`; `session-ended` on sign-out/lock) and run `persistSession: false` clients with their own case-scoped realtime (`setAuth(token)`) | Tauri windows are separate JS contexts — sharing is impossible, so the question is auth topology. _Secondary-owns-its-own-session rejected_: two GoTrueClients on one storage key race the refresh rotation on the single vault (documented auth-js hazard; the vault's single-blob invariant exists precisely to prevent this). _Dumb-renderer event mirroring rejected_: continuously serializing live board state over IPC costs more than a second read-only query/realtime stack and diverges under load. |
| AD14 (**revised A2**) | Process panel, not a diagnostics window | **Right-side collapsible ProcessPanel** (RightSideBar slot) toggling **ACTIVITY** (the live feed, moved out of the dashboard column) ↔ **SYSTEM** (health transitions, source-tagged log tail via `read_log_tail`, `vault_status`, uptime/versions). Collapsed = slim SYS tab; **default-open on ACTIVITY** (wall posture — the attention surface stays visible, spec §6). Ports Kris's `processTerminal` feature (`D:\Coding\Agents_and_Skills\timeline-agent-sdk\claude-sdk-timeline-creator\src\features\processTerminal` — same stack: React/Zustand/i18next/vitest, no terminal lib, ~7.5k lines incl. tests) behind a canvas-hub **source adapter** (health-store transitions + `read_log_tail` polling + activity stream). One new-dep decision at port time: `react-data-grid` (its TableCard) — take it or drop TableCard | _A1's secondary window rejected (owner, 2026-07-20)_: the panel completes the sidebar symmetry, shrinks M7, removes secondary-auth complexity for diagnostics, and collapsibility answers the wall-real-estate objection that motivated the window. _Terminal-emulator lib rejected_: the ported component is a bespoke renderer. Port needs a strictTypeChecked/gate pass — "almost drop-in", not drop-in. |
| AD15 (A2) | Scale-to-fit shell strategy | The design canvas is 1920×1080 with `transform: scale(vw/1920)` on the shell. As-built: **scale the chrome only; the Mapbox canvas stays unscaled-native** (map fills its container at real pixels; chrome overlays scale) — final mechanics decided at Phase 3.2 with a live check | _Whole-shell scaling rejected pending proof_: Mapbox GL inside a CSS-transformed ancestor has known pointer-math and tile-crispness pitfalls; if the M3 live check shows the simple whole-shell scale works flawlessly on the target display, the simpler option may win — the decision point is pinned, not the outcome. |

---

## Milestones

Each milestone leaves a working, gate-green app (`npm run check:all`).

| Milestone | Scope                                                                       | Observable outcome                                                                                                            |
| --------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **M1**    | Cloud session foundation: vault crate, Rust `cloud_session`, client, enrollment/sign-in/gate screens | Launch → paste enrollment payload → sign in as `coord.reyes@canvass.dev` → "Connected · schema v1" state; relaunch restores the session without re-auth; sign-out returns to sign-in. |
| **M2**    | Live data plane: types/mappers/geo, queries, realtime, health, plain card list | Board lists the seeded case's 8 visible locations grouped by status; a script flipping a location's status updates the list **< 5 s** with an activity entry; soft-deleted location never appears. |
| **M3**    | Map view: Mapbox canvas, markers, clustering, fly-to, floating card stack   | Wall-ready map: distinct incident marker + status-colored location markers; card click flies to marker and back; token-less install shows a token screen, not a broken map. |
| **M4**    | Media: signed URLs, thumbnails, polling + diff, video, fallbacks            | Seeded photos render on cards; an uploaded photo appears **≤ 20 s** with a pulse; the `.mp4` plays on demand; the HEIC row shows a fallback tile, never a broken image. |
| **M5**    | Attention & dashboard: feed UI, pulses, connection indicator, dashboard view | Feed shows most-recent-first case-scoped entries; markers/cards pulse on change; pulling the network shows reconnecting → STALE honestly; dashboard shows counts/roster/feed. |
| **M6**    | Kiosk hardening: idle lock, wake catch-up, preferences UI, **process panel (A2)**, docs | After idle timeout the board stays visible and unchanged with interaction locked; password resumes; sleep/wake catches up missed events; preferences edit token/style/idle minutes; the right-side panel toggles ACTIVITY ↔ SYSTEM, collapsible to a SYS tab. |
| **M7** (A1, shrunk A2) | Multi-window: pop-out case dashboard + map, session propagation | From the rail, Map and Case dashboard each pop out into their own window (main keeps working independently); sign-out in main ends every secondary. Cases view never pops out. Diagnostics is NOT a window (AD14 revised). |

---

## Phases

Per-file signatures fix contracts; bodies live in the code. `⚠` marks phases touching existing files.

### Phase 1.1 — `secure-vault` crate ⚠

**Goal:** pure AES-256-GCM seal/open with its own unit tests, registered in the workspace.

| ID   | File                                    | Tag    | Signatures / content                                                                                                              |
| ---- | --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1.1A | `src-tauri/crates/secure-vault/Cargo.toml` | NEW | deps: `aes-gcm`, `rand`; no tauri/keyring                                                                                          |
| 1.1B | `src-tauri/crates/secure-vault/src/lib.rs` | NEW | `pub fn generate_key() -> [u8; 32]` · `pub fn seal(key, plaintext) -> Result<Vec<u8>, VaultError>` · `pub fn open(key, sealed) -> Result<Vec<u8>, VaultError>` · `pub enum VaultError { Corrupt, AuthFailed }` · inline `#[cfg(test)]` |
| 1.1C | `src-tauri/Cargo.toml`                  | MODIFY | add crate to `[workspace] members` + `default-members`; path dep with no features                                                  |

**Error handling:** `open` returns `Corrupt` (framing too short) vs `AuthFailed` (GCM tag mismatch — tamper or wrong key); never panics on malformed input.

### Phase 1.2 — Rust `cloud_session` feature + client + services ⚠

**Goal:** config + vault commands over IPC; supabase client singleton with vault-backed auth storage; enrollment/auth/gate services.

| ID   | File                                                   | Tag    | Signatures                                                                                                                         |
| ---- | ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1.2A | `src-tauri/src/features/cloud_session/{mod,types/mod,services/mod,commands/mod}.rs` | NEW | types per doc 01 §5.3; service: config JSON at `{app_data}/cloud-config.json` (atomic write), vault = keyring key + `session.vault` file; commands: `load_cloud_config` / `save_cloud_config` / `clear_cloud_config` / `vault_get` / `vault_set` / `vault_clear` (all `Result<_, String>`). **Key lifecycle pinned:** `get_or_create_key() -> Result<[u8; 32], String>` — read the keyring entry; **only `keyring::Error::NoEntry` takes the create path** (generate once, persist, reuse); any other keyring error fails closed and propagates — a transient keychain failure must never be treated as absence and regenerate over the stored key (re-keying would make every relaunch `AuthFailed` → silent re-sign-in, breaking Flow B). Key bytes stored via keyring v3 `set_secret`/`get_secret` (raw bytes — `set_password` with non-UTF-8 fails at runtime). **No-log constraint:** vault service/commands never log or debug-format values or results (no `{value:?}`/`{result:?}`) — the decrypted session carries the refresh token, and the template's `save_preferences` arg-logging idiom must not be copied here (it would bypass the vault via the on-disk log). |
| 1.2B | `src-tauri/src/features/mod.rs` + `src-tauri/src/bindings.rs` | MODIFY | register `cloud_session_commands::*`; regenerate via `npm run rust:bindings`                                                       |
| 1.2C | `src/lib/supabase/vault-storage.ts`                    | NEW    | `export const vaultStorage: { getItem(k): Promise<string \| null>; setItem(k, v): Promise<void>; removeItem(k): Promise<void> }` → wraps `commands.vaultGet/Set/Clear`. **Single-BLOB invariant (revised after live falsification, M1):** GoTrue in practice touches TWO storage keys — the session key and a transient PKCE `…-code-verifier` key (cleaned up on init; can arrive FIRST). Verifier-suffixed keys are backed **in-memory only** and never reach the vault. Among the remaining session-class keys the adapter binds the first it sees and **fails loudly** (key *names* only, never values) if a different one ever arrives — a supabase-js upgrade that adds another persistent key must fail visibly, not corrupt the session blob. |
| 1.2D | `src/lib/supabase/client.ts`                           | NEW    | `initSupabase(config: CloudConfig): SupabaseClient` (auth: `storage: vaultStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false`) · `getSupabase(): SupabaseClient` (throws `SupabaseNotInitializedError`) · `teardownSupabase(): Promise<void>` · `createProbeClient(url, key): SupabaseClient` (transient, `persistSession: false, autoRefreshToken: false` — pre-init enrollment probe; lives here so the single `vi.mock('@/lib/supabase/client')` seam covers test #11) |
| 1.2E | `src/features/cloud-session/services/configService.ts` | NEW    | `loadConfig(): Promise<CloudConfig \| null>` · `saveConfig(c): Promise<void>` · `clearConfig(): Promise<void>` · `parseEnrollmentPayload(raw: string): { url: string; key: string }` (throws `EnrollmentPayloadError`) · `probeProject(url, key): Promise<void>` (anonymous `app_meta` select via `createProbeClient` — the probe runs **before** `initSupabase` (Flow A step 2), so it cannot use `getSupabase()`; error ⇒ rejected — mirrors mobile) |
| 1.2F | `src/features/cloud-session/services/authService.ts`   | NEW    | `signIn(email, pw): Promise<void>` · `signOut(): Promise<void>` (vault + client teardown) · `restoreSession(): Promise<boolean>` · `checkSchemaGate(): Promise<'ok' \| 'mismatch'>` (`APP_REQUIRED_SCHEMA_VERSION = 1`) · `reauthenticate(pw): Promise<boolean>` |
| 1.2G | `src/test/setup.ts`                                    | MODIFY | mock the six new commands                                                                                                          |
| 1.2H | `package.json`                                         | MODIFY | add `@supabase/supabase-js` (map deps arrive in 3.2 — M1 must be gate-green standalone)                                            |
| 1.2I | `src-tauri/Cargo.toml`                                 | MODIFY | add `keyring = "3"` (consumed by 1.2A; the 1.1C touch added only the workspace member)                                             |

**Error handling:** config/vault command failures surface as toasts + `needs-setup`/`signed-out` fallbacks — a corrupt vault must degrade to re-sign-in, never crash the shell. `probeProject` distinguishes unreachable vs rejected (two i18n messages, mobile parity). `session.vault` writes are atomic (temp file + rename — the same pattern the preferences service ships) so a crash mid-write degrades to `Corrupt`→re-sign-in, never a half-file that parses.

### Phase 1.3 — Session store + bootstrap hooks

**Goal:** the session state machine of doc 01 §5.4 as a Zustand store + orchestration hooks.

| ID   | File                                                | Tag | Signatures                                                                                                                          |
| ---- | --------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1.3A | `src/features/cloud-session/store/session-store.ts` | NEW | `SessionState: 'booting' \| 'needs-setup' \| 'signed-out' \| 'schema-gate' \| 'active' \| 'locked'` · `useSessionStore` (devtools; selector-only per ast-grep) · actions `setState`, `lock`, `unlock` — **no health state or actions here**: health lives solely in the global health-store (AD11, created in 2.5A); M1 compiles and ships with zero health references |
| 1.3B | `src/features/cloud-session/hooks/useAuthBootstrap.ts` | NEW | `useAuthBootstrap(): void` — Flow A/B ordering (load config → init client → restore → gate)                                        |
| 1.3C | `src/features/cloud-session/types/index.ts` + `index.ts` barrel | NEW | public API: screens (1.4), `useSessionStore`, `useAuthBootstrap` — health types are **not** exported here; `HealthState`/`ChannelStatus` live in and export from `src/store/health-store.ts` (AD11) |

**Error handling:** bootstrap failures land in the nearest safe state (`needs-setup` on config errors, `signed-out` on auth errors) with a toast — never an infinite `booting`.

### Phase 1.4 — Session screens + shell wiring ⚠

**Goal:** Setup / SignIn / SchemaGate screens; MainWindow renders by session state.

| ID   | File                                                                    | Tag    | Signatures                                                                                          |
| ---- | ----------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| 1.4A | `src/features/cloud-session/components/{SetupScreen,SignInScreen,SchemaGateScreen}.tsx` | NEW | props-free; drive `configService`/`authService`; large-type, dark, wall-legible                     |
| 1.4B | `src/components/layout/MainWindow.tsx`                                  | MODIFY | remove `ResizablePanelGroup`/sidebars; keep TitleBar + global overlays; render `MainWindowContent` full-bleed |
| 1.4C | `src/components/layout/MainWindowContent.tsx`                           | MODIFY | switch on `useSessionStore(s => s.state)` → screen or `CanvassRoot` placeholder (until M2)          |
| 1.4D | `locales/{en,fr,ar}.json`                                               | MODIFY | `cloudSession.*` keys                                                                                |

**Error handling:** every screen shows service errors inline (translated), retry-able; no dead ends.

### Phase 2.1 — Canvass types, geo, mappers

**Goal:** the contract layer — raw rows in, clean view-models out, traps neutralized at one choke point.

| ID   | File                                       | Tag | Signatures                                                                                                                                              |
| ---- | ------------------------------------------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1A | `src/features/canvass/types/index.ts`      | NEW | `CaseRow` / `LocationRow` / `MediaRow` / `LocationFormData` (doc 01 §5.1) · `CanvassCase` / `CanvassLocation` / `CanvassMedia` view-models · `ActivityEntry` |
| 2.1B | `src/features/canvass/services/geo.ts`     | NEW | `parseWkbPoint(hex: string): { lat: number; lng: number } \| null` — handles SRID-flagged little-endian POINT; `(0,0)` and malformed ⇒ `null`             |
| 2.1C | `src/features/canvass/services/mappers.ts` | NEW | `toCanvassCase(row): CanvassCase \| null` (null when soft-deleted) · `toCanvassLocation(row): CanvassLocation \| null` · `toCanvassMedia(row): CanvassMedia \| null` · `latestArrival(fd): string \| null` · `investigatorLabel(row): string` · `visibleRows<T extends { deleted_at: string \| null }>(rows: T[]): T[]` |

**Error handling:** mappers never throw on malformed `form_data` — absent is absent (trap list §5.5.3).

### Phase 2.2 — Queries

**Goal:** case-partitioned TanStack Query layer over PostgREST.

| ID   | File                                             | Tag | Signatures                                                                                                                          |
| ---- | ------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2.2A | `src/features/canvass/services/canvassService.ts` | NEW | `fetchCases(): Promise<CanvassCase[]>` · `fetchLocations(caseId): Promise<CanvassLocation[]>` · `fetchMedia(caseId): Promise<CanvassMedia[]>` — **every fetch maps at the boundary** (`visibleRows` + `toCanvass*`); raw rows never enter a query cache. `fetchCases` pins server-side predicates: `deleted_at is null`, `status neq archived`, `order by updated_at desc`, `limit 50` — never an unbounded agency-archive pull. Select shape: `select('*')` + the schema gate is the **deliberate** drift strategy (fail-closed on version bump); explicit column lists are the payload optimization if it ever matters |
| 2.2B | `src/features/canvass/hooks/{useCases,useCaseLocations,useCaseMedia}.ts` | NEW | query keys `['cases']`, `['locations', caseId]`, `['media', caseId]`; success paths call `recordFetchOk()`, failures `recordFetchError()` (the `live` predicate needs positive confirmations). Cases/locations also get `refetchInterval: RECONCILE_MS (5 min)` — the lost-broadcast safety net (Flow E4). **Build-order note:** depends on the health-store (2.5A) — within M2, land 2.5A first; phase numbering is narrative grouping, not build order |

**Error handling:** query errors flow to the health store (`recordFetchError()`) — fetch failures are health signals, not just toasts (G4, AD11).

### Phase 2.3 — Realtime

**Goal:** AD1 broadcast subscription behind the case-partitioned consumer API; cache patching.

| ID   | File                                                | Tag | Signatures                                                                                                                            |
| ---- | --------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 2.3A | `src/features/canvass/services/realtimeService.ts`  | NEW | doc 01 §5.2 verbatim: `subscribeToCaseActivity(caseId, onEvent, onStatus): () => void`                                                 |
| 2.3B | `src/features/canvass/hooks/useCaseRealtime.ts`     | NEW | `useCaseRealtime(caseId): void` — maps incoming rows through `toCanvassLocation`/`toCanvassCase` **before** `setQueryData` (the same choke point as the fetch path — a live-patched row must render identically to a fetched one), patches by id (soft-delete ⇒ remove), appends `ActivityEntry`, stamps attention, invalidates that location's media, feeds the health store (`recordEvent()`, AD11) |

**Error handling:** unknown table/op payloads are ignored (logged debug) — forward-compatible with V2 traffic.

### Phase 2.4 — Canvass store + card list ⚠

**Goal:** selection/view/attention state + the vertical case-grouped card list (pre-map UI).

| ID   | File                                                     | Tag | Signatures                                                                                                                        |
| ---- | -------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2.4A | `src/features/canvass/store/canvass-store.ts`            | NEW | `selectedCaseId` · `selectedLocationId` · `view: 'cases' \| 'case' \| 'map'` (A1 three-view IA, AD12 — `'cases'` is the landing view; `'case'`/`'map'` require a selected case) · `activity: ActivityEntry[]` (ring 200) · `attentionByLocation: Record<string, number>` · actions (`selectCase`, `selectLocation`, `pushActivity`, `clearExpiredAttention`, `setView`) — selector-only access (repo-wide ast-grep `no-destructure` rule already covers any `use*Store`) |
| 2.4B | `src/features/canvass/components/{CanvassRoot,NavRail,CasesView,LocationCardStack,LocationCard}.tsx` | NEW | `CanvassRoot` mounts bootstrap-gated board = `NavRail` + active view; `NavRail` = slim icon rail (Cases / Case dashboard / Map — repurposes `LeftSideBar`'s slot, AD12; built rail-of-four so a V2 admin entry slots in); `CasesView` = landing grid, one card per active case (case number, incident address, status counts, last activity) replacing the planned CaseSwitcher dropdown; `LocationCard` renders name/address/status/investigator/arrival + DVR block (credentials always plain — ordinary strings by owner directive, no lock-state dependence). All new UI uses CSS logical properties (`text-start`, `ps-*`) per `i18n-patterns.md` — `ar.json` ships RTL |
| 2.4C | `locales/{en,fr,ar}.json`                                | MODIFY | `canvass.*` keys                                                                                                                   |
| 2.4D | `src/components/layout/MainWindowContent.tsx`            | MODIFY | swap the 1.4C placeholder for the real `CanvassRoot`                                                                               |

**Error handling:** empty states are designed states (no cases / no locations / no coordinates), not blank screens.

### Phase 2.5 — Connection health

**Goal:** the health state machine (doc 01 §5.4) fed by realtime status + fetch results, homed in the global layer (AD11). **Build order: 2.5A lands first within M2** — 2.2B and 2.3B call its actions.

| ID   | File                             | Tag | Signatures                                                                                                                       |
| ---- | -------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2.5A | `src/store/health-store.ts`      | NEW | `useHealthStore` (devtools, selector-only) · actions `recordEvent()` · `recordFetchOk()` · `recordFetchError()` · `channelStatus(s: ChannelStatus)` · exported pure `evaluate(marks, now): HealthState` · **canonical type definitions**: `HealthState = 'connecting' \| 'live' \| 'reconnecting' \| 'stale' \| 'offline'` and `ChannelStatus` (mapped from supabase-js subscribe states) — every other module imports these, never re-declares · constants `STALE_AFTER_MS = 90_000`, `RECONCILE_MS = 300_000`, `SIGNED_URL_KEY_PREFIX = 'signed-url'` (owned here so the M2 exclusion predicate never forward-references M4) |
| 2.5B | `src/hooks/useConnectionHealth.ts` | NEW | wires listeners (`online`/`offline`/`visibilitychange`) + interval `evaluate` → health-store; reconnect ⇒ invalidate **case-data queries** via the exclusion predicate on `SIGNED_URL_KEY_PREFIX` (imported from health-store — same milestone, no forward reference; matches nothing until M4) (Flow E, AD11) |

**Error handling:** the machine only degrades on evidence and only upgrades on confirmation (fetch OK or channel event) — no optimistic `live`.

### Phase 3.1 — Preferences: map + lock settings ⚠

**Goal:** `mapbox_token`, `map_style`, `idle_lock_minutes` end-to-end (Rust type → dialog).

| ID   | File                                                          | Tag    | Signatures                                                                            |
| ---- | ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| 3.1A | `src-tauri/src/features/preferences/types/mod.rs` (+ service defaults) | MODIFY | three new `Option<_>` fields, defaults `None`; regenerate bindings                    |
| 3.1B | `src/features/preferences/components/PreferencesDialog.tsx` (+ its service/type touchpoints) | MODIFY | token input (password-style field), style select (`standard-satellite` night default / `standard` / `dark-v11` — A2 design binding), idle-minutes number input |
| 3.1C (A2) | `src/assets/fonts/` + Tailwind v4 theme (`App.css` `@theme`) | NEW/MODIFY | vendor the Case File design system: woff2 fonts (Nacelle, Inter, JetBrains Mono, Share Tech Mono) + the handoff's color/status tokens as CSS variables — the binding design language for all M3–M6 UI (`design_handoff_canvas_hub/README.md`) |

**Error handling:** absent token is a designed state (Phase 3.2 gate screen), not an error.

### Phase 3.2 — Map canvas + CSP ⚠

**Goal:** Mapbox GL mounts inside the webview under a strict CSP; token gate.

| ID   | File                                                | Tag    | Signatures                                                                                                                            |
| ---- | --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2A | `src-tauri/tauri.conf.json`                         | MODIFY | CSP per doc 01 §7 row (supabase https+wss, `api.mapbox.com`/`events.mapbox.com`, `worker-src blob:`, `img-src`/`media-src` + `blob:`) |
| 3.2B | `src/features/canvass/components/MapCanvas.tsx`     | NEW    | `react-map-gl/mapbox` `<Map>`; viewport from incident coord; `MapTokenGate` inner component when token absent (designed state: grid-paper ground, board-still-works copy); token-rejected ⇒ toast. **A2 bindings:** default style satellite + `setConfigProperty('basemap','lightPreset','night')`; the map div **persists across views** (never unmount; `map.resize()` on view switch); scale strategy per AD15 (live-checked here) |
| 3.2C | `package.json`                                      | MODIFY | add `mapbox-gl` + `react-map-gl` (supabase-js landed in 1.2H)                                                                          |

**Error handling:** map load errors (bad token, offline tiles) render an inline diagnostic panel — board falls back to card list, never a black screen.

### Phase 3.3 — Markers, clustering, fly-to

**Goal:** the two-way selection contract (spec §4).

| ID   | File                                                  | Tag | Signatures                                                                                                                              |
| ---- | ----------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3A | `src/features/canvass/services/mapData.ts`            | NEW | `locationsToGeoJson(locs): FeatureCollection` (status + attention props) · `incidentFeature(c): Feature \| null` · cluster layer specs (Mapbox built-in clustering) |
| 3.3B | `src/features/canvass/components/MarkerLayer.tsx`     | NEW | source/layers; click marker ⇒ `selectLocation`; status colors (hollow-blue STARTED / solid-gold WORKING / solid-cyan-✓ COMPLETE — the design's core visual system); incident = red crosshair + pulsing halo; pulse class from attention. **A2 marker-binding rule (field-app lesson, MANDATORY):** any element handed to `new mapboxgl.Marker({element})` must never carry its own `position`/`transform`/`transition` — Mapbox owns those; all visual effects live on child elements (read `MARKER-BINDING-FIX (1).md` in the mobile repo before writing marker code). Also resolve ledger D16 here (single-select a11y: `role="option"`/`aria-selected` + `role="listbox"` on the stack — selection becomes functional with fly-to) |
| 3.3C | `src/features/canvass/hooks/useFlyTo.ts`              | NEW | `useFlyTo(mapRef): void` — card select ⇒ `flyTo(coord)`; marker select ⇒ card scroll-into-view (both directions, one owner)              |

**Error handling:** locations with `coord: null` never reach GeoJSON (they live on cards + a "no fix" chip).

### Phase 3.4 — Floating card stack over map

**Goal:** cards float over the map, case-grouped, vertical, clear of edges (spec §4 non-negotiables); wall typography pass.

| ID   | File                                                    | Tag    | Signatures                                                              |
| ---- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| 3.4A | `LocationCardStack.tsx` + `CanvassRoot.tsx`             | MODIFY | overlay positioning (floating, scrollable, no full-height rails); large-type styles |

**Error handling:** n/a (layout).

### Phase 4.1 — Signed URLs + thumbnails

**Goal:** media rows become visible images — signed-URL lifecycle handled once, fallbacks designed.

| ID   | File                                              | Tag | Signatures                                                                                                                              |
| ---- | ------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1A | `src/features/canvass/services/mediaService.ts`   | NEW | `createSignedUrl(bucket, path): Promise<string>` · `isInlineRenderable(mime): boolean` · `SIGNED_URL_TTL_S = 3600` · `SIGNED_URL_REFRESH_MS = 50 * 60_000`. Known ceiling: one signing call per thumbnail per refresh cycle — fine at ~10 locations/case; `createSignedUrls` (per-case batch) is the pinned upgrade path for dense cases |
| 4.1B | `src/features/canvass/hooks/useSignedUrl.ts`      | NEW | query key `[SIGNED_URL_KEY_PREFIX, bucket, path]` (prefix imported from health-store — the same constant the catch-up exclusion predicate matches) · `refetchInterval: SIGNED_URL_REFRESH_MS` (TTL × ~0.83) — **the interval is what re-signs a continuously-mounted wall-board thumbnail**; staleness alone never refetches an active query, and focus/reconnect must not be the only triggers · `staleTime 40 min` · `gcTime 55 min` · `refetchOnWindowFocus: false` |
| 4.1C | `src/features/canvass/components/MediaThumb.tsx`  | NEW | image thumb / count badge / fallback tile (HEIC etc. → placeholder + open-externally via opener plugin)                                   |

**Error handling:** a failed signed-URL fetch renders the fallback tile with retry — never a broken `<img>`. `<img>`/`<video>` `onError` **automatically invalidates that specific signed-URL query** (one auto re-sign, then the fallback tile with manual retry) — so after an outage longer than the 60-min TTL, an operator-less wall board self-heals immediately on reconnect instead of showing fallbacks until the next 50-min interval tick.

### Phase 4.2 — Media polling + diff (G3)

**Goal:** manufactured media freshness — the poll loop, the diff, and the attention signal it feeds.

| ID   | File                                              | Tag | Signatures                                                                                                                                 |
| ---- | ------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.2A | `src/features/canvass/services/attention.ts`      | NEW | `diffMedia(prev: CanvassMedia[], next: CanvassMedia[]): CanvassMedia[]` (new rows by id — the 2.2A boundary already filtered soft-deleted; `CanvassMedia` retains id/locationId/type/bucket/path/mime) · `mediaEntry(row: CanvassMedia): ActivityEntry` |
| 4.2B | `src/features/canvass/hooks/useMediaPolling.ts`   | NEW | `useMediaPolling(caseId): void` — `refetchInterval: MEDIA_POLL_MS (20 s)` gated on session ∈ {`active`, `locked`} && health ≠ `offline` (a locked wall board keeps polling — doc 01 §5.4); diff ⇒ activity + attention stamps |

**Error handling:** poll failures feed `recordFetchError()` (health), retry on next tick — no user-facing error per tick.

### Phase 4.3 — Video + media UX

**Goal:** on-demand video and the card's media strip (spec §5: media-forward, never a broken player).

| ID   | File                                                | Tag | Signatures                                                                                             |
| ---- | --------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------- |
| 4.3A | `src/features/canvass/components/VideoPlayer.tsx`   | NEW | on-demand modal player per the design (never autoplay, transport footer, filename/eyebrow header) — `<video preload="none">` + signed URL (progressive/range via storage CDN); unsupported mime ⇒ fallback panel |
| 4.3A′ (A2) | `src/features/canvass/components/ImageViewer.tsx`   | NEW | modal photo viewer per the design: ‹ › wrap-through navigation over the location's photos, filename/`PHOTO n OF N` header, metadata footer |
| 4.3B | `LocationCard.tsx`                                  | MODIFY | media strip: image thumbs inline, video/audio count badges, expand-to-view                              |

**Error handling:** `onError` of `<video>` swaps to the fallback panel (spec §5: never a black player).

### Phase 5.1 — Activity feed + pulses

**Goal:** the attention layer becomes visible — feed, marker pulse, card highlight (spec §6, first-class).

| ID   | File                                                   | Tag | Signatures                                                                                     |
| ---- | ------------------------------------------------------ | --- | ----------------------------------------------------------------------------------------------- |
| 5.1A | `src/features/canvass/components/ActivityFeed.tsx`     | NEW | most-recent-first, case-scoped, relative timestamps                                             |
| 5.1B | marker/card pulse wiring (`MarkerLayer`, `LocationCard`) | MODIFY | CSS keyframe pulse driven by `attentionByLocation` within `ATTENTION_TTL_MS (12 s)`           |

**Error handling:** n/a (presentation over existing state).

### Phase 5.2 — Connection indicator UI

**Goal:** honest liveness made visible — the persistent chip and the escalation banner (G4).

| ID   | File                                                              | Tag | Signatures                                                                   |
| ---- | ----------------------------------------------------------------- | --- | ----------------------------------------------------------------------------- |
| 5.2A | `src/features/cloud-session/components/ConnectionIndicator.tsx`   | NEW | persistent chip: state dot + "updated HH:MM:SS"; STALE/offline → banner mode  |

**Error handling:** n/a (renders the health store; the store owns degradation logic).

### Phase 5.3 — Dashboard + palette ⚠

**Goal:** the at-a-glance status board and command-palette entries (spec §4 dashboard view).

| ID   | File                                                 | Tag    | Signatures                                                                                              |
| ---- | ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| 5.3A | `src/features/canvass/components/DashboardView.tsx`  | NEW    | per the locked design (A2): incident panel + four stat tiles + media strip + full-width **investigator roster** grid (AD8; must handle 15+ investigators; location rows expand inline to the same detail block the map cards use — DVR grid, requested-video windows, notes, media thumbs). The activity feed does NOT live here — it lives in the ProcessPanel's ACTIVITY lane (AD14 revised), which is default-open |
| 5.3B | `src/lib/commands/feature-commands.ts`               | MODIFY | per-view go-to commands `canvass-view-cases` / `canvass-view-case` / `canvass-view-map` + `session-sign-out` (lazy imports per template pattern) — "toggle" is undefined over the A1 three-view rail, which is the primary nav; the palette mirrors it. `session-lock-now` deliberately waits for 6.1 — a lock command with no unlock overlay would strand an M5 build |
| 5.3C | `locales/{en,fr,ar}.json`                            | MODIFY | dashboard + command-label keys                                                                           |

**Error handling:** n/a (derives from existing queries; empty states per 2.4).

### Phase 6.1 — Idle lock ⚠

**Goal:** the kiosk posture — visible-but-locked board (content unchanged) with password resume (AD6).

| ID   | File                                                       | Tag | Signatures                                                                                                     |
| ---- | ---------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------- |
| 6.1A | `src/features/cloud-session/hooks/useIdleLock.ts`          | NEW | activity listeners + timer from `idle_lock_minutes` (default 15) ⇒ `lock()`                                     |
| 6.1B | `src/features/cloud-session/components/LockOverlay.tsx`    | NEW | input-swallowing overlay + password re-auth (`reauthenticate`); board visible beneath, content unchanged (lock alters nothing — owner directive) |
| 6.1C | `src/lib/commands/feature-commands.ts`                     | MODIFY | register `session-lock-now` — ships together with its unlock overlay (moved out of 5.3 so no build ever has a lock without an escape) |

**Error handling:** failed re-auth stays locked with inline error; sign-out remains reachable from the overlay.

### Phase 6.2 — Wake / reconnect catch-up

**Goal:** days-long-run resilience — every wake path converges on refresh → resubscribe → refetch (Flow E).

| ID   | File                                                     | Tag    | Signatures                                                                                                     |
| ---- | -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| 6.2A | `src/hooks/useConnectionHealth.ts` + `src/lib/supabase/client.ts` | MODIFY | on `visible`/`online`/resubscribe: check validity via `getSession()`/expiry and call `auth.refreshSession()` **only near/after expiry** (`autoRefreshToken` owns routine rotation; racing it can submit a rotated refresh token) → `realtime.setAuth()` → invalidate case-data queries (signed-URL excluded) (Flow E3, AD11) |

**Error handling:** refresh failure ⇒ `signed-out` with toast (session genuinely dead), not a silent stale board.

### Phase 6.3 — ProcessPanel: the ported terminal + ACTIVITY ↔ SYSTEM toggle (A2) ⚠

**Goal:** AD14 (revised) becomes real — the right-side collapsible panel, fed by canvas-hub sources.

| ID   | File                                                       | Tag    | Signatures                                                                                                     |
| ---- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| 6.3A | `src/features/process-panel/` (ported `processTerminal` + adapter) | NEW | port of the timeline-agent-sdk `processTerminal` feature (components/services/types as shipped there, gate-passed: strictTypeChecked, ast-grep, i18n keys, selector-only stores) + `sources/canvasHubSource.ts` — feeds the SYSTEM lane from health-store transitions, `read_log_tail` polling (via a diagnostics service wrapping `commands.readLogTail`/`commands.vaultStatus`), and boot/auth/gate events; the ACTIVITY lane renders the canvass activity ring. New-dep decision executed here: `react-data-grid` taken or TableCard dropped (AD14) |
| 6.3B | `src-tauri/src/features/cloud_session/{commands,services}/mod.rs` + `bindings.rs` | MODIFY | `read_log_tail(app, lines: u32)` (clamped ≤500, seek-from-end ≤64 KB, path `app_log_dir()/tauri-app.log`, defensively redacted) and `vault_status(app) -> VaultStatus` (presence-only booleans + `vault_mtime_ms: Option<f64>` — f64, specta rejects u64) move HERE from the old 7.1A (the panel is their consumer, not the windows); regenerate bindings |
| 6.3C | `MainWindow.tsx` + panel chrome | MODIFY | panel mount in the shell (right edge, below header), collapsed SYS tab, **default-open on ACTIVITY** (wall posture — spec §6 attention surface stays visible), header toggle button per the design |

**Error handling:** a failed log-tail read renders an inline panel error row, never breaks the board; the panel is chrome — its failure modes stay inside it.

### Phase 6.4 — Docs + verification pass

| ID   | File                                                   | Tag    | Content                                                                                      |
| ---- | ------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------- |
| 6.4A | `docs/developer/supabase-integration.md` + `README.md` index | NEW/MODIFY | the client/vault/health patterns for future work                                        |
| 6.4B | — threat-model walkthrough (doc 01 §10) against the running app; full `check:all`; live smoke per `driving-agent-shell` | — | verification, no code |

### Phase 7.1 — Rust `view_windows` feature + secondary entry ⚠ (A1)

**Goal:** window plumbing — create-once/show-hide secondary windows on the quick-pane pattern, all commands `async` (AGENTS.md CRITICAL: sync window commands deadlock WebView2 on Windows).

| ID   | File                                                       | Tag    | Signatures                                                                                                       |
| ---- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| 7.1A | `src-tauri/src/features/view_windows/{mod,commands/mod,services/mod,types/mod}.rs` | NEW | `pub async fn open_view_window(app: AppHandle, view: ViewWindow, case_id: Option<String>) -> Result<(), String>` — `ViewWindow` is a four-derive `#[serde(rename_all = "lowercase")] enum { Case, Map }` (**A2: Diagnostics removed** — the process panel is in-main, AD14 revised; invalid views unrepresentable over IPC; deliberately distinct from the store's view union). Focus-if-open retargets the existing window via `view-context` — **emitted JS-side only** (the invoking caller emits after the command resolves; the Rust command builds/focuses and returns — one emitter, `sessionEvents.ts`, never two); create-once otherwise (`window.html?view=…`). **Double-open race arm:** on build-Err, re-check for the window — if it now exists, focus + return Ok; destroy only on genuine partial creation (two interleaved async opens must not destroy the winner) · `pub async fn close_view_window(app, view: ViewWindow)`. (**A2:** `read_log_tail`/`vault_status` moved to Phase 6.3B — the process panel is their consumer.) |
| 7.1B | `window.html` + `src/window-main.tsx`                       | NEW    | secondary entry point (vite input, `quick-pane.html` precedent): mounts `SecondaryRoot` (canvass barrel — barrel-exported, no deep imports; **A2: no diagnostics branch**, the panel is in-main) |
| 7.1C | `src-tauri/tauri.conf.json` + **NEW `src-tauri/capabilities/view-windows.json`** + `vite.config.ts` + `features/mod.rs` + `bindings.rs` | MODIFY/NEW | secondary labels get their **own minimal capability file** (`quick-pane.json` precedent): `core:event:default` (listen — without it `onSessionToken` never fires and every secondary hits the boot timeout) + only the commands secondaries invoke. `default.json` stays `["main"]` — adding secondary labels there would grant the full main permission set to pop-outs, violating T9. Vite multi-entry; command registration; regenerate bindings. **M7 verification obligation (not unit-testable):** a live token push must reach a secondary window (capability-level proof, part of the M7 smoke test) |

**Error handling:** window-creation failure surfaces as a toast in the invoking window; a failed open never leaves a half-created ghost window (destroy on error — see `tauri-commands.md` secondary-window checklist).

### Phase 7.2 — Session propagation (main = sole auth owner, AD13) ⚠ (A1)

**Goal:** secondaries get live auth without ever touching the vault (T9).

| ID   | File                                                    | Tag    | Signatures                                                                                                        |
| ---- | -------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 7.2A | `src/lib/supabase/secondary-client.ts`                   | NEW    | `initSecondaryClient(url, key, initialToken): SupabaseClient` — created via **`createClient(url, key, { accessToken: async () => currentToken })`**: the access-token-only path that feeds **PostgREST, storage, AND realtime** without the refresh token ever leaving main (source-verified against installed 2.110.7 — `realtime.setAuth` alone leaves REST/storage authenticating as **anon** → RLS-empty board, 403 signing). Two pinned consequences: (a) with `accessToken` set, `supabase.auth.*` is a **throwing proxy** — secondary code never calls auth (no getSession/refreshSession; the secondary health display has NO wake-refresh path — main owns refresh); (b) no `onAuthStateChange` fires in secondaries — `updateSecondaryToken(token)` swaps the callback's closure token AND calls `realtime.setAuth(token)` (propagates in-place to joined channels; first subscribe happens only after the initial token is installed — setAuth-before-subscribe). Installs its client as this context's `getSupabase()` singleton — **the seam that lets reused services/views work unchanged**; `vaultStorage` is never referenced in a secondary context |
| 7.2B | `src/lib/services/sessionEvents.ts`                      | NEW    | typed Tauri events. **Initial delivery is a handshake, not a push**: the secondary emits `secondary-ready` on mount → main replies with `session-token` + `view-context` (a push at window-open races the listener attach — Tauri events aren't buffered, the emit lands before the listener exists and every open would boot to the timeout state). Ongoing: `session-token` on every `TOKEN_REFRESHED` · `view-context` (`{ view, caseId }` — also re-emitted on focus-if-open retarget) · **`session-locked` / `session-unlocked`** (AD6 parity: the secondary seeds **its own-context session-store** `locked`/`active` — interaction locks in step with main while the board KEEPS flowing unchanged; a wall display idles by default; killing the popped-out map on the 15-min lock timer would defeat A1's headline use case and revokes nothing) · `session-ended` (**sign-out only**) |
| 7.2C | `src/lib/supabase/client.ts` + `authService.ts`          | MODIFY | main's `onAuthStateChange(TOKEN_REFRESHED)` → `emitSessionToken`; `secondary-ready` → reply handshake; `signOut()` → `session-ended`; lock/unlock → `session-locked`/`session-unlocked`; `client.ts` gains the internal setter `initSecondaryClient` uses to claim the `getSupabase()` holder |

**Error handling:** on `session-ended` a secondary **tears down before it overlays**: remove channels, disconnect realtime, discard the in-memory token, drop the client — THEN render the terminal "session ended — reopen from the main window" state. (Sign-out revokes only the refresh token; the issued access token stays valid ~1 h — a live socket beneath the overlay would keep receiving agency broadcasts.) The boot timeout remains as a genuine-failure backstop after the handshake; a secondary never prompts for credentials (auth UI exists only in main).

### Phase 7.3 — Pop-out surfaces + diagnostics window (A1)

**Goal:** the product part — Map and Case dashboard open in their own windows; Cases stays bound; diagnostics window ships.

| ID   | File                                                     | Tag    | Signatures                                                                                                     |
| ---- | --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| 7.3A | `src/features/canvass/components/SecondaryRoot.tsx`      | NEW    | hosts `MapCanvas`-view or `DashboardView` with its own QueryClient + realtime subscription. Boot order pinned: **attach `session-token`/`view-context`/`session-locked`/`session-ended` listeners FIRST, then** emit `secondary-ready` (else the handshake reply re-races) → token installed (`initSecondaryClient`, which claims this context's `getSupabase()` seam) → `view-context` seeds **this context's own** canvass-store (`selectCase(caseId)`, `setView`) → queries + `subscribeToCaseActivity(caseId, …)` mount. **All three per-context singletons are seeded**: canvass-store (view-context), session-store (`session-locked`/`unlocked` → `locked`/`active`, keeping the reused components' lock behavior in step with main), and health — which is **refresh-passive**: the main `useConnectionHealth` wake-refresh path is never mounted here (`auth.refreshSession()` throws under the accessToken proxy); the secondary's health display feeds from `subscribeToCaseActivity`'s `onStatus` + query results only. Reuses the same view components — pop-out is hosting, not forking — precisely because the client seam and store seeding make the context indistinguishable to them |
| 7.3B | `NavRail.tsx` + `DashboardView.tsx`/`MapCanvas` chrome   | MODIFY | pop-out affordance on the `case` and `map` entries (never on `cases`); popped state indicated on the rail          |
| ~~7.3C~~ | — | — | **Removed by A2** — diagnostics content lives in the ProcessPanel (Phase 6.3); its services-own-IPC discipline note carries over there |

**Error handling:** closing a secondary window never mutates main-window state; main's board is authoritative regardless of what's popped out.

---

## Appendix A — File Manifest (new files)

`src-tauri/crates/secure-vault/{Cargo.toml, src/lib.rs}` · `src-tauri/src/features/cloud_session/{mod.rs, types/mod.rs, services/mod.rs, commands/mod.rs}` · `src/lib/supabase/{client.ts, vault-storage.ts}` · `src/store/health-store.ts` · `src/hooks/useConnectionHealth.ts` · `src/features/cloud-session/{index.ts, types/index.ts, store/session-store.ts, hooks/{useAuthBootstrap,useIdleLock}.ts, services/{configService,authService}.ts, components/{SetupScreen,SignInScreen,SchemaGateScreen,LockOverlay,ConnectionIndicator}.tsx}` · `src/features/canvass/{index.ts, types/index.ts, store/canvass-store.ts, services/{canvassService,realtimeService,mediaService,mappers,geo,mapData,attention}.ts, hooks/{useCases,useCaseLocations,useCaseMedia,useCaseRealtime,useMediaPolling,useSignedUrl,useFlyTo}.ts, components/{CanvassRoot,NavRail,CasesView,MapCanvas,MarkerLayer,LocationCardStack,LocationCard,MediaThumb,VideoPlayer,DashboardView,ActivityFeed,SecondaryRoot}.tsx}` · `docs/developer/supabase-integration.md` · **A1/M7:** `src-tauri/src/features/view_windows/{mod,commands/mod,services/mod,types/mod}.rs` · `src-tauri/capabilities/view-windows.json` · `window.html` · `src/window-main.tsx` · `src/lib/supabase/secondary-client.ts` · `src/lib/services/sessionEvents.ts` · ~~`src/features/cloud-session/{services/diagnosticsService.ts, hooks/useDiagnostics.ts, components/DiagnosticsView.tsx}`~~ (A2: replaced by the panel) · **A2:** `src/features/process-panel/` (ported `processTerminal` + `sources/canvasHubSource.ts` + diagnostics service/hook) · `src/features/canvass/components/ImageViewer.tsx` · `src/assets/fonts/` (4 woff2 families) — **≈ 65+ new files** (the exact count is generated by the tree, not this list — it has drifted three times; the enumeration above is the authority for *what*, not *how many*), all behind feature barrels, `lib/supabase`, and the global store/hooks layer (AD11).

## Appendix B — Integration Point Summary (modified files)

| File                                                | Phases         |
| --------------------------------------------------- | -------------- |
| `src-tauri/Cargo.toml`                              | 1.1, 1.2       |
| `src-tauri/src/features/mod.rs`, `src-tauri/src/bindings.rs` | 1.2   |
| `src/test/setup.ts`                                 | 1.2            |
| `src/components/layout/MainWindow.tsx`              | 1.4            |
| `src/components/layout/MainWindowContent.tsx`       | 1.4, 2.4       |
| `locales/{en,fr,ar}.json`                           | 1.4, 2.4, 5.3  |
| `src-tauri/src/features/preferences/types/mod.rs` (+ service) | 3.1  |
| `src/features/preferences/components/PreferencesDialog.tsx` | 3.1    |
| `src-tauri/tauri.conf.json`                         | 3.2            |
| `package.json`                                      | 1.2, 3.2       |
| `src/lib/commands/feature-commands.ts`              | 5.3, 6.1       |
| `docs/developer/README.md`                          | 6.3            |
| `src-tauri/tauri.conf.json`, `vite.config.ts` (A1 — `capabilities/view-windows.json` is NEW, `default.json` untouched) | 7.1 |
| `src/lib/supabase/client.ts`, `authService.ts` (A1) | 7.2            |

**Honesty metric:** 14 integration-point rows (≈19 physical files once multi-file rows — locales ×3, mod.rs+bindings.rs, types+service — are expanded; the two A1 rows touch one template file (`tauri.conf.json`, already counted) plus `vite.config.ts` and two plan-created files; plus regenerated `src/lib/bindings.ts` and lockfiles) across 63 new source files — everything substantive is additive behind barrels.

## Appendix C — Estimated Test Count per phase

| Phase | Tests    | Phase | Tests | Phase | Tests |
| ----- | -------- | ----- | ----- | ----- | ----- |
| 1.1   | 6 (Rust) | 2.5   | 5     | 4.3   | 4     |
| 1.2   | 14       | 3.1   | 2     | 5.1   | 4     |
| 1.3   | 5        | 3.2   | 2     | 5.2   | 3     |
| 1.4   | 4        | 3.3   | 5     | 5.3   | 4     |
| 2.1   | 12       | 3.4   | 2     | 6.1   | 5     |
| 2.2   | 6        | 4.1   | 5     | 6.2   | 3     |
| 2.3   | 6        | 4.2   | 4     | 6.3   | 5     |
| 2.4   | 11       | 7.1   | 2     | 6.4   | 0     |
| 7.2   | 4        | 7.3   | 3     |       |       |

**Total: 126** (6 Rust in `secure-vault`, 120 TypeScript; Revisions: #107 → 2.2, #108 → 6.1, #109 → 1.2, #110–121 → R4/A1 (with **#120 reassigned to Phase 6.3 by A2** — the panel owns diagnostics content), #122–126 → R5/A2: four ProcessPanel tests + the ImageViewer test). Must reconcile with the Test Spec's closing summary; if counts drift during implementation, reconcile both docs before proceeding.
