# OMP debugger adapters — 2026-11-08

The workload image now supplies the two adapters needed for its primary application stacks:

| Target | Adapter | Pin | OMP discovery |
|---|---|---|---|
| .NET 10 C#/F# | Samsung netcoredbg | 3.2.0-1092 | `netcoredbg` on PATH |
| Node.js JavaScript/TypeScript | Microsoft vscode-js-debug | 1.140.0 | `~/.local/opt/js-debug/src/dapDebugServer.js` |

Pins and architecture-specific SHA-256 digests are in `runtime/kits/workload/devtools.json`. The installer validates both archives before extracting either executable, stores the adapters in `/opt/teck-debuggers`, and exposes OMP's documented discovery paths. Both x64 and ARM64 netcoredbg releases are pinned; the JS archive is platform-independent. No editor installation, npm package named `js-debug-adapter`, or repository `dap.json` is needed.

The netcoredbg pin is its upstream release tag; that release's executable internally reports `3.2.0-1`. The archive hash, rather than that shorter display version, identifies the installed release. Its MIT license is included with the installed files; the JS archive already includes its upstream license.

Sources: [OMP debugging documentation](https://omp.sh/docs/debugging), [netcoredbg release](https://github.com/Samsung/netcoredbg/releases/tag/3.2.0-1092), [vscode-js-debug release](https://github.com/microsoft/vscode-js-debug/releases/tag/v1.140.0). The x64 .NET and portable JS archives were independently downloaded and checked against GitHub's upstream asset digests. Together they use about 4.8 MB compressed and 12 MB installed.

## Runtime validation

Used only disposable sandbox `teck-omp-validation-89e41e00` (UUID `35ccc662-00ff-4322-b126-372d06d4d1f6`), x64 Linux, non-root UID 1000, Node 22.22.1, .NET SDK 10.0.401 and installed OMP 18.16.0. The active project sandbox and its processes were untouched.

`debug-smoke.mjs` imports the installed OMP `DapSessionManager` and adapter resolver, then builds private, dependency-free .NET and Node fixtures. For each adapter it verified:

- Discovery of the installed adapters through OMP's existing configuration and paths. The compiled .NET DLL launch names `netcoredbg` explicitly to avoid ambiguous file-type selection.
- A real program launch and stop at entry.
- A verified source breakpoint at line 3 and a second stop after continuing.
- A source-mapped stack frame at the expected fixture line.
- A local variable `answer` with value `42`, and watch evaluation returning `42`.
- Termination of the owned debug session and deletion of its private fixture files.

Both adapters passed. No model turn was used and no user process was attached. ARM64 assets were checksum-pinned but not executed on ARM hardware. Existing-process attach permissions were not broadened or claimed as validated.

The full toolkit check now invokes the DAP smoke after runtime expansion. The standalone image smoke uses it too. The two host-side installer checks pass, including rejection of a corrupted second archive before extraction of either debugger.

## Applying the image

Image changes apply to newly built/provisioned sandboxes. Reinstalling the plugin or reopening OMP in an older sandbox does not install these native adapters. The existing managed OMP/profile update deliberately does not rewrite the image toolchain. The debugger fixtures remain available as an explicit toolkit check, never as a per-session startup hook.

After the isolated DAP tests passed, the same verified archives were also installed into the active sandbox `teck-orca-ssh-bc02e0548944` (UUID `347bd1b8-7ae4-46b8-bdd0-b6a193d165d6`). A preflight confirmed that neither adapter nor `/opt/teck-debuggers` already existed. This added only the new adapter paths and OMP discovery links; it did not replace OMP, the SDK, or any running session. File/discovery-path presence and agent ownership were checked there. No debug fixture was launched and no user process was attached in the active sandbox. Temporary installation files were removed.
