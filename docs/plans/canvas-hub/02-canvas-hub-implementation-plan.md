# Canvas Hub V1 — Implementation Plan

**Role:** the how — single source of truth for technical detail. Companions: `01-canvas-hub-architecture.md` (**the design** — authoritative for data contracts & flows) and `03-canvas-hub-test-spec.md` (**the proof** — the checklist).

**Basis:** `01-canvas-hub-architecture.md`, itself grounded in `canvas-hub-spec.md` §3 and the mobile repo's provisioning/enrollment sources, verified live against `canvas-hub-dev`. **Supersedes:** nothing.

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
| AD6 | Idle lock UX (OD6)        | Interaction lock + DVR-credential masking; board stays visible; password re-auth | A blanked wall display defeats the product (spec §1 vs §7 tension — resolved in favor of both: visible board, dead controls, masked secrets). _Full blank lock rejected_ for the primary persona; the secured room is the perimeter. |
| AD7 | Feed persistence (OD7)    | In-memory ring, cap 200, session-scoped            | No stated consumer for history (spec §6 wants "recent"). _Persisted feed rejected_: schema + retention questions with no requirement behind them (YAGNI).                                        |
| AD8 | Investigator identity (OD8) | `requester_name` (+ badge) from location rows; fallback short `user_id` | Publishable key cannot list auth users — verified. _Auth admin listing rejected_: requires the secret key, which must never live on the hub (spec §7).                                          |
| AD9 | Template sidebars (OD9)   | Stop rendering panels in `MainWindow`; files stay  | Smallest diff that satisfies "no edge-docked panels". _Deleting files rejected for V1_: touches menus/shortcuts/commands/tests for zero product value; scheduled for a later `/cleanup`.        |
| AD10 | Schema gate              | `APP_REQUIRED_SCHEMA_VERSION = 1` checked after sign-in; mismatch blocks the app | Mirrors the phones' fail-closed gate so a stale/partial cloud can't render a half-true board. _No gate rejected_: violates Honest Liveness (principle 1).                                       |
| AD11 | Cross-feature seams (net-new; no OD) | Connection health lives in the **global layer** (`src/store/health-store.ts` + `src/hooks/useConnectionHealth.ts`), not inside either feature — `HealthState` and `ChannelStatus` are defined there, once; catch-up invalidation targets **case-data queries only** via an exclusion predicate on the `'signed-url'` key prefix (exported from `mediaService`) — signed URLs refresh on their own interval (4.1B) and must not be mass-regenerated on every wifi blip; the only feature→feature imports are **one-way, read-only barrel consumptions**: canvass → cloud-session (session state for gating/masking) and canvass/cloud-session → preferences via the **barrel-exported `usePreferences` hook** — the preferences *service* is not barrel-exported, and `App.tsx`'s existing relative deep import of it predates this plan and must not be copied (an aliased deep import fails `ast:lint`). `lib/supabase/vault-storage.ts` calling `commands.*` outside a feature `services/` dir is a sanctioned adapter (it *is* the storage seam of the client singleton). | Architecture-guide rule 5 says features communicate via events, and today zero feature→feature imports exist — so the seams are named and bounded here instead of appearing ad hoc. _Event-bus health signals rejected_: health is shared **state** (a store), not a notification; the global-store layer is the documented home for exactly this. _cloud-session-owned health rejected_: canvass would then import cloud-session services (a cycle risk). _Unfiltered invalidation rejected_: it refetches every mounted signed-URL query — N storage calls + a visible thumbnail flash per reconnect. |

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
| **M6**    | Kiosk hardening: idle lock, wake catch-up, preferences UI, docs             | After idle timeout the board stays visible but locked with DVR credentials masked; password resumes; sleep/wake catches up missed events; preferences edit token/style/idle minutes. |

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
| 1.2A | `src-tauri/src/features/cloud_session/{mod,types/mod,services/mod,commands/mod}.rs` | NEW | types per doc 01 §5.3; service: config JSON at `{app_data}/cloud-config.json` (atomic write), vault = keyring key + `session.vault` file; commands: `load_cloud_config` / `save_cloud_config` / `clear_cloud_config` / `vault_get` / `vault_set` / `vault_clear` (all `Result<_, String>`). **Key lifecycle pinned:** `get_or_create_key() -> Result<[u8; 32], String>` — read the keyring entry; if absent, generate **once**, persist, reuse; `generate_key()` runs only on the create path (re-keying per write would make every relaunch `AuthFailed` → silent re-sign-in, breaking Flow B). Key bytes stored via keyring v3 `set_secret`/`get_secret` (raw bytes — `set_password` with non-UTF-8 fails at runtime). **No-log constraint:** vault service/commands never log or debug-format values or results (no `{value:?}`/`{result:?}`) — the decrypted session carries the refresh token, and the template's `save_preferences` arg-logging idiom must not be copied here (it would bypass the vault via the on-disk log). |
| 1.2B | `src-tauri/src/features/mod.rs` + `src-tauri/src/bindings.rs` | MODIFY | register `cloud_session_commands::*`; regenerate via `npm run rust:bindings`                                                       |
| 1.2C | `src/lib/supabase/vault-storage.ts`                    | NEW    | `export const vaultStorage: { getItem(k): Promise<string \| null>; setItem(k, v): Promise<void>; removeItem(k): Promise<void> }` → wraps `commands.vaultGet/Set/Clear`. **Single-key invariant (documented + asserted):** the vault holds one blob; supabase-js passes exactly one storage key today (password grant, `detectSessionInUrl: false`). The adapter records the first key it sees and **warns loudly** (logs the key *name* only) if a different key ever arrives — a supabase-js upgrade that adds a second key must fail visibly, not corrupt the session blob. |
| 1.2D | `src/lib/supabase/client.ts`                           | NEW    | `initSupabase(config: CloudConfig): SupabaseClient` (auth: `storage: vaultStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false`) · `getSupabase(): SupabaseClient` (throws `SupabaseNotInitializedError`) · `teardownSupabase(): Promise<void>` |
| 1.2E | `src/features/cloud-session/services/configService.ts` | NEW    | `loadConfig(): Promise<CloudConfig \| null>` · `saveConfig(c): Promise<void>` · `clearConfig(): Promise<void>` · `parseEnrollmentPayload(raw: string): { url: string; key: string }` (throws `EnrollmentPayloadError`) · `probeProject(url, key): Promise<void>` (anonymous `app_meta` select; error ⇒ rejected — mirrors mobile) |
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
| 2.4A | `src/features/canvass/store/canvass-store.ts`            | NEW | `selectedCaseId` · `selectedLocationId` · `view: 'map' \| 'dashboard'` · `activity: ActivityEntry[]` (ring 200) · `attentionByLocation: Record<string, number>` · actions (`selectCase`, `selectLocation`, `pushActivity`, `clearExpiredAttention`, `setView`) — selector-only access (repo-wide ast-grep `no-destructure` rule already covers any `use*Store`) |
| 2.4B | `src/features/canvass/components/{CanvassRoot,CaseSwitcher,LocationCardStack,LocationCard}.tsx` | NEW | `CanvassRoot` mounts bootstrap-gated board; `LocationCard` renders name/address/status/investigator/arrival + DVR block (credentials plain; masked when `locked`). All new UI uses CSS logical properties (`text-start`, `ps-*`) per `i18n-patterns.md` — `ar.json` ships RTL |
| 2.4C | `locales/{en,fr,ar}.json`                                | MODIFY | `canvass.*` keys                                                                                                                   |
| 2.4D | `src/components/layout/MainWindowContent.tsx`            | MODIFY | swap the 1.4C placeholder for the real `CanvassRoot`                                                                               |

