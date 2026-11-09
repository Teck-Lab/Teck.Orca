# Automatic project names — 2026-10-25

The original plugin is now 0.5.11 and the separate native SSH preview is 0.1.2.
Both preserve the desired display name without changing the Run on workflow or
the repository directory `/home/agent/project`.

`runtime/project-name.mjs` finds the exact local project setup by durable project
ID and checkout path. It changes only a generic checkout-derived display name
through `orca project setup-update --display-name`; an intentional custom name
is retained. It never edits private Orca stores, moves paths, changes repository
IDs, launches agents or creates a second connection.

The existing daemon lifecycle invokes it after readiness on both fresh startup
and reconnect. Fresh daemon startup may register its existing checkout once using
the public `repo add` command. Managed shell/OMP startup invokes the same helper
using Orca's supplied CLI and profile; this is the native SSH preview's hook after
Orca has registered the host. The native pane hook never registers a repository.
Outside a managed Orca pane it skips PATH-resolved CLI access, avoiding Linux's
unrelated Orca screen-reader executable.

New sandbox environment setup carries `TECK_ORCA_PROJECT_NAME`. Older sandboxes
derive the case-preserving repository name from their credential-free Git origin
URL. Native recipe results retain the original project name in their lifecycle
payload so a changed working directory on resume cannot turn it into `project`.
Naming errors produce a warning while preserving access to existing sessions.

Six initially failing regression tests reproduced the missing naming behavior.
The completed suite includes eight helper tests covering repair, repeat reconnect,
first registration, exact host/path/project scoping, ambiguity, custom names,
credential-bearing URLs, native CLI/profile routing, and older sandbox fallback.
The native suite also checks resume with a changed cwd and retained project name.
All **78 original tests** and **20 preview tests** pass; both builds/checks and the
installed Orca manifest validator accept the resulting packages.

The new immutable original runtime is installed at
`~/.teck-orca/releases/4f2c8b456bc6baf390f3d05292ac139f625eb0678fd11d1a6c30960293befab5`.
The new preview snapshot is installed at
`~/.teck-orca-native-ssh/releases/1f8339d2ca672637bbaf1111dc6d59d724e73b1ab07191726f1f34df356ec249`.
The original Windows startup companion was not changed or restarted.

An existing 0.1.1 preview gains only the missing naming helper/startup hook on
its next create/resume reuse. The migration does not recopy its OMP profile,
change launch/session settings or re-clone the repository. Already-equipped
previews skip that installation step.

## Existing sandbox deployment and live check

The old `manage-daemon.mjs` and `omp-launch.mjs` guest bytes were first checked
against their pre-change source hashes. Only those two helpers and the new naming
helper were copied into the original owned sandbox. Existing helpers were backed
up under
`/home/agent/.local/state/teck-orca/policy-updates/before-project-name-1792927347821`.
No Orca binary, profile settings, OMP journal or agent policy was overwritten.

The daemon readiness/reconnect command was exercised using the installed helper.
The naming helper then reported `unchanged` for the already-corrected saved name
`Teck.Monorepo`. Daemon PID **237** remained the same. All **six** worktree IDs,
paths and branches matched the before-check inventory. The live check did not
restart Orca, the VM, the daemon or an OMP session and made no model requests.
Receipts and the previous metadata snapshot are under `.artifacts/project-name/`.

A full desktop/VM restart and a newly provisioned native SSH GUI workspace were
not exercised. Their hook logic is covered by the automated tests; they remain
separate live acceptance checks. Refresh the preview plugin to load 0.1.2.
