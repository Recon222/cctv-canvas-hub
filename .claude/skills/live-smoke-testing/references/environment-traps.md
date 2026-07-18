# Environment traps that return WRONG answers silently

These are the expensive ones. Nothing errors. You get a plausible number — usually zero — and
build an hour of reasoning on top of it.

Read this before your first process query, sleep, or long-running pipe.

## The trap table

| Trap | What you see | What's happening | Fix |
|---|---|---|---|
| **MSYS/Git Bash rewrites leading-`/` arguments into paths** | `tasklist /FI "IMAGENAME eq foo.exe"` returns nothing, forever. A poller logs `count=0` while the process is plainly running. Setting `CFLAGS="/O2"` silently becomes `C:/Program Files/Git/O2`. | Git Bash's argument conversion treats `/FI` and `/O2` as POSIX paths and maps them to Windows paths. | Use `//FI` (double slash), or run process queries from PowerShell. For MSVC flags use the dash forms (`-O2`), or set the variable from PowerShell. |
| **Piping a long-running process through `tail`/`head`** | The output file stays empty. Looks like the command produced nothing and died. | `tail` buffers; nothing flushes until the producer exits. | Redirect straight to a file: `cmd > run.log 2>&1`. Never pipe a process you intend to *watch*. |
| **Foreground `sleep` is blocked in some harnesses** | Command killed, exit 143, "timed out after 0s". | The tool refuses to block. | Use the harness's wait primitive, or run the command in the background. |
| **`Start-Sleep` inside a PowerShell tool call** | Same: exit 143 at 0 s. | Same cause. | Split into separate calls with a wait between them. |
| **`SendMessage(WM_CLOSE)`** | Tool times out. | `SendMessage` blocks until the target window's message loop handles it. | Use `PostMessage`, or `taskkill /PID <pid>` **without** `/F` — which posts `WM_CLOSE` and therefore also tests the graceful exit path. |
| **`Get-Process` for window handles** | You find one window and miss the others. | A process exposes exactly one `MainWindowHandle`. Windows Terminal (and many apps) host several windows in one process. | `EnumWindows` over all visible top-level windows. |
| **`EnumWindows` P/Invoke from PowerShell** | Returns an empty list. | The delegate is garbage-collected mid-enumeration. | Hold the delegate in a variable and call `GC.KeepAlive(cb)` after. |
| **A dead dev-server parent orphans its bundler** | Next run dies with "Port NNNN is already in use", and a `tasklist \| grep node` shows nothing (see trap #1). | The child outlived the parent. | `netstat -ano \| grep :NNNN`, identify the PID with `Get-CimInstance Win32_Process` (check the command line — **make sure it is not your own agent process**), then kill it. |
| **npm scripts that start with `source ~/.cargo/env`** | `'source' is not recognized as an internal or external command`. | npm runs scripts through `cmd.exe` unless `script-shell` is configured. | Invoke the underlying tool directly (`npx tauri dev`) — the toolchain is usually already on PATH. |

## Two habits that defuse most of these

**Cross-check any zero.** If a process query returns "none" and you have any reason to think
something is running, verify with a second tool that uses a different mechanism (PowerShell
`Get-Process` vs `tasklist`, `netstat` vs process list). A zero from a mangled argument and a
zero from an absent process look identical.

**Never kill by name without reading the command line first.** `Get-CimInstance Win32_Process`
gives you `CommandLine` and `ParentProcessId`. On a machine where your own agent runs as
`node.exe`, a blanket `taskkill /IM node.exe` ends the session you are working in.

## Snippets that work

Enumerate every visible top-level window with its rect (the delegate is kept alive):

```powershell
$src = @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class E2 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static List<string> All() {
    var res = new List<string>();
    EnumProc cb = delegate(IntPtr h, IntPtr l) {
      if (IsWindowVisible(h)) {
        var t = new StringBuilder(300); GetWindowText(h, t, 300);
        if (t.Length > 0) {
          RECT r; GetWindowRect(h, out r);
          uint pid; GetWindowThreadProcessId(h, out pid);
          res.Add(h.ToInt64()+" | pid="+pid+" | "+r.Left+","+r.Top+" "+(r.Right-r.Left)+"x"+(r.Bottom-r.Top)+" | "+t);
        }
      }
      return true;
    };
    EnumWindows(cb, IntPtr.Zero); GC.KeepAlive(cb); return res;
  }
}
"@
Add-Type -TypeDefinition $src -ErrorAction Stop
[E2]::All()
```

Identify a process before killing it:

```powershell
Get-CimInstance Win32_Process -Filter "ProcessId = $pid" |
  Select-Object ProcessId, Name, ParentProcessId, CommandLine
```

Graceful quit (also exercises the shutdown path):

```bash
taskkill //PID "$PID"      # note: no /F, and // for Git Bash
```
