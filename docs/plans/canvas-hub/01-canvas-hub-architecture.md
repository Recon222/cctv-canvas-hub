# Canvas Hub V1 — Architecture & Design

**Role:** the design. Companion docs: `02-canvas-hub-implementation-plan.md` (**the how** — single source of truth for technical detail) and `03-canvas-hub-test-spec.md` (**the proof** — the checklist).

**Authority split:** this doc is authoritative for **data contracts and flows**; the implementation plan for **file-level technical detail and decisions**; the test spec for **coverage**.

**Basis:** `docs/plans/initial plan/canvas-hub-spec.md` (product spec; §3 is the pinned cloud contract) + the mobile repo as contract source of truth (`extraction_case_notes_react_native_expo`: `provisioning-sql.ts`, `sync-mapper.ts`, `enrollment-service.ts`, `supabase-client.ts`) + live verification against the provisioned `canvas-hub-dev` project (2026-07-19; see `CLAUDE.local.md`). **Supersedes:** nothing — first planning set. **Amended A1 (2026-07-19, post-M1, product decisions):** three-view information architecture on a left nav rail (Cases · Case dashboard · Map), multi-window pop-out topology (M7), diagnostics window. See doc 02 AD12–AD14.

---

## 1. Purpose

Canvas Hub V1 is a live, read-only project-room command centre: a Tauri v2 + React 19 desktop app that signs into an agency's own Supabase cloud as a coordinator, renders the active canvass — incident scene, per-location status, investigators, media — on a map-maximal wall display, and reflects change within seconds with an explicit attention layer and honest connection-health reporting. It delivers two new frontend features (`cloud-session`, `canvass`), one new Rust feature (`cloud_session`) backed by a new pure-logic crate (`secure-vault`), a shared Supabase client module (`src/lib/supabase/`), and small modifications to the template shell (layout, preferences, CSP, command palette, i18n).

## 2. Problem Statement

Concrete gaps this feature closes. IDs are referenced throughout all three docs.

| ID     | Gap                          | Reality traced to                                                                                                                                                                                                        |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G1** | No live operational picture  | Coordination today is group texts + a whiteboard (spec §1). The cloud already carries everything needed (spec §3) — nothing consumes it on a big screen.                                                                  |
| **G2** | Contract-faithful read path  | The hub must read the real tables/columns/buckets — including traps verified live: RPCs omit `user_id`/`form_data` and **do not filter `deleted_at`**; PostGIS `location` arrives as WKB hex; GPS `(0,0)` means "no fix". |
| **G3** | Media is not on realtime     | New media rows emit no event and don't bump `updated_at` (spec §3, "Known gap"). Freshness must be manufactured by polling without lying about it.                                                                        |
| **G4** | Trustworthiness of the board | A stale board that looks live is an operational hazard (spec §2.4, §6). Connection health and last-updated must be first-class state, not decoration.                                                                     |
| **G5** | Hardened always-on session   | A long-lived coordinator session on an unattended machine is the soft target (spec §7). Session-at-rest encryption, no credential leakage, idle lock.                                                                     |
| **G6** | V2 doors must stay open      | Per-case auth, assignment writes, per-case realtime channels arrive in V2 (spec §7–8). The one fatal V1 mistake is an un-partitioned client.                                                                              |

## 3. Design Principles

Ranked — when two conflict, the lower number wins.

1. **Honest liveness.** Never present stale as live. Connection state, last-updated, and reconnection are product features (G4, spec §6).
2. **Contract fidelity.** Spec §3 + the provisioning SQL are the only source of truth. No invented projections; every read handles `deleted_at`, missing `form_data` keys, and `(0,0)` (G2).
3. **Glanceable from across a room.** Map dominates; information floats; type is large; the thing that changed draws the eye (spec §2, §4, §6).
4. **Case-partitioned everywhere.** Data, state, and the realtime subscription are keyed by `case_id`. No agency-wide firehose in client architecture, even while V1's wire topic is agency-wide (G6, spec §9.3).
5. **Read-only discipline.** V1 never writes to the agency cloud (spec §9.1). The only writes are local (config, preferences, session vault).
6. **Template conventions over novelty.** Feature-based layout, state onion, services own IPC/cloud calls, strict gates (`AGENTS.md`, spec §10).
7. **Fewest moving parts.** Prefer the smallest mechanism that meets 1–6 (e.g. one poll loop, one broadcast channel, one vault).

