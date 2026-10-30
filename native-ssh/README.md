# Native SSH runtime

This directory contains the native SSH provider used by the main **Teck OMP Docker Sandbox** plugin (version 0.6.0). It is an internal runtime module, with no separate plugin manifest, npm package or installation step.

## Install and use

From the repository root, run npm run build, npm test, npm run check and npm run setup. Install or refresh **plugin/** in Orca Settings > Plugins. Select **Teck OMP Project** in the GUI **Run on** picker for each workspace. The first workspace creates a project sandbox if absent; later workspaces reuse it. Orca registers SSH and manages its matching guest daemon. No manual VM creation or SSH-host addition is part of this flow.

If **Teck OMP Native SSH Preview** is still installed, remove that old plugin entry after refreshing the main plugin. Keep its VM, saved workspaces and ownership records. The main plugin retains the native recipe ID (teck-native-ssh-project), sandbox names (teck-orca-ssh-<hash>), project configuration (native-ssh/projects.json), release store and ownership root (~/.teck-orca-native-ssh). Existing native VMs are reused. Existing workspaces keep their immutable lifecycle snapshots; new/reused recipe runs install the current managed policy without replacing user model configuration or sessions.

The older bundled-daemon sandboxes retain their own records and data. The main plugin keeps **Teck: Reconnect sandboxes** for recovery; it does not migrate those checkouts into native SSH VMs.

## Lifecycle and ownership

Creation is serialized and checks the original provider identity. A manually deleted VM can be replaced by a new workspace create; resume never replaces it. Unowned, renamed or substituted VMs are refused. Suspend is a provider no-op and destroy is disabled: sleeping/deleting a worktree retains the project VM. Build, tests, setup and plugin activation create no project VM or workspace.

The provider emits schema version 1 and connection.type=ssh, allowing Orca to create linked worktrees. Docker Sandboxes supplies the .sbx SSH transport; Docker Engine inside the VM runs application/test containers. Project naming and OMP-session recovery hooks run on normal startup. Existing custom models, settings, credentials and conversations are retained.

## Runtime and local Kubernetes

Requires Orca 1.4.245+, host Node 22+, Docker Sandboxes 0.48+, OpenSSH and Docker-managed service authentication. The desktop manages the guest Orca server. OMP 18.14.0 and Bun 1.4.4, the existing model roles, planning/execution/review policy and all native helper capabilities remain available. See the [main workflow documentation](../README.md).

Defaults are 8 CPU / 16g memory. Teck.Monorepo enables kubernetes=workspace in projects.json. New enabled VMs use the existing 60g Docker / 30g root settings; existing VMs are not resized. Bootstrap installs one persistent single-node KIND cluster with isolated worktree namespaces, dedicated kubeconfig and ownership/UID-safe cleanup. Base startup installs no Argo CD, Kargo, registry or Git server; CNPG, Rollouts and Gateway API/kgateway/TLS remain optional add-ons.

Use Docker build -> kind load docker-image -> kubectl apply -k deployment/local. teck-kube provides ownership, image/source identity, readiness, Job and initial-analysis checks around this flow. Keep platform definitions in GitOps apps/local categories, cluster-resources/local and bootstrap/local; application manifests stay in each source repository's deployment/ directory. The full WSL2/Cilium/Istio profile remains disabled. See [KIND validation](../docs/validation-official-kind-2026-10-25.md).

## Development and validation

All native provider tests run in the root npm test command and CI matrix. Root setup installs the integrity-verified native runtime snapshot and older recovery runtime; plugin/ contains only the small manifest, license, recovery entry and native recipe. Historical preview validation is retained in [VALIDATION.md](VALIDATION.md); current packaging validation is recorded in [the consolidation report](../docs/validation-unified-plugin-2026-10-30.md). Portable tests establish package generation, immutable installation and mocked provider behavior, not a new GUI/reboot acceptance result.
