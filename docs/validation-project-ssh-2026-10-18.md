# Project-wide native SSH sandbox validation

Historical v0.5.0 validation. Its pre-provisioned Monorepo sandbox and all older
sandboxes/connections were subsequently removed at the user's request. v0.5.1
replaces the manual setup command with an Orca first-use project recipe; the
enabled-project section below records the earlier state, not the current state.

Version: Teck.Orca 0.5.0. Host: Windows, Orca 1.4.229, Docker Sandboxes
0.48.0-rc3, Node 24.18.0. Guest distribution remains Orca 1.4.224 with its
pinned Node runtime and the existing OMP 18.11.3 workload.

The project ID alone determines the sandbox name. Worktrees and features have
no sandbox destroy callback. Project records retain the Docker sandbox ID and
refuse unowned, missing or replaced sandboxes. The daemon listens on guest
loopback; the sandbox publishes no Docker ports. An incoming desktop connection
uses Docker's native SSH to wake the VM, wait for the existing local daemon and
forward authenticated bytes. OMP retains local daemon access.

Orca's public plugin API does not register SSH/project hosts, and plugin workers
are loaded on demand. Provisioning therefore uses public environment/project
CLI commands. A hidden per-user Windows login companion observes the public
status command and restores listeners while Orca is running. It does not start
VMs without connection traffic or edit desktop stores. Its startup launcher
verifies the content-addressed executable dependency closure. Other platforms
need their own user login-manager registration for automatic startup.

## Completed checks

- All 51 Node regression tests pass, including legacy feature compatibility,
  project ownership and rollback, byte forwarding, supervisor recovery, real
  companion singleton/shutdown behavior, the actual Windows VBS startup launcher,
  integrity refusal and project-scoped OMP session identity.
- Build and generated package checks pass. The installed Orca manifest validator
  accepts the plugin. The installable package is 2,878 bytes and no longer offers
  the per-feature recipe; existing recipe snapshots retain their launchers.
- A disposable sandbox used SSH-only paired connectivity with no Docker ports.
  Repeated setup reused the sandbox, clone, daemon and pairing. The local CLI
  created linked parent/child worktrees and an interactive `omp --no-title`
  terminal. Process inspection confirmed the running OMP process.
- The test stopped the VM twice. Ordinary traffic using the original pairing
  woke it and restarted the daemon in 6,346 ms and 4,548 ms. The desktop listener
  was replaced between cold starts. Worktree IDs, parentage, branches and an
  uncommitted child file survived. The exact test sandbox was removed afterward.

Passing live report:
`.artifacts/smoke/teck-project-ssh-7d6e5aeb-bbbe-481b-bd18-812e2713366b/result.json`.
Earlier probes had incorrect OMP output/process assertions; direct inspection
established OMP was running, and the final probe uses its real terminal handle
and process command rather than echoed shell error strings or executable links.

## Enabled project

At the user's selection, Teck.Monorepo was provisioned as
`teck-orca-p-bc02e0548944` and paired as **Teck Teck.Monorepo (548944)**,
environment `56620b98-ea56-464d-a10e-8caf6bdcd77f`. The remote project checkout is
`/home/agent/project`, registered with ready host setup
`bf2e92b7-1d6f-4a14-af5f-39f91a89bc6e`. The supervisor and SSH listener processes
were confirmed alive. Existing feature sandboxes were retained.

Installed release:
`8c5f094bcd4d29a28fa966a8c0b4d2c653d4b71dd83f6faf4aed79a7013d36a7`.
Automatic startup:
`%APPDATA%/Microsoft/Windows/Start Menu/Programs/Startup/Teck.Orca.ProjectSSH.vbs`.

The user requested that further desktop control stop and will complete plugin
approval in Orca. No further computer-control actions were issued. The plugin
was last observed as v0.5.0 needing review.

## Limits

The live test covers real VM stops and replacement of the local transport; it
does not reboot Windows or close the user's Orca desktop. OMP startup and local
CLI operations were verified; no new model task, native-chat acceptance or
end-to-end worker dispatch was performed in this change. Existing session
restoration is retained, but interrupted processes/turns do not continue
automatically. Occupied or OS-denied saved listener ports are reported rather
than replaced. Existing feature data is not automatically consolidated into the
new project sandbox.