## 4. System Architecture

### Runtime shape

```
┌─ Investigator phones (mobile app) ── push-only sync ──────────────┐
│                                                                   ▼
│                                    ┌────────────── Agency Supabase (canvas-hub-dev in dev) ─┐
│                                    │  Auth (password grant, coordinator account)            │
│                                    │  PostgREST: cloud_cases / cloud_locations /            │
│                                    │             cloud_media_files (RLS: agency-wide        │
│                                    │             SELECT, owner-only writes) · app_meta      │
│                                    │             (authenticated SELECT; anon reads filter   │
│                                    │             to EMPTY, not error — live-verified)       │
│                                    │  Storage: images / video / audio (private, signed URL) │
│                                    │  Realtime: broadcast topic `agency:activity`           │
│                                    │            (+ postgres_changes publication, unused V1) │
│                                    └───────▲───────────────▲────────────────▲───────────────┘
│                                       REST/auth        WebSocket        signed URLs
│                                            │               │                │
┌───────────────────────────────────────────┼───────────────┼────────────────┼────────────────┐
│ Canvas Hub (Tauri v2 desktop, wall TV)    │               │                │                │
│                                           │               │                │                │
│  React (webview)                          │               │                │                │
│  ┌─ features/cloud-session ─┐   ┌─ src/lib/supabase ──────┴──────┐   ┌─ features/canvass ─┐ │
│  │ enrollment · sign-in     │──▶│ client singleton (supabase-js) │◀──│ queries · realtime │ │
│  │ schema gate · idle lock  │   │ auth storage = session vault   │   │ map · cards · dash │ │
│  │ health state             │   └────────────▲───────────────────┘   │ media · attention  │ │
│  └───────────┬──────────────┘                │ commands.* (IPC)      └────────────────────┘ │
│              │ commands.* (IPC)              │                                              │
│  Rust        ▼                               ▼                                              │
│  ┌─ features/cloud_session ────────────────────────────────────┐  ┌─ crates/secure-vault ─┐ │
│  │ cloud config (app-data JSON, designed-public url+key)       │  │ AES-256-GCM seal/open │ │
│  │ session vault (key in OS keychain, ciphertext in app data)  │─▶│ (pure, unit-tested)   │ │
│  └─────────────────────────────────────────────────────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Feature-module tree

```
src/
├── lib/supabase/                          NEW   client singleton + vault-backed auth storage
│   ├── client.ts                          NEW   init/get/teardown; realtime auth wiring
│   └── vault-storage.ts                   NEW   supabase-js async storage adapter → IPC vault
├── features/cloud-session/                NEW   session lifecycle feature
│   ├── components/  (SetupScreen, SignInScreen, SchemaGateScreen, LockOverlay,
│   │                 ConnectionIndicator)  NEW
│   ├── hooks/       (useAuthBootstrap, useIdleLock)                               NEW
│   ├── services/    (configService, authService)                                  NEW
│   ├── store/       (session-store.ts)                                            NEW
│   ├── types/ · __tests__/ · index.ts                                             NEW
├── store/health-store.ts                  NEW   global connection-health store + pure evaluate() (cross-cutting — see AD11)
├── hooks/useConnectionHealth.ts           NEW   cross-cutting wiring hook (listeners, evaluate interval, catch-up)
├── features/canvass/                      NEW   the live board feature
│   ├── components/  (CanvassRoot, MapCanvas, MarkerLayer, LocationCardStack,
│   │                 LocationCard, MediaThumb, VideoPlayer, DashboardView,
│   │                 ActivityFeed, CaseSwitcher)                                   NEW
│   ├── hooks/       (useCases, useCaseLocations, useCaseMedia, useCaseRealtime,
│   │                 useMediaPolling, useSignedUrl)                                NEW
│   ├── services/    (canvassService, realtimeService, mediaService, geo,
│   │                 mappers, attention)                                           NEW
│   ├── store/       (canvass-store.ts)                                             NEW
│   ├── types/ · __tests__/ · index.ts                                              NEW
├── components/layout/MainWindow.tsx       MODIFIED  drop sidebar panels; render NavRail + active view (A1)
│   (A1: `LeftSideBar` is repurposed as a slim icon NavRail — navigation chrome
│    switching Cases / Case dashboard / Map, NOT an info panel; spec §4's
│    "no edge-docked panels" governs location info, which stays floating.)
├── components/layout/MainWindowContent.tsx MODIFIED  host CanvassRoot (or session screens)
├── lib/commands/feature-commands.ts       MODIFIED  palette entries (view toggle, lock now…)
└── locales/{en,fr,ar}.json                MODIFIED  cloudSession.* / canvass.* keys

