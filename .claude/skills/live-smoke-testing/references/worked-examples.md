# Two worked examples

Both are real. Both are cases where the obvious approach would have produced a confident, wrong
answer.

---

## Example 1 — a race whose obvious repro could not fail

**The claim under review.** A desktop app spawned a sidecar process. Each spawn started a reader
task that watched the sidecar's stdout and, on process termination, cleared the app's "current
engine" slot and emitted an `engine_down` event. The reader captured no identity for the engine
it supervised.

**The bug, as read from the source.** Stop engine A, immediately start engine B. Reader A's
`Terminated` arrives late, finds engine **B** in the slot, and clears it — dropping B's Job
Object, which on Windows kills B's process tree. The user presses "start" and gets a dead engine.

**The obvious repro.** Call `stop()` then `start()` back-to-back from one handler, so no human
click latency separates them. Automate it, watch the process count.

**It passed. On the buggy code.**

The application's own log said why:

```
Stopping voice engine (generation 1)
Voice engine terminated ... (reader gen=1)      <- Terminated arrives HERE
voice: stale Terminated (gen=1) — slot untouched
Voice slot claimed (generation=2, placeholder)  <- ...before B is installed
```

`Terminated` was delivered **between** the two calls, while the slot was empty. The dangerous
window never opened. A green run there proved nothing at all — and the "fully deterministic"
description in the review was wrong.

**What actually established the bug.** Force the interleaving and vary one thing:

```rust
CommandEvent::Terminated(status) => {
    log::info!("terminated (reader gen={generation})");
    std::thread::sleep(Duration::from_millis(400));  // simulate a slow-to-die sidecar
    ...
}
```

Then run twice, changing only the guard:

| Variant | Guard | `engine_down` | live engines |
|---|---|---|---|
| (a) | `slot_generation.is_some()` — the bug | fired at +4.44 s | **0** |
| (b) | `slot_generation == Some(event_generation)` — the fix | silent | **1** |

Same 400 ms delay in both. One variable. The bug is real, the guard is what closes it, and the
400 ms is not arbitrary — it is the delivery delay you get for free the moment the sidecar owns
an audio device and takes time to die.

**Transferable lessons.**

- The repro you derive from reading the code is usually the one that cannot fail.
- Read the target's runtime log to learn the *actual* ordering before designing the experiment.
- When both variants pass, suspect the harness. Here a *second* guard (`stop` emptying the slot)
  was independently closing the window — which was worth knowing, and was defense in depth.
- Exit codes settled a related question in one digit: a killed sidecar logged `code: 1`; a
  sidecar that read `{"type":"shutdown"}` and left its own loop logged `code: 0`. That single
  number proved the graceful-shutdown fix executed, where no assertion could.

---

## Example 2 — a 10× performance inversion between build profiles

**The claim under review.** "Real-speech latency is 6.66 s; we'll need a GPU."

**The measurement that mattered.** Run the *same* benchmark on both cargo profiles:

```
debug   profile:  cold 2.81 s   warm 0.68 s
release profile:  cold 24.1 s   warm 6.83 s     <- this is what ships
```

A release build slower than debug is never normal. Every latency number produced by anyone —
the author's, and every mic measurement the reviewer had taken — came from the crippled binary.
The apparent conclusion ("Whisper is too slow on CPU, we need hardware") was an artifact of the
build.

**Two theories died before publication.**

1. *"The AVX2 compiler flag is set but the library's kernels are disabled."* The cache showed
   `GGML_AVX2:BOOL=OFF` next to `/arch:AVX2` in `CMAKE_C_FLAGS`. Plausible, tidy, wrong: those
   options only fed a backend-scoring file; the SIMD kernels gate on `__AVX2__`, which MSVC
   *does* define under `/arch:AVX2`. Caught by `grep -rn "defined(__AVX2__)"` before it reached
   the author.

2. *"Release lacks `/O2`; injecting `CFLAGS=-O2` will fix it."* Warm stayed 6.93 s and only
   `-DNDEBUG` reached the cache. `CFLAGS` merges into `CMAKE_C_FLAGS` (the base), never into
   `CMAKE_C_FLAGS_RELEASE` (the per-config variable) — which is what the `cmake` crate had
   clobbered.

**What settled it: one command.**

```
debug   tree, ggml-cpu.c:  ... /MD /O2 /Ob2 ... /arch:AVX2
release tree, ggml-cpu.c:  ... /MD      ...    /arch:AVX2      <- no /O flag at all -> /Od
```

The `CL.command.1.tlog` — the command line MSBuild actually ran. The cache had been lying the
whole time.

**The fix and the result.** Pin `CMAKE_C_FLAGS_RELEASE` / `CMAKE_CXX_FLAGS_RELEASE` directly
(guarded to the platform); `cmake-rs` skips its own injection when the variable is user-defined.

```
before:  warm 6.83 s   cold 23.2 s
after:   warm 0.78 s   cold  3.04 s
```

8.8×. From a build flag. The GPU was never needed.

**Transferable lessons.**

- Measure the artifact that ships, on the profile that ships.
- The cache is what CMake was told. The tlog is what the compiler ran. Go to the tlog.
- When you have a confident root cause, try to kill it before you publish it. Two died here.
- Handing someone a clean **reproduction** plus "I don't know the cause" is worth more than a
  tidy theory that's wrong. The author root-caused it in one command once the reproduction was
  unambiguous.

---

## Example 3 (small, but the one people repeat) — a test that could not fail

A resampler test was named `resample_compensates_startup_delay`, and its comment said *"without
the `skip(delay)` compensation the leading samples are the filter ramp-up (~0)."*

Deleting the compensation left the suite **green**. The measured values:

| | `resampled[0]` |
|---|---|
| with compensation | `0.99999624` |
| without | `1.0689032` |

Both pass `> 0.9`. The probe was a **constant DC signal**, and a time-invariant signal cannot
reveal a time shift. (The comment's premise was false too — the filter overshoots, it doesn't
ramp from zero.)

Replacing the probe with a **step** (2400 zeros, then 2400 ones) and asserting the *index* of the
transition went red immediately — at 779 instead of 800 — and exposed a real 21-frame
over-compensation that the DC probe had been concealing for two review rounds.

**Transferable lesson.** Probe along the axis you are testing. And a test that names the mutation
it catches, while not catching it, is worse than no test: it advertises coverage that isn't there.
