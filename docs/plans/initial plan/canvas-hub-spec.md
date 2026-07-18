# Canvas Hub — Design Spec

**For:** the agent building this app (you're in the Tauri v2 + React + Rust template — its patterns are in `AGENTS.md` and `docs/developer/`; this spec does not re-explain them).

**What this is:** a **live-connected project-room command centre** — a desktop companion to the CCTV Recovery Notes mobile app. Field investigators canvass an area for CCTV/DVR video after a major crime; this app is the wall-TV hub a **video coordinator / officer-in-charge (OIC)** watches to see, in real time, who is where, what's been found, and where to redirect people. It reads directly from the agency's own Supabase cloud (the backend the mobile app provisions and pushes to). Read-live now; two-way (coordinators assign locations) is a phased follow-on.

This spec is deliberately heavy on **what** and **what success looks like**, and light on **how**. Component structure, state library, styling system, and file layout are yours to choose within the template's conventions. The **non-negotiables** section is the part that must not drift.

**Source repo (reference only — this spec is self-contained; consult it to verify, not to build against).** It may be outside your project root; if you can't read it, the pinned contracts below are authoritative. Everything lives in the mobile app: `D:\Work Coding Projects\CCTV Recovery Notes App\extraction_case_notes_react_native_expo`.
- Cloud row shapes: `src/features/sync/services/sync-mapper.ts` + `src/features/sync/types/index.ts`.
- `form_data` blob: `src/types/form.types.ts` (`LocationFormData`).
- Cloud schema / RLS / realtime this hub reads from: design doc `docs/plans/byo-supabase-provisioning/01-byo-supabase-architecture.md`; actual DDL `src/features/agency-cloud/services/provisioning-sql.ts`.

---

## 1. Users & context

- **Primary:** a coordinator/OIC in a project room, watching a large wall-mounted TV, during a live major-crime canvass. 5–30 investigators are fanned out around an incident, extracting or reviewing video and reporting what they find. Coordination today is text messages and phone calls — this replaces the whiteboard.
- **Secondary:** a forensic video office keeping a permanent live board of all active cases.
- **The machine:** an always-on, single-purpose desktop in a secured room, often unattended, running for days. Treat it as kiosk-style and as a security-sensitive host (Section 7).

The mental model the UI must serve: **an incident at the centre, investigators fanning out to surrounding locations, the coordinator watching the pattern fill in and moving people toward what matters.**

---

## 2. What success looks like

A coordinator glances at the TV from across the room and immediately knows:

1. **Where everyone is.** Every canvass location for the active case(s) is a marker on a map that dominates the screen. The incident scene is visually distinct from canvass locations.
2. **What's happening right now.** When an investigator arrives at a location, changes its status, or uploads a photo of a DVR screen, the hub reflects it **within seconds, with no manual refresh**, and draws the eye to the thing that just changed.
3. **What's been found.** Photos taken at a location surface on that location's card without a click. Video is viewable on demand.
4. **Whether the picture is trustworthy.** A persistent, honest indicator shows the live connection is healthy and when data last updated. A stale board that *looks* live is a failure, not a cosmetic issue.
5. **It's organised by case.** Everything groups under a case. In a project room that's usually one case; a forensic office may watch several.

Great means: a coordinator runs a canvass from this screen instead of a group text, and notices a key find (a direction of travel, a suspect vehicle on video) fast enough to redirect a nearby investigator while it still matters.

---

## 3. Data contract (non-negotiable — this is the connective tissue you can't see)

The cloud is an agency-owned **Supabase** (Postgres + Storage + Realtime) project. You connect with `@supabase/supabase-js` using a **project URL + publishable key** (`sb_publishable_…`) and an authenticated session (Section 7). Buckets are private → use **signed URLs**.

### Tables (read these; column names are authoritative)

**`cloud_cases`** — one row per case.
`id` (uuid, pk) · `user_id` (creator) · `case_number` · `display_name` · `status` (`draft`|`complete`|`archived`) · `notes` · `metadata` (jsonb) · `incident_business_name` · `incident_street_address` · `incident_city` · `incident_address` · `incident_latitude` (real) · `incident_longitude` (real) · `incident_coordinate_accuracy` · `incident_coordinate_source` (`gps`|`manual`|`geocoded`) · `created_at` · `updated_at` · `synced_at` · `deleted_at` (nullable — soft delete; treat non-null as hidden).

→ The `incident_*` fields are the **crime scene** — the centre of the canvass. Plot it distinctly.

**`cloud_locations`** — many per case; each is a canvass location (a business/address with cameras).
`id` (uuid, pk) · `case_id` (fk) · `user_id` (the investigator) · `location_name` · `status` (`started`|`working`|`complete`) · `business_name` · `street_address` · `city` · `full_address` · `location` (**PostGIS `geography(point,4326)`** — longitude/latitude) · `coordinate_accuracy` · `coordinate_source` · `location_contact` · `location_phone` · `requester_name` · `requester_badge_number` · `requester_unit` · `requester_phone` · `requester_email` · `duplicated_from` · `form_data` (**jsonb**, see below) · `content_hash` · `created_at` · `updated_at` · `synced_at` · `deleted_at`.

→ `status` is the live pulse of the canvass (`started` → `working` → `complete`). `location` needs PostGIS extraction — either select via an RPC that returns lng/lat, or use the provided RPCs (below). GPS `(0,0)` means "no fix" — treat as no coordinate.

**`cloud_media_files`** — many per location.
`id` (uuid, pk) · `case_id` (fk) · `location_id` (fk) · `user_id` · `type` · `category` · `filename` · `mime_type` · `size_bytes` · `storage_bucket` · `storage_path` · `metadata` (jsonb) · `created_at` · `synced_at` · `deleted_at` · unique `(location_id, category)`.

→ `storage_path` convention is `{userId}/{caseId}/{locationId}/{filename}`. Fetch via signed URL from `storage_bucket`.

**`form_data` (jsonb) — pinned shape.** The mobile app's sync mapper passes this blob through verbatim, so the cloud shape *is* the mobile `LocationFormData` type. CamelCase keys inside; all timestamps are ISO-8601 strings; treat every field as optional and degrade gracefully (older rows predate newer keys). Render the **top-level columns** as the source of truth and dig into `form_data` for the enrichment below.

```jsonc
form_data: {
  // ARRIVAL / DEPARTURE — the live "on scene" signal. Array (an investigator can
  // arrive/leave more than once); use the latest arrivalDateTime as "arrived at HH:MM".
  arrivalDepartures: [ { id, arrivalDateTime, departureDateTime } ],   // ISO strings

  // REQUESTED VIDEO WINDOWS the investigator is after at this location.
  scopes: [ { id, startDateTime, endDateTime, isActualTime, cameras /* free text */,
              correctedStartDateTime?, correctedEndDateTime?,
              dstAdjustedStartDateTime?, dstAdjustedEndDateTime?, dstAdjustmentApplied? } ],
  extractedScopes?: [ /* auto-calculated actual-time windows; shape varies, treat as opaque */ ],

  // PER-CAMERA INVENTORY — cameras carry their own GPS (captured standing under them).
  // You CAN plot individual cameras, not just the location pin (the mobile app has a
  // "cameras on map" view). coordinateSource is always 'gps' when present.
  cameras: [ { id, cameraName, resolution, recordingFps,
               latitude?, longitude?, coordinateAccuracy?, coordinateSource?: 'gps',
               coordinateCapturedAt? } ],

  // DVR TECHNICAL DETAIL — this is exactly what the "canvas" profile hides and the
  // "forensic" profile shows. Surface for a forensic office; de-emphasize for a canvas room.
  dvrInformation: { dvrLocation, dvrTypeBrand, serialModelNumber,
                    dvrUsername, dvrPassword,          // DVR login — show it (see below)
                    numberOfChannels, activeCameras, recordingSchedule, resolution,
                    recordingFps, firstRecordedDate, totalDvrRetention, daysUntilOverwritten },

  timeOffset: { dvrDateTime, actualDateTime, timeDifference, dvrAppliesDST,
                capturedImageUri?, croppedImageUri?, /* OCR proof images (device-local URIs) */
                ocrConfidence?, captureMethod?: 'manual'|'ocr', ... },

  exportInformation: { exportMedia, fileType, sizeGb, mediaPlayerIncluded, mediaProvidedVia },
  notesSections?: [ ... ], notesFreeText?, notes? /* derived flat string */,
  dateTimeCompleted?, completedBy?
}
```

**`cloud_cases.metadata` (jsonb) — pinned shape.** Carries the people running the room:

```jsonc
metadata: { oicName, oicBadgeNumber,               // Officer in Charge
            videoCoordinatorName, videoCoordinatorBadgeNumber,  // the coordinator at the TV
            unit, completedBy? }
```

**DVR login is meant to be visible.** `form_data.dvrInformation.dvrUsername` / `dvrPassword` are the DVR's own access credentials, captured on purpose so investigators and the coordinator can re-access the recorder — **render them plainly on the card/detail.** Consumers are police on a screen inside a police building; this is not a secret to hide. (The only genuinely non-renderable fields are `timeOffset.*ImageUri` — device-local paths that won't resolve on desktop; OCR proof images aren't in cloud storage.)

### Provided RPCs (SECURITY INVOKER — respect RLS)

- `locations_for_case(case_id)` — case's locations with lng/lat extracted and scope aggregated.
- `locations_in_view(...)` — viewport/bbox query for map panning.

Prefer these for anything needing coordinates rather than decoding PostGIS client-side.

### Storage buckets (private)

| Bucket | Max | MIME |
|--------|-----|------|
| `images` | 50 MB | jpeg, png, webp, heic, heif |
| `video` | 500 MB | mp4, quicktime |
| `audio` | 50 MB | mpeg, mp4, aac, wav, ogg |

→ **HEIC images and QuickTime/HEVC video may not render in a desktop browser/webview.** Handle unsupported types gracefully (thumbnail placeholder + download/openable), and don't assume every asset plays inline.

### Realtime

Two live sources exist; **you choose**, but the client's subscription **must be partitionable by `case_id`** (see non-negotiables):

1. **Broadcast** — a trigger publishes case & location INSERT/UPDATE/DELETE to the broadcast topic **`agency:activity`** (a `realtime.messages` RLS policy authorizes authenticated members). Single agency-wide topic in V1.
2. **Postgres Changes** — `cloud_cases` and `cloud_locations` are on the `supabase_realtime` publication; you can subscribe with a server-side `case_id` filter.

**Known gap — media is not on the realtime substrate in V1.** New photos/videos do **not** emit a realtime event, and a media upload does not necessarily bump its location's `updated_at`. So "a new photo appears live" is **not** free. V1 answer: **poll media for the currently-visible / active locations** on a short interval (and refetch a location's media whenever that location does emit an event). Putting `cloud_media_files` on realtime is a clean V2 cloud-side addition — note it, don't block on it.