src-tauri/
├── crates/secure-vault/                   NEW   pure AES-256-GCM seal/open (no tauri dep)
├── src/features/cloud_session/            NEW   commands + services + types (config, vault)
├── src/features/mod.rs                    MODIFIED  register cloud_session
├── src/bindings.rs                        MODIFIED  collect new commands
├── src/features/preferences/types/mod.rs  MODIFIED  mapbox_token / map_style / idle_lock_minutes
├── Cargo.toml                             MODIFIED  workspace member + keyring dep
└── tauri.conf.json                        MODIFIED  CSP for Supabase + Mapbox + blob workers

DELETED: nothing (LeftSideBar/RightSideBar become unreferenced → flagged for a later /cleanup pass; see §11)
```

## 5. Data Contracts

### 5.1 Cloud rows (pinned by spec §3; names verified against `provisioning-sql.ts` and live `canvas-hub-dev`)

TypeScript shapes as read from PostgREST (snake_case, verbatim). Signatures only.

```ts
// features/canvass/types — raw rows
interface CaseRow {
  id: string
  user_id: string
  case_number: string
  display_name: string | null
  status: 'draft' | 'complete' | 'archived'
  notes: string | null
  metadata: CaseMetadata | null // { oicName?, oicBadgeNumber?, videoCoordinatorName?, videoCoordinatorBadgeNumber?, unit?, completedBy? }
  incident_business_name: string
  incident_street_address: string
  incident_city: string
  incident_address: string
  incident_latitude: number | null
  incident_longitude: number | null
  incident_coordinate_accuracy: number | null
  incident_coordinate_source: 'gps' | 'manual' | 'geocoded' | null
  created_at: string
  updated_at: string
  synced_at: string
  deleted_at: string | null // non-null ⇒ hidden, everywhere
}

interface LocationRow {
  id: string
  case_id: string
  user_id: string
  location_name: string
  status: 'started' | 'working' | 'complete'
  business_name: string
  street_address: string
  city: string
  full_address: string
  location: string | null // PostGIS geography → WKB hex via PostgREST; parse client-side (AD2)
  coordinate_accuracy: number | null
  coordinate_source: string | null
  location_contact: string
  location_phone: string
  requester_name: string // the investigator at this location — drives the roster (AD8)
  requester_badge_number: string
  requester_unit: string
  requester_phone: string
  requester_email: string
  duplicated_from: string | null
  form_data: LocationFormData // every field optional; older rows predate newer keys
  content_hash: string | null
  created_at: string
  updated_at: string
  synced_at: string
  deleted_at: string | null
}

