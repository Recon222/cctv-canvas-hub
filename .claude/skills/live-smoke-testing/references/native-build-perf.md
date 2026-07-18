# Measuring the artifact that ships, on the profile that ships

Performance claims about a program compiled from native code are claims about a *specific
binary produced by a specific toolchain invocation*. Almost every trap here comes from
measuring a different binary than the one you think.

## Rule 1: a release build that is slower than a debug build is never normal

If you see it, stop and find out why. It means the two profiles are producing materially
different native code, and it usually means the profile you **ship** is the broken one.

It also means every benchmark anyone has run so far is suspect — including the ones in the PR
description, and including yours.

The cheapest way to notice: run the same benchmark on both profiles.

```bash
cargo test -- --ignored --nocapture             # debug
cargo test --release -- --ignored --nocapture   # release
```

## Rule 2: `CMakeCache.txt` is not ground truth. The build log is.

The cache records what CMake was *told*. It does not record what the compiler *ran*. Those
diverge, and the divergence is exactly where these bugs live.

On MSBuild, the ground truth is the tracker log:

```bash
# find the CL command line actually used for a given translation unit
find "$TARGET/release" -name "CL.command.1.tlog" -path "*<lib-name>*" | head -1 |
  while read f; do
    tr -d '\000' < "$f" | tr '\r' '\n' | grep -oE "/O[0-9b]*|/Od|/arch:[A-Z0-9]*|/MD"
  done
```

If the tlog has no `/O` flag, MSVC defaults to `/Od` — unoptimized — no matter what the cache
says. On Make/Ninja generators, the equivalent is `compile_commands.json` or
`cmake --build . -- VERBOSE=1`.

Do this **before** theorising. Two plausible theories die instantly against a tlog diff.

## Rule 3: `cc`/`cmake` build-script crates rewrite per-config flags

The `cmake` Rust crate sets both `CMAKE_<LANG>_FLAGS` (the base) **and**
`CMAKE_<LANG>_FLAGS_<CONFIG>` (the per-config variable) from `cc`-derived flags. On *optimized*
cargo profiles it clobbers the per-config variable, wiping CMake's defaults
(`/O2 /Ob2 /DNDEBUG`). On debug profiles it can leave those defaults intact.

Net effect seen in the wild: the C/C++ in the **release** tree compiled at `/Od` while the
**debug** tree kept `/O2` — a ~10× inversion in the shipped binary.

Two consequences that bite:

- **Injecting `CFLAGS` cannot fix it.** `CFLAGS` merges into `CMAKE_<LANG>_FLAGS` (the base),
  not the per-config variable. You will watch your flag land in the cache and change nothing.
- The fix is to pin the per-config variable directly, e.g.
  `CMAKE_C_FLAGS_RELEASE="/MD /O2 /Ob2 /DNDEBUG <arch flags>"`. Many `-sys` crates forward
  `CMAKE_*` environment variables as explicit `-D` defines, and `cmake-rs` skips its own
  injection when the variable is already user-defined. Guard it to the platform it applies to.

## Rule 4: the flag that enables ISA extensions is not always the flag that enables the kernels

Compiler flags (`/arch:AVX2`) and library options (`GGML_AVX2=ON`, etc.) are different levers,
and a library may gate its SIMD code on compiler-defined macros (`__AVX2__`) rather than on its
own CMake option. Before claiming "the flag is set but the kernels are off", find where the
source actually branches:

```bash
grep -rn "defined(__AVX2__)\|defined(GGML_AVX2)" <lib>/src/
```

MSVC defines `__AVX2__` for `/arch:AVX2` but does **not** define `__FMA__` or `__F16C__`.
Getting this wrong produces a very confident and very false review comment. (Ask me how I know.)

## Rule 5: shipping an ISA requirement without a runtime check is a silent crash

If the build enables an instruction set unconditionally, the binary will `#UD` /
`STATUS_ILLEGAL_INSTRUCTION` on any CPU without it — with no message, no log line, and no way
for a user to know why. Add a startup guard that turns an opaque death into a clear error:

```rust
#[cfg(target_arch = "x86_64")]
if !std::is_x86_feature_detected!("avx2") {
    // emit a fatal, user-visible error, then exit
}
```

Be honest about what the guard buys: a clear message, not working software. Restoring
functionality on those CPUs needs a scalar fallback or runtime kernel dispatch — a separate,
larger job.

## A checklist for any "it's faster now" claim

1. Which profile produced the binary you measured? Is it the one that ships?
2. Does the same benchmark run on both profiles? Do the numbers agree?
3. What is in the tlog / verbose build output for the hot translation unit?
4. Was the artifact rebuilt after the change? Compare mtimes; grep the build log.
5. Is the measured workload the workload the acceptance criterion is about? (A benchmark on a
   silence-dominated buffer is not a benchmark on speech; a benchmark on a 30 s window is not a
   benchmark on a 3 s utterance.)
6. Is the *first* run's cost (model load, JIT, page cache) on the user's critical path? Cold and
   warm are different products.
