# Native SSH runtime

This directory contains the native SSH provider used by the main **Teck OMP Docker Sandbox** plugin (version 0.6.1). It is an internal runtime module, with no separate plugin manifest, npm package or installation step.

## Install and use

From the repository root, run npm run build, npm test, npm run check and npm run setup. Install or refresh **plugin/** in Orca Settings > Plugins. Select **Create project sandbox** in the GUI **Run on** picker for first use. The plugin automatically registers **<project> sandbox** as a persistent SSH target; use that target for later workspaces. Re-running the provisioning recipe after registration is refused before creating another route. Orca manages its matching guest daemon. No manual VM creation or SSH-host addition is needed.

If **Teck OMP Native SSH Preview** is still installed, remove that old plugin entry after refreshing the main plugin. Keep its VM, saved workspaces and ownership records. The main plugin retains the native recipe ID (teck-native-ssh-project), sandbox names (teck-orca-ssh-<hash>), project configuration (native-ssh/projects.json), release store and ownership root (~/.teck-orca-native-ssh). Existing native VMs are reused. Existing workspaces keep their immutable lifecycle snapshots; new/reused recipe runs install the current managed policy without replacing user model configuration or sessions.

The older bundled-daemon sandboxes retain their own records and data. The main plugin keeps **Teck: Reconnect sandboxes** for recovery; it does not migrate those checkouts into native SSH VMs.

## Lifecycle and ownership

Creation is serialized and checks the original provider identity. Resume never replaces a missing VM. Unowned, renamed or substituted VMs are refused. Suspend and destroy are ownership-checked provider no-ops: Orca can clean up a workspace's route while retaining the project VM. Existing workspaces retain their original lifecycle snapshots. Build, tests, setup and plugin activation create no project VM or workspace.

The provider emits schema version 1 and connection.type=ssh, allowing Orca to create linked worktrees. Docker Sandboxes supplies the .sbx SSH transport; Docker Engine inside the VM runs application/test containers. Project naming and OMP-session recovery hooks run on normal startup. Existing custom models, settings, credentials and conversations are retained.

## Runtime and local Kubernetes

Requires Orca 1.4.248+, host Node 22+, Docker Sandboxes 0.48+, OpenSSH and Docker-managed service authentication. The desktop manages the guest Orca server. OMP 18.16.0 and Bun 1.4.4, the existing model roles, planning/execution/review policy and all native helper capabilities remain available. See the [main workflow documentation](../README.md).

Defaults are 8 CPU / 16g memory. Teck.Monorepo enables kubernetes=workspace in projects.json. New enabled VMs use the existing 60g Docker / 30g root settings; existing VMs are not resized. Bootstrap installs one persistent single-node KIND cluster with isolated worktree namespaces, dedicated kubeconfig and ownership/UID-safe cleanup. Base startup installs no Argo CD, Kargo, registry or Git server; CNPG, Rollouts and Gateway API/kgateway/TLS remain optional add-ons.

Shared device preparation runs for every native sandbox independently of the managed KIND profile. The workload install/startup hooks and synchronous terminal hook prepare real character devices (1:11) at /dev/kmsg and /var/lib/teck-kubernetes/kmsg. Ordinary privileged K3s Testcontainers inherit /dev/kmsg without a custom bind mount. KIND retains its existing persistent read-only mount, avoiding volatile /dev sources on reboot. Recipe reuse installs the same helper/hooks in an existing owned sandbox without changing its checkouts, OMP profile, Docker configuration or cluster ownership. Invalid device paths are rejected instead of overwritten.

Use Docker build -> kind load docker-image -> kubectl apply -k deployment/local. teck-kube provides ownership, image/source identity, readiness, Job and initial-analysis checks around this flow. Keep platform definitions in GitOps apps/local categories, cluster-resources/local and bootstrap/local; application manifests stay in each source repository's deployment/ directory. The full WSL2/Cilium/Istio profile remains disabled. See [KIND validation](../docs/validation-official-kind-2026-10-25.md).

## Development and validation

The pixel office runs on the host through the Teck-Lab Agent Office fork. Orca starts one shared browser/server service, with agent controls disabled, and a loopback-only reverse SSH tunnel per owned running Docker Sandbox. The OMP extension emits lifecycle/tool/approval metadata and native helper relationships; prompts, arguments and tool outputs are excluded. The office shows Docker Sandboxes in its cloud wing. A disconnected office never blocks OMP.

The plugin bundles the compiled fork so teammates need no adjacent Agent Office checkout. Maintainers refresh it with the bundle:office task after building the fork. For a watched dev plugin, deploy:local installs both immutable runtimes before publishing the new plugin entry; publishing a build before installation can otherwise reference a missing release.

The office transport runs in a small owner-monitored Node helper. On Windows it probes the system OpenSSH client, falling back to Git for Windows' OpenSSH if the system client cannot launch from the plugin worker. Closing or reloading the plugin closes its tunnels; it never starts a stopped sandbox for the office.

Each connection uses a fresh guest loopback port recorded in `/etc/teck-orca/office.json`. This prevents an older SSH session's cleanup from colliding with the replacement listener. On Windows, cleanup closes the owned SSH process tree, including its Docker proxy.

OMP discovers the observer through `extensions/agent-office.ts`, which imports its ESM implementation. Existing sessions must be reopened/resumed to load it; `/reload-plugins` in OMP 18.16.0 does not reload extension code. Existing Pixtuoid binaries, service and observer files are retired when an owned running sandbox connects. Older immutable kits retain a no-op at their former startup path so they still boot. New images contain no Pixtuoid or ttyd.