interface MediaRow {
  id: string
  case_id: string
  location_id: string
  user_id: string
  type: 'image' | 'video' | 'audio'
  category: string | null // 'dvr-original' | 'dvr-cropped' are per-location singletons; all else is its own row
  filename: string
  mime_type: string
  size_bytes: number
  storage_bucket: 'images' | 'video' | 'audio'
  storage_path: string // {userId}/{caseId}/{locationId}/{filename}
  metadata: Record<string, unknown>
  created_at: string
  synced_at: string
  deleted_at: string | null
}
```

```ts
// form_data — camelCase inside (mobile LocationFormData passthrough). ALL optional.
interface LocationFormData {
  arrivalDepartures?: {
    id?: string
    arrivalDateTime?: string
    departureDateTime?: string
  }[]
  scopes?: {
    id?: string
    startDateTime?: string
    endDateTime?: string
    isActualTime?: boolean
    cameras?: string
  }[]
  cameras?: {
    id?: string
    cameraName?: string
    resolution?: string
    recordingFps?: string
    latitude?: number
    longitude?: number
    coordinateAccuracy?: number
  }[]
  dvrInformation?: {
    dvrLocation?: string
    dvrTypeBrand?: string
    serialModelNumber?: string
    dvrUsername?: string
    dvrPassword?: string // rendered PLAINLY when unlocked (spec §3/§7); masked only while idle-locked (AD6)
    numberOfChannels?: string
    activeCameras?: string
    recordingSchedule?: string
    resolution?: string
    recordingFps?: string
    firstRecordedDate?: string
    totalDvrRetention?: string
    daysUntilOverwritten?: string
  }
  timeOffset?: {
    dvrDateTime?: string
    actualDateTime?: string
    timeDifference?: string
    dvrAppliesDST?: boolean
  } // *ImageUri fields exist but are device-local — never render
  exportInformation?: {
    exportMedia?: string
    fileType?: string
    sizeGb?: string
    mediaPlayerIncluded?: string
    mediaProvidedVia?: string
  }
  notes?: string
  dateTimeCompleted?: string
  completedBy?: string
}
```

**Deliberate subset (no silent gaps):** the cloud shape (spec §3) also carries `scopes[].correctedStart/EndDateTime`, `scopes[].dstAdjusted*`, `extractedScopes`, `cameras[].coordinateSource/coordinateCapturedAt`, `timeOffset.ocrConfidence/captureMethod/*ImageUri`, `notesSections`, and `notesFreeText`. V1 renders none of them, so they are not modeled — they pass through `form_data` untouched and cost nothing **to parse** (they do cross the wire under `select('*')` — accepted; explicit column lists are the payload optimization if it ever matters). Add keys to the interface only when a surface consumes them.

### 5.2 Realtime channel contract (AD1)

- Topic **`agency:activity`**, private broadcast channel (`realtime.messages` RLS authorizes authenticated members). Client: `supabase.channel('agency:activity', { config: { private: true } })`, subscribe to `broadcast` events; call `supabase.realtime.setAuth()` after sign-in.
- Payload from `realtime.broadcast_changes` (trigger `broadcast_agency_activity`): event name = `INSERT`|`UPDATE`|`DELETE`; payload carries `{ operation, table ('cloud_cases'|'cloud_locations'), schema, record, old_record }` — full new+old rows. _Payload shape asserted from Supabase docs + trigger source; verified live in M2 before anything builds on it (test spec #47)._
- **Client partition rule (G6):** the only consumer API is `subscribeToCaseActivity(caseId, handlers)` — events are filtered by `record.case_id` before dispatch. V2 migrates by swapping the topic string to `case:{id}:activity`; the consumer API does not change.
- **Type ownership:** `ChannelStatus` (mapped from supabase-js subscribe states) and `HealthState` are defined once, in `src/store/health-store.ts`; `realtimeService` imports them — never re-declares.

```ts
// features/canvass/services/realtimeService.ts
type ActivityEvent =
  | { table: 'cloud_cases'; op: Op; row: CaseRow; old: CaseRow | null }
  | { table: 'cloud_locations'; op: Op; row: LocationRow; old: LocationRow | null }
type Op = 'INSERT' | 'UPDATE' | 'DELETE'
function subscribeToCaseActivity(
  caseId: string,
  onEvent: (e: ActivityEvent) => void,
  onStatus: (s: ChannelStatus) => void
): () => void
```

### 5.3 Local contracts (Rust ⇄ TS, via tauri-specta)

```rust
// src-tauri/src/features/cloud_session/types/mod.rs
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CloudConfig {
    pub url: String,             // https://{ref}.supabase.co
    pub publishable_key: String, // sb_publishable_… — designed-public, RLS-bounded
    pub signed_in_email: Option<String>, // convenience for re-auth prompt; NOT a secret
}

// Commands (all Result<_, String> — callers only surface the message; per rust-architecture.md convention)
pub async fn load_cloud_config(app: AppHandle) -> Result<Option<CloudConfig>, String>;
pub async fn save_cloud_config(app: AppHandle, config: CloudConfig) -> Result<(), String>;
pub async fn clear_cloud_config(app: AppHandle) -> Result<(), String>;
pub async fn vault_get(app: AppHandle) -> Result<Option<String>, String>; // decrypted session JSON
pub async fn vault_set(app: AppHandle, value: String) -> Result<(), String>;
pub async fn vault_clear(app: AppHandle) -> Result<(), String>;
```

```rust
// src-tauri/crates/secure-vault/src/lib.rs — pure, no tauri/keyring deps
pub fn seal(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, VaultError>; // nonce ‖ ciphertext
pub fn open(key: &[u8; 32], sealed: &[u8]) -> Result<Vec<u8>, VaultError>;
pub fn generate_key() -> [u8; 32];
```

Vault layout: 32-byte key in the OS keychain (`keyring` crate, service `com.tauri-app.app`, entry `session-vault-key`); `nonce‖ciphertext` file at `{app_data}/session.vault`. Rationale: Windows Credential Manager caps blobs at ~2.5 KB — a GoTrue session JSON regularly exceeds it. Same split the mobile app uses (`LargeSecureStore`).

```ts
// AppPreferences additions (preferences feature, MODIFIED)
interface AppPreferences {
  /* existing: theme, quick_pane_shortcut, language */
  mapbox_token: string | null
  map_style: string | null // null → default dark style
  idle_lock_minutes: number | null // null → 15
}
```

### 5.4 State semantics

**Session state** (`features/cloud-session/store/session-store.ts`):

| State           | Predicate                                    | Behavior                              | UI                                   |
| --------------- | -------------------------------------------- | ------------------------------------- | ------------------------------------ |
| `booting`       | bootstrap (Flow A/B) still resolving         | nothing renders data                  | splash/blank shell (must exit to another state — see Phase 1.3 error handling) |
| `needs-setup`   | no `CloudConfig` on disk                     | nothing cloud-side runs               | SetupScreen (enrollment paste/probe) |
| `signed-out`    | config present, no session                   | client initialized, no subscriptions  | SignInScreen                         |
| `schema-gate`   | signed in, `app_meta.schema_version ≠ 1`     | block all data features               | SchemaGateScreen (version mismatch)  |
| `active`        | signed in, gate passed, not locked           | queries + realtime + polling run      | CanvassRoot (board)                  |
| `locked`        | `active` + idle timer elapsed                | **data keeps flowing** — queries, realtime, and media polling all continue (a wall display is idle by default; only `offline`/`signed-out` stop data); interaction dead | Board visible under LockOverlay; DVR credentials masked; password re-auth to resume |

**Connection health** (global `src/store/health-store.ts` — cross-cutting by design, see AD11; pure `evaluate()` exported alongside):

| State          | Predicate                                                          | Behavior                                       | UI                                    |
| -------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------- |
| `connecting`   | initial channel subscribe in flight                                | queries run; no live badge                     | indicator: "connecting…"              |
| `live`         | channel `SUBSCRIBED` and last confirm < `STALE_AFTER_MS`           | normal                                         | green dot + "updated HH:MM:SS"        |
| `reconnecting` | channel dropped/errored; supabase-js retrying                      | on resubscribe: refetch all case queries       | amber dot + "reconnecting…"           |
| `stale`        | no realtime confirm AND no successful fetch for > `STALE_AFTER_MS` | keep retrying; polling continues               | red banner "STALE since HH:MM" (G4)   |
| `offline`      | `navigator.onLine === false`                                       | pause polling; on `online`: refresh + refetch  | red banner "offline"                  |

**Attention** (`canvass-store`): `ActivityEntry { id, at, caseId, kind: 'location-new' | 'location-status' | 'location-updated' | 'media-new' | 'case-updated', locationId?, summary }` — in-memory ring (cap 200, AD7); `attentionByLocation: Record<string, number>` (a plain record, not a `Map` — Zustand selectors compare references; in-place `Map` mutation would silently skip re-renders) drives marker pulse / card highlight for `ATTENTION_TTL_MS` (~12 s).

### 5.5 Derived read rules (the trap list, all unit-tested)

1. `deleted_at !== null` ⇒ row invisible — applied at the mapper, and the mapper runs at **every cache boundary**: initial fetch, the realtime patch (Flow C3), and the media fetch. Raw rows never enter a query cache, so no consumer can forget (verified live: RPCs return soft-deleted rows).
2. `location` WKB → `{lat,lng}`; parse failure or `(0,0)` ⇒ `coord: null` ⇒ card-only (no marker), counted in a "no fix" chip.
3. Every `form_data` field optional; latest `arrivalDateTime` across `arrivalDepartures` = "arrived HH:MM"; absent blocks render as absent, never `undefined` text.
4. Investigator display = `requester_name` per location (fallback: shortened `user_id`); roster derives from location rows — auth admin API is not reachable with the publishable key (AD8).
5. Media: `mime_type` ∈ renderable set (`image/jpeg|png|webp`, `video/mp4`) → inline; else placeholder + open-externally (HEIC/QuickTime, spec §3/§5).

## 6. Data Flows

**Flow A — first run (enroll → sign in → board).**

1. Boot: `load_cloud_config` → `None` → `needs-setup`.
2. Coordinator pastes enrollment payload `{v,url,key}` (or url+key manually) → probe = anonymous `app_meta` select must not **error** (mirrors mobile `enrollDevice`). RLS filters the anonymous read to an empty result — success is "no error", not "rows returned" (live-verified against canvas-hub-dev: HTTP 200, `[]`).
3. `save_cloud_config` → init supabase client (vault storage adapter) → `signed-out`.
4. Password sign-in → session persisted to vault (adapter) → `realtime.setAuth()`.
5. Schema gate: read the `schema_version` **row** from `app_meta` (key/value table — `{ key: 'schema_version', value: { version: N } }`, live-verified); `version ≠ 1` → `schema-gate` (blocked); else `active`.

**Flow B — relaunch (always-on machine).**

1. Config found → client init; supabase-js reads session from vault adapter, auto-refreshes token.
2. No/expired-beyond-refresh session → `signed-out`. Else gate check → `active`; subscriptions + polling start.

**Flow C — live location change (the seconds-loop).**

1. Investigator's phone updates `cloud_locations` → trigger broadcasts on `agency:activity`.
2. `subscribeToCaseActivity` filters by active `case_id` → typed `ActivityEvent`.
3. `useCaseRealtime` maps the payload row through `toCanvassLocation`/`toCanvassCase` (the trap-list choke point — §5.5), then patches the TanStack cache in place (`setQueryData` by row id; INSERT **upserts by id** — broadcast redelivery and races with in-flight refetches must not duplicate a card; DELETE/soft-delete removes), records `lastEventAt`, appends `ActivityEntry`, stamps `attentionByLocation`.
4. Map marker re-colors + pulses; card highlights; feed prepends — no refetch needed (payload carries the full row).

**Flow D — media arrival (poll, G3).**

1. `useCaseMedia(caseId)` refetches every `MEDIA_POLL_MS` (20 s) while the session is `active` **or `locked`** (a wall display is idle most of its life) and the connection is not `offline`.
2. Diff vs previous by id → new rows ⇒ `media-new` ActivityEntry + attention stamp on the location; thumbnails mount via signed-URL query (TTL-cached, refreshed before expiry).
3. Any location `ActivityEvent` also invalidates that location's media immediately (spec §3 answer).

**Flow E — disconnect / reconnect / wake.**

1. Channel drops → `reconnecting`; supabase-js retries with backoff; polling continues (independent freshness).
2. Threshold breached with no successful fetch → `stale` (red banner; G4 honesty).
3. On resubscribe / `online` / `visibilitychange→visible`: check session validity (`getSession()`/expiry) and call `auth.refreshSession()` **only when near/after expiry** — `autoRefreshToken` owns routine rotation, and racing it risks submitting a rotated refresh token → `realtime.setAuth()` → invalidate case-data queries (catch-up refetch, signed-URL queries excluded — they refresh on their own interval) → `live`.
4. Safety net for lost broadcasts: case-data queries also refetch on a slow interval (`RECONCILE_MS`, 5 min). Broadcast is best-effort with no replay — a silently dropped event on a healthy socket must not outlive one reconciliation cycle (spec §6: never present stale as live).

**Flow F — idle lock / unlock.**

1. No pointer/keyboard for `idle_lock_minutes` → `locked`: overlay swallows input, DVR credentials mask, board stays visible (it's a wall display in a secured room — going dark defeats the product; AD6).
2. Unlock: password re-auth via `signInWithPassword(signed_in_email, pw)` → `active`. Failed attempts stay locked.

## 7. Integration Points

| Existing file                                   | Change                                                          | Why                                            |
| ----------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `src/components/layout/MainWindow.tsx`          | drop sidebar panels/handles; render content full-bleed          | spec §4: map-maximal, no edge-docked panels    |
| `src/components/layout/MainWindowContent.tsx`   | render session screens / `CanvassRoot` by session state         | single mount point, App.tsx untouched          |
| `src/lib/commands/feature-commands.ts`          | add palette commands (toggle dashboard, lock now, sign out)     | template command-centric design                |
| `src/test/setup.ts`                             | mock new `cloud_session` commands                               | template testing convention                    |
| `locales/en.json` / `fr.json` / `ar.json`       | `cloudSession.*`, `canvass.*` keys                              | i18n rule: all strings in locales              |
| `package.json`                                  | `@supabase/supabase-js`, `mapbox-gl`, `react-map-gl`            | §9 Dependencies                                |
| `src-tauri/Cargo.toml`                          | workspace member `crates/secure-vault`; `keyring` dep           | vault (G5)                                     |
| `src-tauri/src/features/mod.rs` + `bindings.rs` | register `cloud_session` commands                               | template registration flow                     |
| `src-tauri/src/features/preferences/types/mod.rs` (+ service defaults) | add `mapbox_token`, `map_style`, `idle_lock_minutes` | map config + lock cadence are user preferences |
| `src/features/preferences/components/PreferencesDialog.tsx` | inputs for the three new fields                    | preferences must stay editable in-app          |
| `docs/developer/README.md`                      | index the new `supabase-integration.md`                         | docs rule (AGENTS.md #10)                      |
| `src-tauri/tauri.conf.json`                     | CSP: `connect-src` supabase (https+wss) + mapbox; `worker-src`/`child-src blob:`; `img-src`/`media-src` supabase + `blob:` | Mapbox GL workers + storage/media fetch        |
| `src/lib/bindings.ts`                           | regenerated (`npm run rust:bindings`) — never hand-edited       | generated artifact                             |

Honesty: 12 integration-point rows, ≈17 physical files once multi-file rows are expanded (+1 regenerated). Everything else lands as new files behind feature barrels. Counts reconcile with Implementation Plan Appendix B.

## 8. Open Design Decisions

| #   | Question                                | Options                                                    | Recommendation                                                            |
| --- | --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| OD1 | Realtime substrate                      | broadcast `agency:activity` · postgres_changes per case    | **broadcast** (mobile team's designed path; carries old+new; V2 topic swap) |
| OD2 | Coordinates from `location`             | client WKB parse · RPC lat/lng + client join               | **WKB parse** (RPC omits `user_id`/`form_data`/`deleted_at` — verified)   |
| OD3 | Media freshness cadence                 | per-location visible-only queries · one per-case query     | **one per-case query @ 20 s** + event-triggered refetch                   |
| OD4 | Map binding                             | raw `mapbox-gl` · `react-map-gl` wrapper                   | **react-map-gl v8** (declarative markers/viewport; React 19-ready)        |
| OD5 | Session-at-rest storage                 | keychain-only · key-in-keychain + ciphertext file          | **vault split** (Windows credential blob ≈ 2.5 KB cap; mobile precedent)  |
| OD6 | Idle lock UX on a wall display          | blank/black lock · interaction lock + credential masking   | **interaction lock + masking** (board stays visible; spec §1 vs §7 tension resolved) |
| OD7 | Activity feed persistence               | in-memory ring · persisted (SQLite/file)                   | **in-memory, cap 200** (V1; persistence has no stated consumer)           |
| OD8 | Investigator identity source            | auth admin listing · `requester_name` from location rows   | **requester_name** (publishable key cannot list auth users)               |
| OD9 | Sidebars of the template shell          | delete files · stop rendering, files dormant               | **stop rendering** (smallest diff; delete in a later /cleanup)            |

Every row must be resolved in the Implementation Plan's Architecture Decisions table.

## 9. Dependencies

| Dependency                       | Side | Version | Purpose                                    |
| -------------------------------- | ---- | ------- | ------------------------------------------ |
| `@supabase/supabase-js`          | JS   | ^2      | auth, PostgREST, realtime, storage         |
| `mapbox-gl`                      | JS   | ^3      | map engine (Mapbox fixed by spec §4)       |
| `react-map-gl`                   | JS   | ^8      | React binding (`react-map-gl/mapbox`)      |
| `keyring`                        | Rust | ^3      | OS keychain for the vault key — raw bytes via `set_secret`/`get_secret` (never `set_password` with non-UTF-8 key material). Needs explicit platform features (`windows-native`, `apple-native`, `sync-secret-service`) — bare `keyring = "3"` compiles to a no-op store |
| `aes-gcm`, `rand`                | Rust | 0.10 / ^0.8 | secure-vault crate (pure)              |

No other new dependencies. Clustering uses Mapbox GL's built-in GeoJSON clustering (no `supercluster` dep).

## 10. Security / Threat Model

Long-lived coordinator session on an always-on host (G5). Enumerated:

| #   | Threat                                                       | Mitigation                                                                                       |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| T1  | Session theft from disk (image/backup/exfil)                 | AES-256-GCM vault; key only in OS keychain; ciphertext useless alone (AD5)                       |
| T2  | Unattended console interaction                               | idle interaction-lock + password re-auth; DVR credentials masked while locked (AD6)              |
| T3  | Credential/token leakage via logs or error UI                | tokens never logged; error paths surface messages, never session objects; no session in devtools-persisted state |
| T4  | Publishable key + URL on disk in plain JSON                  | by design — designed-public, RLS-bounded values (mobile enrollment QR carries the same pair)     |
| T5  | Signed URL leakage (bearer URLs grant temporary media access)| short TTL (60 min), held in query cache only, never logged/persisted                             |
| T6  | Stale board misleading live operations                       | health state machine + STALE banner; last-updated always visible (G4 — a safety mitigation, not UX polish) |
| T7  | Webview code injection reading agency data                   | strict CSP (no remote script; mapbox workers via `blob:` only; `connect-src` allow-list of the two hosts) |
| T8  | V1 write-path abuse from the hub                             | no write code paths exist; cloud RLS refuses coordinator writes anyway (verified live: HTTP 403) |
| T9 (A1) | Secondary pop-out windows widening the session attack surface | main window is the **sole auth owner** — vault, keyring, and token refresh never run in a secondary context; secondaries hold the access token in memory only (pushed via Tauri event, `persistSession: false`), so closing them leaves nothing at rest (AD13) |

**Accepted risks (explicit):** DVR credentials are rendered in clear when unlocked — that is the product requirement ("police inside a police building", spec §3/§7). Agency-wide reads are V1's shipped RLS posture; the hub scopes by case in UI/state only — real per-case authorization is V2's `case_members`. The OS user account securing the keychain is the trust anchor; a compromised OS session defeats the vault — mitigated operationally (secured room, kiosk posture), not cryptographically.

## 11. Net Effect

Additive feature set; nothing deleted in V1. Dormant after this lands (candidates for a later `/cleanup` pass, deliberately out of scope): `RightSideBar` + ui-store visibility state and palette/menu toggles (OD9; **A1: `LeftSideBar` exits dormancy — repurposed as the NavRail**), and the template's `example-feature` demo surface. The `quick-pane` feature is retained as the **reference implementation for secondary windows** (M7 reuses its create-once/show-hide lifecycle and async-command discipline — `AGENTS.md` "Window-Creating Commands Must Be `async`"). The template's recovery, preferences, command-palette, i18n, and quality-gate infrastructure is used as-is.

### A1 — Multi-window topology (M7)

The **case dashboard and map views can pop out as secondary Tauri windows** (two-screen command centre: map on the wall TV, dashboard at the operator desk); the **Cases view stays bound** to the main window; a small **diagnostics window** (health-state detail, log tail, vault status, versions) rides the same machinery. Pinned decisions:

1. **Separate JS contexts are the ground truth** — no shared React/Zustand/Query state, no shared supabase client. Each secondary window runs its own read-only data stack.
2. **Main window is the sole auth owner** (T9). Secondaries never touch the vault or keyring and never run a refresh ticker: two GoTrueClients on one storage key is a documented concurrency hazard. Main pushes the access token over Tauri events (`session-token` on window-open and on every `TOKEN_REFRESHED`; `session-ended` on sign-out/lock), and secondaries run `persistSession: false` clients, calling `realtime.setAuth(token)` for their own case-scoped subscriptions.
3. **Window lifecycle copies quick-pane**: create-once/show-hide, native-✕ handling, and **async Rust commands only** (sync window commands deadlock WebView2 on Windows — AGENTS.md CRITICAL).
4. **The Claude-design prototype never sees multi-window** — it designs the three views + rail single-window; pop-out is wiring, not design.

**Upstream notes (for the mobile/cloud team, not this app):** the shipped RPCs (`locations_for_case`, `locations_in_view`) return soft-deleted rows and omit `user_id`/`form_data` — verified live. V1 routes around this (AD2); a v2 RPC revision should add a `deleted_at is null` predicate. Putting `cloud_media_files` on the realtime substrate remains the known V2 cloud-side addition (spec §3).