**Error handling:** empty states are designed states (no cases / no locations / no coordinates), not blank screens.

### Phase 2.5 — Connection health

**Goal:** the health state machine (doc 01 §5.4) fed by realtime status + fetch results, homed in the global layer (AD11). **Build order: 2.5A lands first within M2** — 2.2B and 2.3B call its actions.

| ID   | File                             | Tag | Signatures                                                                                                                       |
| ---- | -------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2.5A | `src/store/health-store.ts`      | NEW | `useHealthStore` (devtools, selector-only) · actions `recordEvent()` · `recordFetchOk()` · `recordFetchError()` · `channelStatus(s: ChannelStatus)` · exported pure `evaluate(marks, now): HealthState` · **canonical type definitions**: `HealthState = 'connecting' \| 'live' \| 'reconnecting' \| 'stale' \| 'offline'` and `ChannelStatus` (mapped from supabase-js subscribe states) — every other module imports these, never re-declares · constants `STALE_AFTER_MS = 90_000`, `RECONCILE_MS = 300_000` |
| 2.5B | `src/hooks/useConnectionHealth.ts` | NEW | wires listeners (`online`/`offline`/`visibilitychange`) + interval `evaluate` → health-store; reconnect ⇒ invalidate **case-data queries** via the `'signed-url'` exclusion predicate (Flow E, AD11 — never mass-regenerate signed URLs) |

