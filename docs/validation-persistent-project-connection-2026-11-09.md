# Persistent project SSH connection

The old recipe reused the Docker Sandbox but Orca 1.4.248 created a hidden SSH
target and saved environment for every recipe invocation. Returning identical
SSH target fields did not deduplicate the registrations. Two connections
therefore displayed the same remote worktrees. `destroy: none` also disabled
Orca's connection cleanup instead of only preserving the shared provider VM.

The plugin now uses the capability-gated `ssh.target-management.v1` runtime RPCs
to register a regular `<project> sandbox` SSH target for an ownership-verified
running sandbox. It uses Docker's existing `.sbx` SSH config and Orca's normal
daemon management. No Orca profile/database files are written directly, no
browser/computer automation is used, and no user shell commands are required.
The narrow local IPC adapter only allows SSH registration/state/connection and
runtime status; local authentication remains inside the host process.

Use `Create project sandbox` in Run on for first use. Later workspaces use the
regular project sandbox target in the same GUI picker. The recipe verifies the
existing target before returning another connection. A missing provider sandbox
still permits explicit recreation; resume remains pinned to its original VM.

The plugin retires its exact bootstrap registrations only through Orca's
local-only `environment forget` action. It first verifies its ownership record,
the canonical target, equal live runtime IDs, complete equal worktree ID/path/
branch inventories and zero live terminals on both routes. It defers retirement
while terminals are running or inventories differ. It never uses environment
stop, deletes a worktree or changes Orca's lifecycle snapshots.

New recipe snapshots run an ownership-checked provider no-op for destroy,
allowing Orca to retire workspace connection metadata while retaining the VM.
Existing snapshots keep their original cleanup behavior.

Live repair: the two recipe registrations for Teck.Monorepo were retired using
the supported local-only unlink operation. The new regular manual-source target
is named `Teck.Monorepo sandbox`. All five worktree IDs, paths and branches and
the guest runtime ID were verified unchanged, with zero live terminals during
the migration. Repeating registration reused the same target. No sandbox,
application file, KIND cluster or daemon was restarted or recreated.

Regression coverage includes repeated registration, changed target/provider
ownership, desktop identity fencing, concurrent status refreshes, active-terminal
and inventory-mismatch refusal, recipe re-entry prevention, and execution of the
real immutable destroy launcher through the host shell.

All 267 plugin tests and generated-asset checks passed. The installed immutable
create launcher was also tested against the live registered project: it refused
re-entry with the correct GUI target label and left the single connection intact.

Windows worker validation also covers missing APPDATA and explicit selection of
the bundled CLI launcher: the worker PATH can otherwise select Electron's GUI
executable and treat a CLI subcommand as a JavaScript filename. Child CLI calls
are explicitly bound to the desktop profile and clear inherited remote routing.