---

## 4. Views & layout

Two primary views, **map-maximal** throughout.

### Map view (the default / hero)

- The **map fills as much of the viewport as possible.** Mapbox GL JS (via `react-map-gl` or equivalent) — Mapbox is fixed because the mobile app and its tokens/styles are already Mapbox. The map token/style is configurable.
- **No side panels docked to the viewport edges.** Location information floats **over** the map as a set of **vertical, card-based** elements — one card per canvass location, **grouped by case**. Cards float clear of the map's left/right edges (no full-height rails).
- **Not a timeline.** A scrollable/stacked list of floating location cards, not a temporal track.
- **Markers:** incident scene (distinct) + one per canvass location, coloured by `status` (`started`/`working`/`complete`). Cluster when dense. Selecting a card **flies to** its marker; selecting a marker highlights its card. Both directions.
- **Cards surface, at a glance:** location name/address, investigator, status, arrival time (from `form_data`), and **media** — image thumbnails inline (signed URLs), a count/badge for video/audio, expand to view. Video plays on demand (Section 5).

### Dashboard view

- A denser, at-a-glance **status board** for the active case(s): counts by status, roster of who's where, and a **recent-activity / attention feed** (Section 6). This is what makes the coordinator *notice* change, not just see current state.
- Reachable from the map (toggle/overlay or route — your call). For a wall TV, a mostly-map screen with a compact status strip, plus a switch to the fuller board, works well; the exact composition is yours.

