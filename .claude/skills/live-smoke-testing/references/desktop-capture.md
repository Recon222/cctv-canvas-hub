# Desktop capture and restore

If you are about to drive a GUI with computer-use tools, assume the user is watching — or
recording. Their window layout is part of their working state. Put it back.

## Capture BEFORE you launch anything

Record, for every visible top-level window: title, HWND, PID, `x,y w×h`, and maximize/minimize
state. Also record the screen bounds and working area. Save it **outside the repo**, so a
`git clean` or a crash cannot lose it.

Use `EnumWindows` (see `environment-traps.md` for a working snippet, including the
`GC.KeepAlive` the delegate needs). Do **not** use `Get-Process | MainWindowHandle` — a process
exposes only one main window, and terminal emulators routinely host several.

```
# window-baseline.txt
# Screen: 1536x864, working area 1536x816 (primary)
AUTHOR   title="..."  hwnd=2688892  x=-5   y=0  w=778  h=821   # LEFT
REVIEWER title="..."  hwnd=2298926  x=763  y=0  w=778  h=821   # RIGHT
```

Snapped half-screen windows report a few pixels of invisible shadow border (`x=-5`, `w=778` on a
1536-wide screen). Record the numbers you actually read; don't round them to what you expect.

## Restore

```powershell
ShowWindow(h, 9)                              # SW_RESTORE
SetWindowPos(h, 0, x, y, w, h, 0x0040)        # SWP_SHOWWINDOW
SetForegroundWindow(h)                        # focus the one being watched — last
```

Then **screenshot and look at it.** "Restored" is a claim; the screenshot is the check. Verify
that nothing else is left on top — a leftover dialog, a dev-tools window, the app you launched.

## Cueing a human during a timed capture

Message round-trips are hundreds of milliseconds to seconds, and the human reads your text at
their own pace. A blind countdown ("the mic opens in 10 seconds") fails often enough to waste
several attempts.

Better options, in order of reliability:

1. **Let the program cue them.** If the app can make a sound or show something, use it — e.g.
   speak a prompt through TTS and open the capture window the moment playback ends. The human
   reacts to the app, not to your prose.
2. **Open a generous window** and ask them to repeat the action several times. A buffer that is
   mostly signal beats a perfectly-timed buffer you never get.
3. **Poll for readiness** rather than sleeping a fixed amount: watch the app's log for the event
   that says it is listening.

If a capture comes back empty, check the *device* before blaming the human. A default input that
points at a dead device produces output that is byte-identical to "the user said nothing" — which
is itself usually a finding worth writing up.

## While the GUI is under your control

- Do not trigger modal dialogs (`alert`, `confirm`, native message boxes). They block the
  automation channel and you lose the session.
- Prefer posting `WM_CLOSE` to a specific HWND over `alt+F4` on "the focused window" — you cannot
  always be sure what is focused, and one of the candidates may be the terminal you are running
  in.
- Never kill by image name without reading `CommandLine` first. On a machine where the agent runs
  as `node.exe`, a blanket kill ends the session doing the killing.
