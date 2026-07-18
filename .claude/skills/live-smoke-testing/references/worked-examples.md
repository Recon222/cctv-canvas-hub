# Two worked examples

Both are real, from driving this app. Both are cases where the loud, obvious signal — a tool's
`SUCCESS` line, a `git status` flag — would have produced a confident, wrong conclusion, and the
quiet ground truth said otherwise. The subsystems are this app's; the lessons are the same ones the
sibling-app cases taught.

---

## Example 1 — a graceful quit that reported success but never happened

**The assumption under review.** Teardown lore says: post `WM_CLOSE` (`taskkill //PID <app>` without
`/F`) to quit the app, and let that double as a free test of the exit path. The app was PID 43152.

**The obvious signal.** `taskkill //PID 43152` printed:

```
SUCCESS: Sent termination signal to the process with PID 43152.
```

Done, apparently. On to the census.

**What the evidence showed.** The process census three seconds later:

```
   Id StartTime
   -- ---------
43152 2026-07-18 11:17:09 AM
```

Count still 1, and the **StartTime unchanged** — the *same* instance, not a closed-and-relaunched
one. `WM_CLOSE` had been swallowed (a modal was open, and this template has no exit path that
force-closes on request). The taskkill `SUCCESS` was true and irrelevant: it reported that the
*signal was sent*, not that the *window closed*. Two different claims.

**What settled it.** The external process census — count *plus* StartTime — over the tool's own
message. The real teardown was force-killing the dev tree from the npx root
(`taskkill //PID <root> //T //F`), whose `/T` cascades to vite, the app, its WebView2 children, and
the quick-pane window. Census then read 0 across the board.

**Transferable lessons.**

- A tool's success line describes the *tool's action*, not the *world's state*. `taskkill` sending
  a signal is not the app closing, just as `git add` succeeding is not the file being what you
  assume. Go check the thing itself.
- `StartTime` is the cheap disambiguator between "still the original process" and "it restarted" —
  a refusal-to-close and a relaunch look identical in a bare count.
- Don't inherit an exit-path assumption from a richer app. This template has no sidecars and no
  graceful-close handler to lean on, so the "quit is a free exit test" framing simply doesn't apply.

---

## Example 2 — a git flag that looked like an edit but was the build's own footprint

**The observation under review.** After a dev run, `git status --porcelain` showed:

```
 M src/lib/bindings.ts
```

A tracked source file, apparently modified by the run. The obvious read: the launch changed
committed source — revert it, or worse, go hunting for what mutated it.

**What the evidence showed.** `git diff src/lib/bindings.ts` was **empty**. `--stat` empty. Zero
lines carrying a CR. And `git add --renormalize src/lib/bindings.ts` staged **nothing**. The file
was byte-identical to the index. What actually happened: the debug build re-exports `bindings.ts`
(tauri-specta) on every launch, rewriting it with a fresh mtime. Git's stat cache saw the newer
timestamp and flagged the path as *maybe*-dirty; the content check found no change. It was the
build's footprint, not an edit.

**What settled it.** The content-level checks (`git diff` empty, `--renormalize` stages nothing)
over the `git status` flag, which keys on cheap signals — mtime, size — before it does the
expensive content compare. A `.gitattributes` `eol=lf` was added so the regenerated file can't even
diverge by line ending; the residual flag is pure stat-cache noise that clears on any refresh.

**Transferable lessons.**

- `git status` flagging a file is not evidence of a content change; `git diff` (or a renormalize
  that stages nothing) is. Status reports a suspicion; the diff reports the fact.
- A file regenerated on every launch is *your own footprint*. Before concluding "the run changed
  X," ask what the run regenerates. (The sibling app's version of this: mistaking your own
  probe-induced process restarts for a lifecycle bug — same trap, different subsystem.)
- Absence of a real diff, confirmed two ways, beats the presence of a scary-looking flag.

---

These are lighter than a threaded race or a build-profile inversion, but they carry the same spine:
the loud signal (a `SUCCESS` line, an ` M`) is about a *proxy*; the quiet ground truth (a census, a
diff) is about the *thing itself*. When they disagree, believe the quiet one.