### Layout non-negotiables

Map dominates · information floats (no edge-docked panels) · vertical case-grouped location cards · fly-to both directions · no timeline · legible from across a room (large type, high contrast, works as an unattended display).

Aesthetic direction is otherwise yours — aim for a calm, operational command-centre feel, not a consumer dashboard. (The mobile app uses a dark "glass/blueprint" aesthetic with Carolina-blue accents; harmonising is welcome but not required.)

---

## 5. Media

Media is central, not an afterthought.

- **Images:** fetch via signed URL and show inline on the location card as they arrive (subject to the polling in Section 3). A **new photo landing on a location is a primary attention signal** — the coordinator should feel it appear.
- **Video (V1):** progressive playback of the stored file straight from Supabase Storage's CDN via signed URL + HTTP range requests (works for H.264 MP4). Play on demand from the card — do **not** autoplay large files, and do **not** preload video on the wall board.
- **Video (later, not V1):** true adaptive streaming (HLS/DASH) needs a transcode/streaming service (e.g. Mux / Cloudflare Stream) — Supabase Storage does not transcode. Note it as a V2 option; don't build it now.
- **Unsupported formats** (HEIC / QuickTime / HEVC): graceful fallback, never a broken/black player.

---

## 6. Live behaviour & attention

The product's real value is helping the coordinator **notice the thing that just changed** in a room full of activity.

