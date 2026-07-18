# Planning Document House Style — the 3-Doc Set

**Purpose.** This defines the house style for the three-document planning set to produce for the Canvas Hub, from the vision/requirements in `canvas-hub-spec.md` (this folder). Follow it so the output matches the convention used across the mobile app's mature planning sets (`byo-supabase-provisioning`, `notes-reconciler-redesign`) — the same structure, altitude, and discipline.

**Not covered here (deliberately):** testing mechanics — mock strategy, fixtures, factories, harness wiring. You have this repo's testing infrastructure and conventions (`AGENTS.md`, `docs/developer/testing.md`); use them. This guide dictates the *shape and content* of the three docs, not how to mock. Likewise, code conventions are the template's (`AGENTS.md`, `docs/developer/`) — reference them, don't restate them.

---

## The set

Three docs, one shared kebab feature-slug, numbered prefixes:

- `01-<slug>-architecture.md` — **the design**
- `02-<slug>-implementation-plan.md` — **the how**
- `03-<slug>-test-spec.md` — **the proof**

Each doc opens by naming the other two with those role tags, states which is authoritative for what (architecture = data contracts & flows; implementation plan = single source of truth for technical detail; test spec = the checklist), and carries a **provenance line** — `Basis:` (here, `canvas-hub-spec.md` + the mobile app as the cloud-contract source of truth), and `Supersedes:` if it replaces an earlier attempt.

## Cross-cutting voice (all three)

- Terse, declarative, **table-first over prose**, high information density, bold lead-ins.
- **Signatures, not implementations** — show type shapes and function signatures to fix contracts; never paste full function bodies.
- **Stable, traceable IDs** that thread across all three docs: milestones (`M1`), phases, decisions, findings, risks. When something is deferred, it gets an ID and is referenced, not re-explained.
- **Inline rationale for every non-obvious choice**, with a citation where one exists (a section of `canvas-hub-spec.md`, a file in the mobile repo, a decision ID).
- **Honesty markers** are expected: name accepted risks, known trade-offs, deferred work, and rejected alternatives explicitly. No silent gaps.
- **One doc is authoritative per concern**, and any shared numbers (test counts, file counts) must reconcile between docs.

---

## Doc 01 — Architecture & Design

Fixed numbered spine:

1. **Purpose** — one paragraph: the connected capabilities this feature delivers, and the files/areas it touches.
2. **Problem Statement** — the concrete gaps being closed, each as a **numbered, named item** (give them IDs if they'll be referenced later). Trace claims to reality where possible.
3. **Design Principles** — a **ranked** list, with the rubric stated verbatim: *"Ranked — when two conflict, the lower number wins."* These are the tie-breakers the whole design defers to.
4. **System Architecture** — an **ASCII diagram** of the runtime shape, plus a **feature-module tree** (the frontend feature layout, and any Rust-side module layout) with each entry tagged **NEW / MODIFIED / DELETED**.
5. **Data Contract(s)** — the load-bearing types as TypeScript (and Rust, where relevant) **interfaces/signatures**, plus **state-semantics tables** (state | predicate | behavior | UI) for anything with modes. This is where the cloud tables/columns, realtime channel contract, and any local types are pinned.
6. **Data Flows** — the key sequences narrated as **Flow A / Flow B / …**, each a short numbered walkthrough.
7. **Integration Points** — a table: `existing file | change | why`. Keep it honest about how few files are touched.
8. **Open Design Decisions** — a table: `question | options | recommendation` (recommendation in **bold**), closing with the line *"Every row must be resolved in the Implementation Plan's Architecture Decisions table."*
9. **Dependencies** — a table; say **"None new"** when true.
10. **Security / Threat Model** (when the feature warrants it) — an honest enumerated threat list with mitigations and an explicit **acceptable-risk statement**. (Canvas Hub warrants one: long-lived coordinator session on an always-on machine, agency-wide vs case-scoped reads, credential handling.)
11. **What This Deletes / Net effect** (when relevant) — what shrinks, so the change reads as reduction, not just addition.

## Doc 02 — Implementation Plan

- **Overview** paragraph framing the work as **independently shippable milestones** (each milestone leaves a working app).
- A **prerequisite** line (read the architecture doc first) and a **Key constraint** callout (the one or two facts that bound everything — e.g. read-only vs two-way phasing, agency-wide V1).
- **Architecture Decisions Table** — `decision | choice | rationale`, where the rationale **names the rejected alternative and why it lost** ("X rejected because…"). This resolves every Open Design Decision from doc 01.
- **Milestones table** — `milestone | scope | observable outcome`. The outcome column is what you can *see* working, not an internal state.
- **Phases** within milestones. Each phase has:
  - a one-line **Goal**,
  - a **Files** list using per-file sub-IDs (`1A`, `1B`, `2A`…), each tagged **NEW / MODIFY**, with the **signatures** that file introduces (types, function stubs, command names) — not bodies,
  - an **Error handling** note where the path can fail,
  - a **`⚠`** marker on any phase that modifies existing files.
- **Appendices**: a **File Manifest** (new files), an **Integration Point Summary** (modified files), and an **Estimated Test Count** per phase — plus an honesty metric (e.g. "only N existing files modified; everything else is new behind barrels").

## Doc 03 — Test Spec

- Framed as **TDD red-line**: every test to be written **before implementation**, designed to fail until its phase lands. Give the scoped run command for the suite.
- A **Test File Location Table** — `test file | phase | status` (NEW / rewrite / additions). If any existing tests are deleted or rewritten, say which, and note any assertion that must be re-homed before removal so nothing pinned silently disappears.
- **Per-phase test tables** — columns `# | Test Description | Key Assertion`. Descriptions start with **"Should…"**, and the **# is numbered continuously across the whole document** (not reset per phase).
- A closing **Test Count Summary** table that **reconciles with the Implementation Plan's estimate** (state the rule: if counts drift during implementation, reconcile the two docs before proceeding).
- **Do not** prescribe mock infrastructure, factories, TEST_IDs, or a layered-mock doctrine — the test writer follows this repo's existing testing infrastructure and conventions. Specify *what each test proves* (description + key assertion), not *how it's wired*.

---

## The short version

Ranked principles · decisions carry their rejected alternatives · stable IDs threaded across all three docs · ASCII + tables over prose · signatures not code · an honest threat/risk section · and a TDD spec whose per-phase "Should…" tables and final count reconcile with the plan. Testing *mechanics* are yours; testing *coverage and intent* belong in the spec.