**Error handling:** the machine only degrades on evidence and only upgrades on confirmation (fetch OK or channel event) — no optimistic `live`.

### Phase 3.1 — Preferences: map + lock settings ⚠

**Goal:** `mapbox_token`, `map_style`, `idle_lock_minutes` end-to-end (Rust type → dialog).

| ID   | File                                                          | Tag    | Signatures                                                                            |
| ---- | ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| 3.1A | `src-tauri/src/features/preferences/types/mod.rs` (+ service defaults) | MODIFY | three new `Option<_>` fields, defaults `None`; regenerate bindings                    |
| 3.1B | `src/features/preferences/components/PreferencesDialog.tsx` (+ its service/type touchpoints) | MODIFY | token input (password-style field), style URL input, idle-minutes number input        |

**Error handling:** absent token is a designed state (Phase 3.2 gate screen), not an error.

### Phase 3.2 — Map canvas + CSP ⚠

**Goal:** Mapbox GL mounts inside the webview under a strict CSP; token gate.

| ID   | File                                                | Tag    | Signatures                                                                                                                            |
| ---- | --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2A | `src-tauri/tauri.conf.json`                         | MODIFY | CSP per doc 01 §7 row (supabase https+wss, `api.mapbox.com`/`events.mapbox.com`, `worker-src blob:`, `img-src`/`media-src` + `blob:`) |
| 3.2B | `src/features/canvass/components/MapCanvas.tsx`     | NEW    | `react-map-gl/mapbox` `<Map>`; viewport from incident coord; `MapTokenGate` inner component when token absent                          |
| 3.2C | `package.json`                                      | MODIFY | add `mapbox-gl` + `react-map-gl` (supabase-js landed in 1.2H)                                                                          |

**Error handling:** map load errors (bad token, offline tiles) render an inline diagnostic panel — board falls back to card list, never a black screen.

### Phase 3.3 — Markers, clustering, fly-to

**Goal:** the two-way selection contract (spec §4).