- Reflect case/location changes **live, within seconds, no manual refresh.**
- **Attention layer:** when a location changes status, a new location appears, or new media lands, draw the eye — a pulse on the marker, a highlight on the card, and an entry in a lightweight **recent-activity feed** (most-recent-first, case-scoped). This is a first-class requirement, not polish.
- **Connection health:** a persistent, honest indicator of realtime connection state + last-updated time. Define reconnection behaviour for a machine that runs for days (token refresh on a long-lived session, resubscribe on wake/reconnect, visible "reconnecting/stale" state). A silently-stale board is a defect.

---

## 7. Auth & security ("secure as shit")

- **Session:** the hub signs in as a **named coordinator account** and holds a **long-lived, auto-refreshed session** on an always-on machine. That session is the soft target — harden it:
  - Encrypted-at-rest session/credential storage (use the template's secure-storage patterns; never plaintext in files, logs, or window state).
  - No credentials or keys in logs, error reports, or persisted UI state.
  - Kiosk/lockdown posture and **auto-lock on idle**; re-auth (OS or app gate) to resume. This mirrors the discipline the mobile BYO feature already applies to its admin device.
- **Roles:** the cloud carries a `jwt_agency_role()` helper. The coordinator seat gets a `coordinator` role. In V2 the coordinator is a **writer** (assigns locations); in V1 they're effectively a live reader. Don't hardcode assumptions that block a coordinator write role later.
- **Access scope — V1 vs V2 (decided):**
  - **V1: agency-wide reads.** The shipped cloud RLS lets any authenticated agency member read all cases. V1 runs on this as-is — **zero cloud/mobile change**, so the hub ships decoupled. Scope-to-case in the **UI** (group/filter by case).
  - **V2: per-case authorization.** A `case_members` table (`case_id`, `user_id`, `role`) becomes the real boundary — you only see/act on cases you belong to — and realtime narrows to **per-case channels** (`case:{id}:activity`). This is the *same* primitive as assignment (Section 8), rides one schema-v2 migration, and requires a mobile fleet update (schema gate).
  - **Consequence for V1 code:** keep the client **case-partitioned everywhere** — data, state, and especially the **realtime subscription keyed on `case_id`**. Do **not** build an un-partitioned agency-wide realtime firehose; that's the one choice that closes the door to V2.

---

## 8. Two-way (phased — build the surface, gate the loop)

The end state is bidirectional: **coordinators assign new/existing locations to investigators from the hub.** Today the mobile app is push-only (no pull-sync), so the loop can't fully close yet. Phasing:

- **Phase 1 (now):** live receive + map + media + attention + connection health, read against today's cloud. This is the shippable product.
- **Phase 2 (gated):** the assignment write surface. A coordinator creates/assigns a location; it writes to the cloud; the investigator's phone receives it. **Blocked on two prerequisites that are the mobile/cloud team's, not this app's:** (a) **mobile pull-sync** (doesn't exist yet), and (b) the **assignment model** — an `assigned_to`/`case_members` concept in the schema + RLS, because today's owner-only write policy (`auth.uid() = user_id`) makes it impossible for a coordinator to create a row owned by another user. **Membership = assignment = per-case auth: one `case_members` primitive serves all three, in one v2 migration.**
- Build Phase 1 so the Phase-2 write surface drops in without restructuring (case-partitioned client, room in the model for an assignee ≠ owner, a coordinator write role). Don't implement the writes against V1's cloud — they'll fail RLS.

---

## 9. Non-negotiables (the guardrails — everything else is yours)

1. **Read-only against V1's cloud.** The phones are the source of truth; V1 never writes to the agency cloud. (Writes arrive in Phase 2 with the schema to support them.)
2. **Data contract = Section 3.** Read the real tables/columns/buckets; don't invent a bespoke projection.
3. **Realtime subscription partitioned by `case_id`.** No agency-wide firehose.
4. **Map-maximal, floating case-grouped vertical location cards, fly-to, no edge-docked panels, no timeline** (Section 4).
5. **Media-forward** — images live on cards, video progressive on demand (Section 5).
6. **Coordinator role + hardened long-lived session on an always-on host** (Section 7).
7. **Honest liveness** — visible connection/last-updated state; never present stale as live (Section 6).

## 10. Explicitly yours to decide ("let it rip")

Component architecture, state management, styling system, map interaction details, clustering strategy, card/animation design, dashboard composition, folder layout — all yours within the template's conventions. Prefer the template's existing patterns (`AGENTS.md`, `docs/developer/`) over new ones.

## 11. Out of scope for V1 / V2 hooks

Out: adaptive video streaming/transcode; pull-sync and delete propagation (mobile side); OAuth "Connect with Supabase"; multi-agency tenancy (one project = one agency); analytics/reporting. Reserved for V2: `case_members` per-case auth + per-case realtime channels; the assignment write surface; `cloud_media_files` on realtime for instant media push. None of these should be designed away — V1 must not close their doors.
