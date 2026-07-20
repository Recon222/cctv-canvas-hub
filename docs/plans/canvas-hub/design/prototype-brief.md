# Canvas Hub — Prototype Design Brief

You are designing the UI prototype for **Canvas Hub**: a live command-centre desktop app for police CCTV canvasses. Field investigators fan out around a crime scene collecting DVR/CCTV video; this app is the wall-mounted board a **video coordinator** watches to see, in real time, who is where, what's been found, and where to redirect people. It replaces a whiteboard and a group text.

You have two companion documents: `01-canvas-hub-architecture.md` (the system — read §2 Problem Statement, §5.4 state semantics, and §6 flows for behavior) and `02-canvas-hub-implementation-plan.md` (the build — AD12 is the view architecture; the Milestones table shows what exists when). This brief is the design-scoped distillation; where they conflict on **aesthetics** — color, type, texture, mood — this brief wins. It never overrides **composition or pinned defaults** (the panel's lanes and default state, the feed's home, timestamp format): there the plan docs govern.

> **Status (A2 fix round):** this brief is the historical design *input*. The delivered handoff package — `design-ui-packages/Desktop app for investigators/design_handoff_canvas_hub` — is the **binding design**; where this brief and the handoff disagree, the handoff wins.

**Deliverable:** an interactive HTML prototype (static/mocked data and interactions are fine). Desktop only, 16:9. Two viewing contexts matter: a **wall TV watched from across a room** (primary — the map and status signals must read at 4–5 metres) and an **operator's desk** (secondary — where cards get expanded and read up close). It runs for days in a room that is often dim.

The visual style — color, type, texture, mood — is entirely yours and the owner's to work out together; nothing below dictates aesthetics. (Reference if wanted, not required: the companion mobile app uses a dark glass/blueprint look with Carolina-blue accents.)

## The seven surfaces