| ID   | File                                                  | Tag | Signatures                                                                                                                              |
| ---- | ----------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3A | `src/features/canvass/services/mapData.ts`            | NEW | `locationsToGeoJson(locs): FeatureCollection` (status + attention props) · `incidentFeature(c): Feature \| null` · cluster layer specs (Mapbox built-in clustering) |
| 3.3B | `src/features/canvass/components/MarkerLayer.tsx`     | NEW | source/layers; click marker ⇒ `selectLocation`; status colors; incident distinct; pulse class from attention                             |
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
| 4.1B | `src/features/canvass/hooks/useSignedUrl.ts`      | NEW | query key `['signed-url', bucket, path]` · `refetchInterval: SIGNED_URL_REFRESH_MS` (TTL × ~0.83) — **the interval is what re-signs a continuously-mounted wall-board thumbnail**; staleness alone never refetches an active query, and focus/reconnect must not be the only triggers · `staleTime 40 min` · `gcTime 55 min` · `refetchOnWindowFocus: false` |
| 4.1C | `src/features/canvass/components/MediaThumb.tsx`  | NEW | image thumb / count badge / fallback tile (HEIC etc. → placeholder + open-externally via opener plugin)                                   |

**Error handling:** a failed signed-URL fetch renders the fallback tile with retry — never a broken `<img>`.

### Phase 4.2 — Media polling + diff (G3)

**Goal:** manufactured media freshness — the poll loop, the diff, and the attention signal it feeds.

| ID   | File                                              | Tag | Signatures                                                                                                                                 |
| ---- | ------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.2A | `src/features/canvass/services/attention.ts`      | NEW | `diffMedia(prev: MediaRow[], next: MediaRow[]): MediaRow[]` (new visible rows by id) · `mediaEntry(row): ActivityEntry`                     |
| 4.2B | `src/features/canvass/hooks/useMediaPolling.ts`   | NEW | `useMediaPolling(caseId): void` — `refetchInterval: MEDIA_POLL_MS (20 s)` gated on session ∈ {`active`, `locked`} && health ≠ `offline` (a locked wall board keeps polling — doc 01 §5.4); diff ⇒ activity + attention stamps |

**Error handling:** poll failures feed `recordFetchError()` (health), retry on next tick — no user-facing error per tick.

### Phase 4.3 — Video + media UX

**Goal:** on-demand video and the card's media strip (spec §5: media-forward, never a broken player).

| ID   | File                                                | Tag | Signatures                                                                                             |
| ---- | --------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------- |
| 4.3A | `src/features/canvass/components/VideoPlayer.tsx`   | NEW | on-demand `<video controls preload="none">` + signed URL (progressive/range via storage CDN); unsupported mime ⇒ fallback panel |
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
| 5.3A | `src/features/canvass/components/DashboardView.tsx`  | NEW    | status counts, roster (investigator → locations/status via AD8), embedded `ActivityFeed`                 |
| 5.3B | `src/lib/commands/feature-commands.ts`               | MODIFY | `canvass-toggle-view`, `session-sign-out` (lazy imports per template pattern). `session-lock-now` deliberately waits for 6.1 — a lock command with no unlock overlay would strand an M5 build |
| 5.3C | `locales/{en,fr,ar}.json`                            | MODIFY | dashboard + command-label keys                                                                           |

**Error handling:** n/a (derives from existing queries; empty states per 2.4).

### Phase 6.1 — Idle lock ⚠

**Goal:** the kiosk posture — visible-but-locked board with masked credentials and password resume (AD6).

| ID   | File                                                       | Tag | Signatures                                                                                                     |
| ---- | ---------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------- |
| 6.1A | `src/features/cloud-session/hooks/useIdleLock.ts`          | NEW | activity listeners + timer from `idle_lock_minutes` (default 15) ⇒ `lock()`                                     |
| 6.1B | `src/features/cloud-session/components/LockOverlay.tsx`    | NEW | input-swallowing overlay + password re-auth (`reauthenticate`); board visible beneath; `locked` masks DVR creds |
| 6.1C | `src/lib/commands/feature-commands.ts`                     | MODIFY | register `session-lock-now` — ships together with its unlock overlay (moved out of 5.3 so no build ever has a lock without an escape) |

**Error handling:** failed re-auth stays locked with inline error; sign-out remains reachable from the overlay.

### Phase 6.2 — Wake / reconnect catch-up

**Goal:** days-long-run resilience — every wake path converges on refresh → resubscribe → refetch (Flow E).

