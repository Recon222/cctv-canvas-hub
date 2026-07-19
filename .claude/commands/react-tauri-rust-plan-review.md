---
description: Multi-agent review of a planning PR or local planning docs (architect + quality + reality-check, optional rust/ts proposal review, strict decision)
argument-hint: [pr-number | pr-url | path/to/plan.md | blank for current branch PR]
---

# /react-tauri-rust-plan-review

Comprehensive review of planning documents (architecture docs, implementation plans, test specs) **before** implementation begins. Tuned for plans rather than code.

**Input**: $ARGUMENTS

---

## When to Use

Run this when a PR contains planning artifacts (architecture docs, implementation plans, TDD specs) and you want a structured review *before* shipping any code. Catches architectural drift, vague phasing, and codebase-vs-plan inconsistencies while they are still cheap to fix.

Do NOT use this for code PRs — use `/react-tauri-rust-code-review` instead. This command's agents are tuned for prose, not implementation.

---

## Mode Selection

| Input | Mode |
|---|---|
| Number (e.g. `55`) | **PR mode** — `gh pr view <n>` |
| URL (`github.com/.../pull/55`) | **PR mode** — extract number |
| Path (e.g. `docs/working/plans/foo/`) | **Local mode** — review files in that path |
| Blank | **Current branch PR mode** — `gh pr list --head $(git branch --show-current)` |

---

## Phase 1 — FETCH

### PR mode
```bash
gh pr view <NUMBER> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff <NUMBER> --name-only
```

If the PR is not found, stop with error.

Pull the changed files at PR head:
```bash
gh pr diff <NUMBER> --name-only | while IFS= read -r file; do
  case "$file" in
    *.md|*.txt) echo "--- $file ---"; gh api "repos/{owner}/{repo}/contents/$file?ref=<head-branch>" --jq '.content' | base64 -d ;;
  esac
done
```

**Filter the changed-file list to markdown / planning docs only.** If the PR contains code changes too, stop and tell the user this command is for planning PRs — they should use `/react-tauri-rust-code-review` instead.

### Local mode

If the argument is a directory, read every `.md` file in it. If it is a file, read it.

### Sanity gate

Before going further, confirm the input is genuinely a planning artifact, not code. A planning artifact typically:
- Lives under `docs/` or a `plans/` directory
- Contains phases, file-path proposals, testing strategy
- Has no `.ts`/`.tsx`/`.rs` siblings in the changeset

If the input does not look like planning docs, **abort** with: "This command is for planning documents. For code review, use `/react-tauri-rust-code-review`."

---

## Phase 2 — CONTEXT

Build the shared context the reviewer agents will need. Read these files yourself (the main orchestrator) so you can hand a compact summary to each agent — the agents will *also* read source files directly as needed, but a shared briefing reduces overlap.

1. **Project rules** — `AGENTS.md`, `CLAUDE.md`
2. **Architecture docs** — Everything under `docs/developer/` (especially `architecture-guide.md`, `state-management.md`, `tauri-commands.md`)
3. **The plan docs themselves** — Every file the PR touches, read in full
4. **PR metadata** — Title, body, linked issues (PR mode only)

Cache these as a short "shared brief" in your turn so the dispatched agents don't all re-read the same thing. Each agent will still verify specific claims by reading source files directly.

---

## Phase 2.5 — LANE SELECTION

Decide which optional code-design lanes to add based on what the plan proposes. The three plan agents (architect / quality / reality) always run; the code-design lanes are opt-in.

| Lane | Trigger | What it does |
|---|---|---|
| `rust-reviewer` (plan mode) | Plan proposes new Rust types, traits, Tauri commands, error enums, file paths under `src-tauri/` | Reviews the **proposed Rust design** against project conventions (tauri-specta, typed error enums, `#[serde(tag = "type")]`, Tauri-free workspace-crate tests under `src-tauri/crates/`, etc.) as if it were already written. Catches design choices that would fail Rust code review *before* the implementer follows the plan and writes them. |
| `typescript-reviewer` (plan mode) | Plan proposes new TS types, hooks, services, components, Tauri command consumers | Same idea on the TS side: review the **proposed TS design** against project conventions (Zustand selector syntax, services-own-IPC, barrel exports, i18n, no manual memo). Catches design choices that would fail TS code review. |