**1. Navigation rail** (left edge, slim). Three entries: **Cases**, **Case dashboard**, **Map**. Case/Map entries are disabled until a case is selected. Reserve visual room for a fourth entry (a future admin view). The Case and Map entries each carry a small **pop-out affordance** (they'll open in separate windows later — design only the affordance, not the behavior). Icon-only vs labeled is your call — argue it.

**2. Cases view** (the landing screen). One card per active case: case number (e.g. `24-CANVASS-0417`), display name ("QuickMart Robbery — Yonge St Canvass"), incident address, location counts by status, last-activity time, a liveness hint. Selecting a case navigates to its dashboard. Usually 1–3 cases; a forensic office might have 6–8.

**3. Case dashboard view.** The at-a-glance status board for one case: counts by status and an **investigator roster** (each investigator → their locations and statuses) — roster-dominant. The **activity feed does not live here**: it lives in the process panel's ACTIVITY lane (surface 8), and the roster takes the column the feed would otherwise claim. Composition is otherwise yours — this is a full first-class view, not a sidebar.

**4. Map view** (the hero — this is what lives on the wall TV). Non-negotiables from the product spec: the **map dominates the viewport**; location information **floats over the map** as a **vertical, case-grouped stack of cards** — never edge-docked panels, never full-height rails, never a timeline. Markers: the **incident scene visually distinct** from canvass locations; location markers colored by status (`started` / `working` / `complete` — this three-state distinction is THE live pulse of the canvass and must be readable at 5 m); clustering when dense. Card ↔ marker selection is bidirectional (selecting a card flies the map to its marker; clicking a marker highlights its card). For the prototype, fake the map with a dark static base (image or styled rectangle) — real Mapbox comes later.

**5. The location card** (the atomic unit — most design leverage lives here). At-a-glance layer: location/business name, address, status, investigator name + badge, "arrived 2026-07-20 14:32:07" (every timestamp carries seconds and an explicit date — see Data notes). Media strip: photo thumbnails inline, count badges for video/audio, video plays on demand (never autoplay). Expanded layer: DVR details (type/brand, channels, recording schedule, retention/days-until-overwritten, **DVR username and password**), requested-video time windows (count or list), notes. Variants to design: a location with **no GPS fix** (card exists, no marker — needs a subtle chip), an empty/sparse card (older data), a card with **unrenderable media** (the designed fallback tile + open-externally affordance — never a broken image; §5.5.5's designed state and M4's exit criterion), and the **attention state** (see 6).

**6. Attention & liveness** (first-class product requirements, not polish).
- When something changes (new location, status change, new photo), the coordinator must *feel* it: marker pulse + card highlight for ~12 s + a feed entry. Design the pulse/highlight so it draws the eye across a room without turning the board into a casino.
- A persistent **connection indicator**: states `connecting / live / reconnecting / stale / offline`, always showing "updated HH:MM:SS". `stale` and `offline` escalate to an unmissable banner — the product's honesty principle is that a stale board that looks live is a safety defect. Design honest-but-calm.

**7. Session chrome.** First-run setup (paste an enrollment code), sign-in, a "cloud schema mismatch" blocking screen, and the **idle lock**: an overlay that blocks interaction while the board beneath stays fully visible and **unchanged** — password field to resume. These exist as utilitarian screens today; bring them into the family.

Also design: empty states (no cases yet; a case with zero locations; awaiting first data), and a "map token missing" state for the map view.

**8. Process panel** (right edge, **fully collapsible — two lanes behind a toggle**). **ACTIVITY** — the live activity feed (most-recent-first: "location added", "status → complete", "2 photos added") — and **SYSTEM** — a terminal-emulator-style instrument readout: health-state transitions, a scrolling log tail, connection/system events. Think instrument readout, not chat window. **Defaults are pinned, not yours to choose:** on the Cases and Case-dashboard views the panel is **open on ACTIVITY** (wall posture — the attention surface stays visible); on the Map view it **collapses to a slim SYS tab by default**, and when expanded over the map it **overlays** the floating card stack — the map and the stack never reflow. The owner has an existing component from another app whose style may inform the SYSTEM lane; visual treatment is yours within those pinned behaviors.

## Data notes (for realism and correctness)

- Design with this seeded canvass: case `24-CANVASS-0417` "QuickMart Robbery — Yonge St Canvass"; 8 locations across 3 investigators (Det. A. Morgan, Det. L. Chen, Det. N. Okafor), statuses 3 started / 3 working / 2 complete; convenience stores, a gas station, a pharmacy; a few camera photos, one video, and **one `image/heic` photo seeded precisely to exercise the fallback tile** (it must render as the designed placeholder, never a broken image); one location with no GPS fix.
- **DVR username/password are ordinary strings — exactly like an address.** Never mask them, no password dots, no lock icons, no reveal toggles, no "sensitive" styling of any kind. They're letters and numbers a detective needs to read off the screen.
- Timestamps display in local time. **Every rendered timestamp carries seconds; dates are always explicit `yyyy-mm-dd`** — never "today"/relative-only (doc 01 rule 6). Relative times ("2m ago") may **accompany** as secondary annotations where glanceability wins — never replace the absolute form.
- Text lengths vary hard (business names, addresses); the app ships in English, French, and Arabic (RTL) — favor layouts that survive text expansion and mirroring (this constrains layout, not style).

## Out of scope — do not design

Multi-window/pop-out behavior (only the rail affordance icon) · the admin view (reserved slot only) · a diagnostics window · real map integration · mobile/tablet/responsive below desktop · onboarding tours · light/dark theming toggles (pick one world and commit; theming comes later if ever).

## What great looks like

A coordinator glances from across the room and knows in two seconds: where everyone is, what state each location is in, and whether the picture is live. When a photo lands or a status flips, their eye goes there without being told. The room describes the app as *calm* — an operational instrument, not a consumer dashboard. Everything else — how it looks getting there — is yours.
