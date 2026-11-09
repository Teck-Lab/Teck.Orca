# Project connection cleanup and daemon update

Desktop: Orca 1.4.229, commit `a0cd1644f320f1327f7495650a816111b495f3cd`.
Plugin: 0.5.5. Project: `github:teck-lab/teck.monorepo`.

With the desktop closed and explicit authorization to remove the finished
connections, removed environments `8db2efaa-9cca-4f53-b2f8-089b23aa8a0e` and
`24552f89-1489-42b2-8fc6-fa0a7aeab2b8` through the public CLI. Removed their two
unused VM runtime records through the installed, schema-validating runtime store.
Desktop metadata was backed up under the user's private `.teck-orca/backups/`.
No replacement connection or workspace was created.

Updated the existing sandbox `teck-orca-p-bc02e0548944`, provider ID
`0af8fa44-d946-41ad-84c3-cec655a7c5a5`, from daemon 1.4.224 to 1.4.229 using the
installed desktop's checksum-verified Linux distribution. Node remains 24.21.0.
The previous server and a private profile snapshot remain in the guest for rollback.

The bundle computes each target's artifact version using Orca's own file ordering,
including native modules and mobile web assets. Versions are
`0.1.0+379585478820` for Linux x64 and `0.1.0+d49a1122809b` for Linux ARM64.
Only x64 was executed live. Do not normalize vendored JavaScript whitespace:
the upstream launcher and preflight verify the original bytes.

Live guest CLI checks confirmed 1.4.229 reachable, all 12 existing worktrees
visible, and no active terminals. Compared the persistent E2E keypair with the
pre-update snapshot: unchanged. The process runtime UUID changed on restart;
the persistent pairing identity and provider identity were preserved.

Returned the project sandbox to its original stopped state. The desktop has zero
saved connections. Local build, package check and setup passed; all 66 tests passed.
The generated plugin needs a Dev refresh in Orca. Desktop GUI acceptance was not run.

## Follow-up: match desktop 1.4.237

After the Windows update completed, bundled daemon 1.4.237 from desktop commit
`071747853f5995ee233b36751613f09a60007c2b` into plugin 0.5.6. This is the final
installed version, replacing the intermediate 1.4.229 update above. Node remains
24.21.0. Template schema 4 references ripgrep in the desktop's shared resources;
the bundler now materializes that reference and verifies its declared checksum.
Artifact versions are `0.1.0+033018f7660d` (Linux x64) and
`0.1.0+cbb1094740c9` (Linux ARM64). Only x64 was executed live.

Updated the same provider instance with a fresh private profile snapshot and
retained the previous server. Live checks again confirmed daemon 1.4.237 reachable,
12 existing worktrees, zero terminals, and the unchanged persistent pairing key.
Returned the sandbox to stopped and retained zero saved desktop connections.
Build, all 66 tests, package check and setup passed. Refresh the generated Dev
plugin in Orca to activate 0.5.6. No new sandbox or workspace was created.

## Guidance refresh: plugin 0.5.7

Refreshed the complete official Orca CLI and orchestration snapshots from the
installed 1.4.237 CLI, including references, with the source version recorded in
`runtime/omp/orca-guides.json`. Updated Teck's worker guidance and terminal smoke
launches to use `--surface terminal` on direct agent/worktree launches. Verified
through the installed command help that supervised `worker-start` does not accept
that flag; its supported orchestration path remains intact. Corrected the stale
feature workflow text to describe the shared project sandbox and retained lifetime.

Applied the four updated guide directories and source metadata to the existing
Monorepo sandbox, verified all 16 copied files against their hashes, and retained
a private guest backup. Model configuration and conversations were not modified.
No agents were launched. Returned the sandbox to stopped. Build, all 66 tests,
package check and setup passed.

The shipped panel bridge cannot invoke plugin commands, read worker data or call
the settings API; it permits only workspace context, terminal input and notifications.
The user selected only the guide/launch updates after this limitation was explained.
No panel, status-command fallback or settings CLI was added.
