# Canvas Hub — Production Component Brief (for Claude design)

You built the Canvas Hub prototype (`design_handoff_canvas_hub` — your README there is the binding design language). This is the second engagement: **author the production React/TypeScript components** for the real codebase, which you have full access to. Your output gets poured in and wired by implementation agents; the goal is files so close to final that wiring is the only remaining work.

Read first, in this order: `AGENTS.md` (the repo bible — its rules override your habits), `docs/plans/canvas-hub/02-canvas-hub-implementation-plan.md` (AD12–AD15 + Phases 3.x–6.x name every component, path, and behavior), `docs/plans/canvas-hub/01-canvas-hub-architecture.md` §5 (the data contracts your components consume), and the existing M1/M2 components under `src/features/cloud-session/components/` and `src/features/canvass/components/` (your restyle targets — study how they consume hooks and i18n before touching them).

## The hard boundary (this is what makes wiring seamless)

You write the **presentational layer only**:

- Components (new + restyled), their CSS, the design-token layer, vendored fonts, locale keys.
- You NEVER: create/modify hooks, stores, or services · call supabase or Tauri (`commands.*`/`invoke`) · add or upgrade any dependency · write tests (agents own TDD) · touch Rust, `vite.config.ts`, `tauri.conf.json`, or generated files · implement the Mapbox map itself (see Special Cases).
- Where a component needs data and an existing hook/store already provides it (your restyle targets), **keep the existing data wiring byte-intact** — change presentation only. Where the data plumbing doesn't exist yet (M3–M6 surfaces), the component takes **typed props** using the real types below; agents connect them.

## Types you consume (import these — never redeclare)

- `CanvassCase`, `CanvassLocation`, `CanvassMedia`, `ActivityEntry`, `LocationStatusCounts` — `@/features/canvass` internals live at `src/features/canvass/types/index.ts` (components inside the canvass feature import relatively; nothing outside a feature deep-imports it).
- `HealthState`, `ChannelStatus` — `@/store/health-store`.
- `SessionState` — `src/features/cloud-session/store/session-store.ts`.

## Inventory A — restyle in place (files exist; presentation only)

`src/features/cloud-session/components/`: `SetupScreen.tsx`, `SignInScreen.tsx`, `SchemaGateScreen.tsx`, `SignOutButton.tsx` — bring them into the Case File family per your README §7.
`src/features/canvass/components/`: `NavRail.tsx` (86px rail per README §1 — keep the disabled/pop-out/reserved-slot semantics and aria exactly as built), `CasesView.tsx` (case-card grid §2), `LocationCard.tsx` + `LocationCardStack.tsx` (§4 card + stack — keep the `role="button"`/keyboard handling; the listbox/option a11y model arrives at M3 by agents, don't add it), `CanvassRoot.tsx` (chrome/layout only — do not touch its bootstrap, store, or reset logic).

## Inventory B — create new (exact paths from the plan; typed props, no data wiring)

| File | What (your README §) | Consumes |
| --- | --- | --- |
| `src/features/canvass/components/DashboardView.tsx` | full case dashboard §3: incident panel, 4 stat tiles, media strip, roster grid (15+ investigators, inline-expandable location rows sharing the card detail block). NO activity feed column — the feed lives in the process panel (plan 5.3A/6.3C; interim dashboard hosting at M5 is an agent concern, design the recomposed final) | `CanvassCase`, `CanvassLocation[]`, `LocationStatusCounts`, media summary props |
| `src/features/canvass/components/ActivityFeed.tsx` | the live feed rows §3/§6: newest-first, timestamped, status-dotted, 12s attention tint. Home-agnostic (mounts in dashboard interim and panel later) | `ActivityEntry[]` |
| `src/features/cloud-session/components/ConnectionIndicator.tsx` | header chip + escalation banner §1 (all five states, honest sub-labels) | `HealthState`, `lastConfirm: number \| null` props |
| `src/features/canvass/components/ImageViewer.tsx` | modal photo viewer §5: wrap-through ‹ ›, `PHOTO n OF N`, metadata footer | `CanvassMedia[]`, index, signed-URL string props |
| `src/features/canvass/components/VideoPlayer.tsx` | modal on-demand player §5 (never autoplay; transport footer) | `CanvassMedia`, signed-URL prop |
| `src/features/canvass/components/MediaThumb.tsx` | thumbnail tiles + count badges + the **unrenderable-media fallback tile** | `CanvassMedia`, signed-URL prop |
| `src/features/cloud-session/components/LockOverlay.tsx` | idle lock §7: gold border, banner, centered unlock panel — board visible and unchanged beneath; interaction-blocking overlay only | `signedInEmail` prop, `onUnlock(password)` callback |
| `src/features/canvass/components/map/` (new dir): marker element factories + `MapLegend.tsx`, `MapZoomControls.tsx`, `MapTokenGate.tsx` | §4 markers (status dots, incident crosshair + halo, label pills, selection/attention states), legend, zoom instruments, token-missing state | pure props |
| Header chrome (case tag, title, live clock, monitor-toggle button) — as small components under `src/features/canvass/components/chrome/` | §1 header | props |
| Process-panel **shell** only: `src/features/process-panel/components/PanelShell.tsx` + collapsed SYS tab + lane toggle header | §6/§8 — the frame, tab, and ACTIVITY/SYSTEM toggle. The SYSTEM lane's terminal internals are being ported separately — leave a `children`/`activitySlot: ReactNode` contract exactly as plan 6.3A/6.3C pins | `activitySlot`, `systemSlot`, expanded/lane props + callbacks |

Also yours: the **token layer** — your README's color/status/radius/glow tokens as CSS variables in `src/theme-variables.css` (the repo's `@theme` home — NOT `App.css`), fonts vendored to `src/assets/fonts/` with `@font-face` (Nacelle, Inter, JetBrains Mono, Share Tech Mono — copy the woff2 from your `_ds` bundle), and **locale keys in all three of `locales/{en,fr,ar}.json`** for every string you render (namespaces: follow the existing `canvass.*`/`cloudSession.*` patterns; new `processPanel.*` for the shell).

