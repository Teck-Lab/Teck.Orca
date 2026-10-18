# Bundled feature daemon validation

Host: Windows, Orca 1.4.224, Node 24.18.0, Docker Sandboxes 0.48.0-rc3.
Plugin: Teck.Orca 0.4.0. Guest daemon: Orca 1.4.224, pinned Node 24.21.0.
OMP: 18.8.7; Bun: 1.4.2.

## Architecture and scope

New feature sandboxes use the documented Orca-server recipe result (`pairingCode`
and `projectRoot`) instead of a hidden recipe-owned SSH host. Their guest CLI
connects to the bundled local daemon; the desktop pairs through an ephemeral
IPv4 loopback port. Each feature generates fresh runtime identity and state.
Only distribution assets are bundled, with upstream checksums and licenses.

No desktop UI, existing user terminals, existing user sandbox configuration,
GitHub records, commits or publication were changed. All live test VMs use
random test project/feature IDs and are removed after each invocation.

## Completed checks

- All 21 lifecycle/release/package tests pass. They cover ownership, isolation, locking,
  rollback, retention, stdin/host-shell behavior, integrity, pairing-state
  privacy and refusing to convert an existing SSH sandbox.
- Generated recipe consistency and all five prerequisite checks pass.
- Orca's static recipe doctor returns `ok: true`, with four expected warnings
  about the portable inline Node launcher rather than a repo-relative script.
- Disposable Windows lifecycle tests create two independent feature sandboxes,
  clone onto their native filesystem and validate OMP, tools, full CLI and
  orchestration skills/references, identity and PATH preservation.
- Guest `worktree list` reaches its own runtime without the SSH permission gate.
- An isolated desktop-side CLI pairs over the published loopback port and sees
  the same runtime identity as the guest CLI. It uses a test-only client profile.
- Orca creates a parent worktree, a child with explicit parent metadata, and an
  OMP terminal. Those are the authoritative worktree/session records used by the
  UI; visual sidebar acceptance was not performed.
- A genuine coordinator terminal creates a Run, Task and Dispatch with
  `worker-start --worktree new-child --agent omp --model omniroute/teck-executor`.
  The receipt reports `state: ready`, task input accepted, the effective mapped
  model, and the created child worktree and agent terminal.
- Repeated creation and suspend/resume reuse the feature runtime. Destroy
  retains it while linked worktrees exist and removes it after their removal.
- At final cleanup the read-only OMP worker was already settled with
  `state: succeeded`, confirming its provider turn and completion report.
  Explicit worker-stop returned `alreadySettled: true`; the test then removed
  its worktree and the disposable runtime.

The final architecture-aware runtime passed the complete disposable test and
is installed as release
`51442593467cc1cc160e2a14aa4779dceca86f1f5c95c8e4dfc7e46a58471f05`.
Machine-readable results are under the ignored `.artifacts/smoke` directory.

## Startup fixes found by validation

The distribution needs its matching `.version` marker, native libraries and
pinned Node executable. The daemon resolves `ORCA_USER_DATA`, while its CLI
resolves `ORCA_USER_DATA_PATH`; both now identify the same private feature
directory. Version environment fields identify the packaged Orca build.

Orca's local foreground check requires `ps`. The slim workload lacked procps,
which produced `agent_not_in_foreground` during task delivery despite OMP
running. Procps is now in the main workload kit and provisioning verifies it.
Putting apt packages in the daemon mixin instead caused a Docker kit collision
on `/etc/ld.so.cache`; system packages therefore remain in the workload kit.

## Acceptance limits

No visual GUI or native-chat acceptance was performed. No existing feature was
migrated. Install the generated `plugin/` folder and create a fresh feature to use this
release; existing SSH-backed features retain their immutable recipe snapshot.

The dispatch receipt's `turnStart`/provider observation is `unsupported` for
OMP in this Orca build. The successful completion above is established by the
later authoritative Dispatch state, rather than the initial input-accepted
receipt. A read-only task is covered; full issue planning, GitHub/MCPHub actions,
implementation, integration and publication remain separate acceptance checks.

The standalone daemon currently reports the default Electron browser provider
as unavailable. Chromium and agent-browser are bundled, but Orca embedded
browser behavior was not validated. Linux arm64 daemon/Node assets are bundled;
live macOS/Linux and arm64 tests were not performed on this Windows host.

## Plugin packaging repair

Adding the daemon binaries to the repository made its root exceed Orca's
50 MiB plugin-tree limit. The installed Orca 1.4.224 loader reproduced the
actual failure: `plugin exceeds the 52428800-byte limit`. A valid manifest
alone did not establish that the folder could be loaded as a Dev plugin.

Build now generates `plugin/` with only the manifest, license and recipe:
three files totaling 7,958 bytes. Setup still installs the full runtime in
the immutable release directory above, and prints the corrected Dev folder.
The installed app's manifest, declared-artifact and complete tree validators
accept that package as `teck-lab.teck-sbx-recipes`, version 0.4.0. These pure
loader functions were executed without starting or controlling the GUI.

The new regression test starts with a runtime asset exceeding 50 MiB,
verifies that packaging excludes it while preserving the recipe, and checks
that unexpected package files are rejected. Build consistency, all 21 tests
and setup pass. The runtime release hash is unchanged by this repair.
The desktop Dev folder must be changed from `Teck.Orca` to `Teck.Orca\plugin`
and refreshed by the user; no live desktop settings were edited.