These lanes are dispatched in **proposal-review mode** with a focused brief — see Phase 3 below for the exact prompt shape. They do NOT run `cargo test` / `tsc --noEmit` (there's nothing to compile).

A plan can trigger zero, one, or both code-design lanes. If neither triggers, you're back to the three plan agents alone.

---

## Phase 3 — DISPATCH (parallel fan-out)

Send all selected agents in a **single message with multiple `Agent` tool calls** so they run concurrently. Each agent gets:
- The list of planning doc paths
- A pointer to the shared context (`CLAUDE.md`, `architecture-guide.md`, etc.)
- The PR title and number (for the artifact header)

### Plan agents (always run)

| Agent | Model | Question it answers |
|---|---|---|
| `plan-architect-reviewer` | opus | Does the proposed approach fit this codebase's architecture? |
| `plan-quality-checker` | sonnet | Is this plan executable as written? |
| `plan-reality-checker` | sonnet | Do the plan's claims match what's actually in the repo? |

### Optional code-design lanes (only if Phase 2.5 selected them)

| Agent | Model | Question it answers |
|---|---|---|
| `rust-reviewer` | sonnet | Would the proposed Rust design pass code review at implementation? |
| `typescript-reviewer` | sonnet | Would the proposed TS design pass code review at implementation? |

### Proposal-review-mode brief (for the optional lanes)

When dispatching `rust-reviewer` or `typescript-reviewer` against a plan (not code), use this brief shape instead of the default:

```
Plan-stage proposal review for PR #<N> — <title>.

This is a PLANNING PR. There is no implemented code yet — review the
PROPOSED design instead. Do NOT run `cargo test` / `tsc --noEmit` —
there's nothing to compile. Read the plan docs and judge whether the
PROPOSED:

- Function / command / hook signatures
- Type / enum / struct shapes
- Module and file paths
- Error variants and their shape
- Public APIs (barrel exports, command registrations)

... would fail review at implementation time per your normal checklist
(project conventions, type design, error handling, security patterns).

Treat the plan as the design spec the implementer will follow verbatim.
If the spec is missing something a reviewer of implemented code would
flag, raise it now while it's cheap.

## Plan docs in scope
<list of plan files containing the proposed design>

## Shared context
AGENTS.md, CLAUDE.md, docs/developer/

## Begin
Follow your persona's discipline (Pre-Report Gate, HIGH/CRITICAL proof,
zero-findings-is-valid).
```

Each agent returns findings in the standard severity-tagged format (CRITICAL / HIGH / MEDIUM / LOW) with the Pre-Report Gate enforced.

**Do not run them sequentially.** The whole point of the fan-out is parallel execution. One message, N `Agent` blocks.

---

## Phase 4 — AGGREGATE

Once all agents return:

1. **Dedupe** — Findings that hit the same line of the same doc from two angles get merged. Keep the highest severity, list both perspectives in the description.
2. **Surface conflicts** — If `plan-architect-reviewer` says "this approach is wrong" but `plan-quality-checker` says "but it's well-specified," that *conflict itself* belongs at the top of the report as an explicit "Disputed" section. Conflicts are usually more important than agreed-upon findings.
3. **Rank by severity** — Within each severity, order by which doc and which line.
4. **Tally** — Count findings per severity per agent for the summary table.

---

## Phase 5 — DECIDE (strict mode)

| Condition | Decision |
|---|---|
| Any CRITICAL findings | **BLOCK** — must revise plan before implementation |
| Any HIGH findings (no CRITICAL) | **REVISE** — address before implementation |
| Only MEDIUM / LOW findings | **APPROVE** with comments |
| Zero findings from all agents | **APPROVE** (a clean review is valid) |

The strict rule is deliberate: planning issues that survive into implementation cost 10x more to fix. A REVISE decision is not an insult — it's the cheap version.

**Special cases:**
- Draft PR → still issue the decision, but soften the framing
- Conflicts between agents → escalate to at least REVISE regardless of individual severities

---

## Phase 6 — REPORT

Create the artifact at `docs/plan-reviews/pr-<NUMBER>-plan-review.md` (or for local mode, `docs/plan-reviews/local-<YYYY-MM-DD>-<slug>.md`).

Create the `docs/plan-reviews/` directory if it does not exist.

```markdown
# Plan Review: PR #<NUMBER> — <TITLE>

**Reviewed**: <YYYY-MM-DD>
**Branch**: <head> → <base>
**Docs reviewed**: <count> files (<list>)
**Lanes dispatched**: <plan-architect | plan-quality | plan-reality | rust-reviewer | typescript-reviewer>
**Decision**: BLOCK | REVISE | APPROVE
**Conflicts surfaced**: <count>
**Plan grounding**: <N>/<M> reality-checker claims verified against the codebase

## Summary
<2-3 sentence overall assessment. Lead with the decision rationale.>
<Second paragraph: surface plan grounding as a confidence statement. The plan-reality-checker's "N of M verifiable claims check out" stat is the strongest single statement of confidence in a plan's accuracy. State it here, in the summary, not buried at the bottom. If N=M, say so plainly. If N<M, name the failed claims in one phrase.>

## Disputed Findings (Agent Conflicts)
<Findings where two agents took opposing positions. Highest priority. Or "None.">

## Findings

### CRITICAL
<List or "None.">

### HIGH
<List or "None.">

### MEDIUM
<List or "None.">

### LOW
<List or "None.">

## Per-Agent Tallies

| Agent | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| plan-architect-reviewer | N | N | N | N |
| plan-quality-checker | N | N | N | N |
| plan-reality-checker | N | N | N | N |
| rust-reviewer (proposal mode) | N | N | N | N |
| typescript-reviewer (proposal mode) | N | N | N | N |
| **Total (after dedupe)** | **N** | **N** | **N** | **N** |

Omit rows for lanes that were not dispatched.

## Files Reviewed
<list of plan docs with line counts>

## Next Steps
<contextual suggestions based on decision>
```

Each finding entry uses this shape:

```
[SEVERITY] <short title>
Source agent: <agent-name>
Doc: <path>:<line range>
Issue: <concrete failure mode — what implementation will go wrong if this stays>
Fix: <specific change to make>
```

---

## Phase 7 — OUTPUT

Report back to the user (in the terminal turn, not just the artifact):

```
PR #<NUMBER>: <TITLE>
Decision: <BLOCK|REVISE|APPROVE>

Findings: <C> critical, <H> high, <M> medium, <L> low
Lanes: <list of agents that ran>
Conflicts: <count> disputed
Docs reviewed: <count>

Artifact: docs/plan-reviews/pr-<NUMBER>-plan-review.md

Top 3 things to address:
  1. <highest-impact finding>
  2. <next>
  3. <next>
```

Keep the terminal output tight — the full detail is in the artifact.

---

## Edge Cases

- **No `gh` CLI**: PR mode falls back to instructing the user to check out the branch locally and re-run with the docs directory path.
- **Mixed PR (code + plans)**: Stop. This command is for planning-only PRs.
- **No `docs/plan-reviews/`**: Create it on first run; commit is the user's call.
- **Agents return errors**: Continue with the agents that succeeded; surface the failure in the report's summary.
- **Empty plan PR (just a doc rename or move)**: Approve with a note — nothing substantive to review.
- **Plan proposes only Rust OR only TS code**: Dispatch only the matching code-design lane. The other plan agents still run.

---

## Confidence Rule

Every agent dispatched by this command runs with:
- Confidence ≥ 80% before reporting
- Pre-Report Gate: cite exact doc line, name concrete failure mode, prove HIGH/CRITICAL with snippet + scenario
- Zero findings is a valid clean review

If the agents return noise, the fix is to tighten the agent prompts, not to relax the gate.