| ID   | File                                                     | Tag    | Signatures                                                                                                     |
| ---- | -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| 6.2A | `src/hooks/useConnectionHealth.ts` + `src/lib/supabase/client.ts` | MODIFY | on `visible`/`online`/resubscribe: check validity via `getSession()`/expiry and call `auth.refreshSession()` **only near/after expiry** (`autoRefreshToken` owns routine rotation; racing it can submit a rotated refresh token) → `realtime.setAuth()` → invalidate case-data queries (signed-URL excluded) (Flow E3, AD11) |

**Error handling:** refresh failure ⇒ `signed-out` with toast (session genuinely dead), not a silent stale board.

### Phase 6.3 — Docs + verification pass

| ID   | File                                                   | Tag    | Content                                                                                      |
| ---- | ------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------- |
| 6.3A | `docs/developer/supabase-integration.md` + `README.md` index | NEW/MODIFY | the client/vault/health patterns for future work                                        |
| 6.3B | — threat-model walkthrough (doc 01 §10) against the running app; full `check:all`; live smoke per `driving-agent-shell` | — | verification, no code |

---

## Appendix A — File Manifest (new files)

`src-tauri/crates/secure-vault/{Cargo.toml, src/lib.rs}` · `src-tauri/src/features/cloud_session/{mod.rs, types/mod.rs, services/mod.rs, commands/mod.rs}` · `src/lib/supabase/{client.ts, vault-storage.ts}` · `src/store/health-store.ts` · `src/hooks/useConnectionHealth.ts` · `src/features/cloud-session/{index.ts, types/index.ts, store/session-store.ts, hooks/{useAuthBootstrap,useIdleLock}.ts, services/{configService,authService}.ts, components/{SetupScreen,SignInScreen,SchemaGateScreen,LockOverlay,ConnectionIndicator}.tsx}` · `src/features/canvass/{index.ts, types/index.ts, store/canvass-store.ts, services/{canvassService,realtimeService,mediaService,mappers,geo,mapData,attention}.ts, hooks/{useCases,useCaseLocations,useCaseMedia,useCaseRealtime,useMediaPolling,useSignedUrl,useFlyTo}.ts, components/{CanvassRoot,CaseSwitcher,MapCanvas,MarkerLayer,LocationCardStack,LocationCard,MediaThumb,VideoPlayer,DashboardView,ActivityFeed}.tsx}` · `docs/developer/supabase-integration.md` — **50 new source files** (test files per doc 03 on top), all behind the two feature barrels, `lib/supabase`, and the global store/hooks layer (AD11).

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

**Honesty metric:** 12 integration-point rows (≈17 physical files once multi-file rows — locales ×3, mod.rs+bindings.rs, types+service — are expanded; plus regenerated `src/lib/bindings.ts` and lockfiles) across 50 new source files — everything substantive is additive behind barrels.

## Appendix C — Estimated Test Count per phase

| Phase | Tests    | Phase | Tests | Phase | Tests |
| ----- | -------- | ----- | ----- | ----- | ----- |
| 1.1   | 6 (Rust) | 2.5   | 5     | 4.3   | 3     |
| 1.2   | 13       | 3.1   | 2     | 5.1   | 4     |
| 1.3   | 5        | 3.2   | 2     | 5.2   | 3     |
| 1.4   | 4        | 3.3   | 5     | 5.3   | 4     |
| 2.1   | 12       | 3.4   | 2     | 6.1   | 4     |
| 2.2   | 6        | 4.1   | 5     | 6.2   | 3     |
| 2.3   | 6        | 4.2   | 4     | 6.3   | 0     |
| 2.4   | 9        |       |       |       |       |

**Total: 107** (6 Rust in `secure-vault`, 101 TypeScript; the Revision R1 addition #107 counts under Phase 2.2). Must reconcile with the Test Spec's closing summary; if counts drift during implementation, reconcile both docs before proceeding.