## Gate rules (the repo CI is strict — violations cost you the "90%")

1. **strictTypeChecked ESLint + `noUncheckedIndexedAccess`**: no `any`, array indexing yields `T | undefined` — handle it.
2. **Zustand selector-only**: `useXStore(s => s.field)` — never destructure a store hook (ast-grep enforces; applies to your restyle targets).
3. **Imports**: cross-feature only via barrels (`@/features/<x>`); inside a feature, relative paths; never deep-import another feature's internals (ast-grep, severity error).
4. **Every user-visible string through `useTranslation()`/`t()`** — zero hardcoded copy; keys in en+fr+ar (real translations, not placeholders; `ar` is RTL).
5. **CSS logical properties** (`text-start`, `ps-*`, `ms-*`) — never left/right physical properties for text/spacing.
6. **React 19 + Compiler**: no `useMemo`/`useCallback`/`React.memo`.
7. Tailwind v4 utility classes + your CSS variables; component-scoped CSS files only where utilities genuinely can't (the CRT effects, marker keyframes).
8. Icons: `lucide-react` where it fits, inline SVG (stroke ~1.8, `currentColor`) for your bespoke glyphs.

## Pinned behaviors you style but must not redesign

Timestamps: seconds always, dates explicit `yyyy-mm-dd` (doc 01 rule 6) · DVR username/password are ordinary selectable strings — no masking/dots/lock-icons ever · status visual language exactly per your README (hollow-blue / solid-gold / solid-cyan-✓) · panel posture defaults are pinned in plan 6.3C (you style the states, not the rules) · connection chip honesty (sub-label = last *confirmed* time) · never-autoplay video · the map div is persistent and unscaled (AD15) — your chrome must tolerate living in a scaled sibling layer.

## Special cases

- **Mapbox markers**: your factories return a **root element with no `position`/`transform`/`transition` of its own** — all visuals on child elements (the binding rule; agents attach via `new mapboxgl.Marker({element})`). Export plain functions/components producing DOM, keyed by status + selection + attention props.
- **No screen-scale wrapper**: don't implement AD15's `scale()` — agents own it in `CanvassRoot`.
- **Existing tests must stay green**: if a restyle changes text/roles that `src/features/**/__tests__/*` assert on, adjust presentation to keep contracts (labels come from i18n keys — keep the keys) rather than editing tests. If a conflict is unavoidable, note it in the handoff doc instead of touching the test.

## Deliverable

Your usual handoff package: the files at their exact repo paths (zip mirroring the tree), plus a `HANDOFF.md` listing every file (new vs modified), every locale key added, every token introduced, all assumptions/prop contracts you invented where the plan was silent, and anything you deliberately left for the wiring agents. Do not commit; the orchestrator pours it in through the review pipeline.
