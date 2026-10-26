# Teck OMP Native SSH Preview

The separate preview plugin is `teck-lab.teck-native-ssh-preview` version 0.1.7.
It contributes **Teck OMP SSH Project (Preview)** to Orca?s **Run on** picker.
The original Teck plugin, sandbox and connection remain separate.

Project names are retained across recipe resume and repaired automatically in
managed terminal/OMP startup if Orca falls back to the checkout label `project`.
The hook uses Orca's public metadata API, preserves intentional custom names,
and never moves folders or changes worktree IDs. Refresh this preview plugin
after updating to 0.1.5; no manual project rename is part of the workflow.
An older preview sandbox receives the missing naming hook on its next normal
recipe reuse/resume; its OMP profile and sessions are retained.

## Use the existing GUI workflow

1. Refresh or reinstall **Teck OMP Native SSH Preview** from `native-ssh/plugin`
   in Orca Settings > Plugins. Approve its lifecycle commands when Orca asks.
2. Create a workspace from your local project and select **Run on >
   Teck OMP SSH Project (Preview)** (inside Per-Workspace Environments if grouped).
3. Orca runs the recipe, creates the project sandbox if absent, configures OMP,
   clones the repository once, registers its SSH connection, and creates the
   requested linked worktree. Orca installs/manages its own guest daemon.
4. For another worktree, select **the same preview recipe** again. It reuses
   the same project VM and clone. No Prepare command or manual SSH host setup
   is part of this flow.

The local Teck.Monorepo checkout is a valid starting point. Existing sessions
on the original Teck connection retain their own sandbox and data. This preview
makes a fresh remote clone and does not copy uncommitted work or merge profiles.

## Ownership and lifecycle

One persistent VM is named `teck-orca-ssh-<project-hash>`. Ownership lives under
`~/.teck-orca-native-ssh/`, separately from the original plugin?s records.
Concurrent creation is serialized. Later creates reuse the VM and leave OMP
configuration untouched. A manually deleted VM can be replaced by a new create;
resume requires the original provider identity and never silently replaces it.
Unowned, renamed or replaced VMs are refused.

The recipe returns Orca?s native `connection.type: ssh` result. Orca owns the
workspace SSH records and its managed server lifecycle. These records are
workspace-scoped even when the provider VM is project-shared; one VM does not
imply one workspace-owned record. Cross-workspace orchestration and reconnect
behavior on Orca 1.4.237 still require live acceptance checks.

Suspend is a provider no-op; destroy is disabled. Sleeping/deleting one workspace
does not stop or remove the shared VM. Sandbox deletion is a separate explicit
action after preserving work. Docker Engine inside the VM runs application/test
containers; Docker Sandboxes manages the VM and native `.sbx` SSH transport.

## Runtime and requirements

Orca 1.4.237+, host Node 22+, OpenSSH, Docker Sandboxes 0.48+ and a Docker login.
OmniRoute, MCPHub and GitHub service credentials must already be configured
in Docker. Proxy-managed placeholders are used; host Git identity and personal
credential helpers are not copied.

Defaults are 8 CPU / 16g memory, applied at creation. `projects.json` supplies
Teck.Monorepo defaults; other Orca projects use their supplied repository URL
or local origin. Each project gets its own sandbox. OMP 18.12.5, its model roles,
technical research agent, TDD/review guidance, session recovery and development
toolchain are snapshotted from the existing runtime. The network policy includes
`quay.io:443` and `*.quay.io:443`.

The workload includes checksum-pinned kind 0.33.0 and kubectl 1.35.8. Teck.Monorepo
now opts into the managed workspace profile with "kubernetes": "workspace" in
projects.json. On normal recipe create/reuse/resume, the plugin installs the
immutable guest helper and starts bootstrap without holding up SSH/OMP. Interactive
terminal startup also checks it, so a stopped VM recovers its existing cluster.
Build/setup/plugin activation still create no VM or cluster. Existing workspaces
retain their older immutable recipe snapshots: after refreshing, create an
additional workspace with the same preview recipe to apply this update to the
shared VM. Once installed, the terminal hook also covers older workspaces.

## Local Kubernetes

Enable kubernetes: workspace in the existing project configuration. The separate native SSH preview keeps the GUI Run on workflow and starts one persistent, single-node KIND cluster. Base startup installs no Argo CD, Kargo, registry or Git server.

Use Docker build -> kind load docker-image -> kubectl apply -k deployment/local. teck-kube deploy is a convenience around these operations with source/image records, namespace ownership checks, apply phases, readiness and initial analysis checks. Optional shared add-ons are installed with teck-kube addon cnpg|rollouts|gateway, or the application build declaration's addons list. No local promotion destination is created.

Each worktree owns its namespace and databases. teck-kube kubectl supplies the dedicated kubeconfig; cleanup removes only the owned namespace and preserves shared operators/other worktrees. See docs/local-development.md in Teck.GitOps and ../docs/validation-official-kind-2026-10-25.md.

Keep platform definitions in GitOps apps/local categories, cluster-resources/local and bootstrap/local; app manifests remain in the source repo deployment/. Package definitions with npm run bundle:kubernetes -- --gitops ../Teck.GitOps, then build/check/setup the preview. Existing enabled VMs are not resized or silently migrated. Old draft delivery clusters require explicit migration; their data is retained.

New enabled VMs retain the existing 8 CPU/16g memory, 60g Docker/30g root resource settings. The full WSL2/Cilium/Istio profile is still disabled.

## Development and installation

From the repository root:

```text
npm run build --prefix native-ssh
npm test --prefix native-ssh
npm run check --prefix native-ssh
npm run setup --prefix native-ssh
```

Setup installs an immutable, checksum-verified snapshot under
`~/.teck-orca-native-ssh/releases/<digest>`. The small plugin recipe points to
that exact snapshot, so it works independently of the current checkout.
Build, check, tests, setup, and plugin activation create no sandbox or workspace.
Install **native-ssh/plugin**, not the repository root. Refresh the preview
after rebuilding and running setup.

The Windows Node launcher preserves UTF-8 lifecycle JSON and exit codes.
Provider logs go to Orca?s recipe progress/error stream; stdout contains only
the final connection JSON. The shared Docker kit builder is checked for at least
32 GiB capacity and 12 GiB free; it is not pruned or replaced automatically.

## Live acceptance

After refreshing the plugin, create two GUI worktrees with the preview recipe.
Confirm a single preview VM, OMP in both workspaces, the correct guest CLI target,
and supervised worker creation, messaging, settlement and cleanup. Then check
Orca restart, stopped-sandbox reconnect and exact OMP session continuation.
Portable tests do not establish these live results. See `VALIDATION.md`.

Workflow reference: [mattjohnson/orca-sbx-recipes](https://github.com/mattjohnson/orca-sbx-recipes).
That pack documents the project-shared Run on recipe pattern; its current shell
implementation is macOS/Linux-only and uses its own sshd. This preview uses
Node on Windows and Docker-managed `.sbx` SSH with our existing workload.

