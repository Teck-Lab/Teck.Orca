# Shared KIND and K3s prerequisites — 2026-11-01

Plugin 0.6.1 prepares a real Linux kmsg character device (major 1, minor 11)
at both /dev/kmsg and /var/lib/teck-kubernetes/kmsg. This is independent of
managed KIND being enabled. Workload installation prepares devices before use,
the lifecycle startup hook restores them after boot, and the synchronous shell
hook closes the startup-hook/agent race. Normal native recipe creation and reuse
install the same helper/hooks, including in an existing owned sandbox. No
Monorepo code or active project sandbox was changed.

KIND retains its persistent read-only device mount and cluster ownership.
The official K3s Testcontainers module inherits /dev/kmsg through its existing
privileged configuration; no application-side kmsg bind mount, entrypoint or
device command is required. The plugin does not launch a shared K3s service:
integration-test fixtures still own their disposable clusters.

## Isolated acceptance

All live mutations used the newly created, mountless test sandbox
teck-k8s-test-ee50582013b7, provider ID
e675efb4-debe-40e9-ae1d-a6326409ceb2. Existing project and kit-builder IDs/statuses
were recorded before testing and preserved. The lab used the same pinned
shell-docker source template as the workload, 8 CPUs, 16g RAM, 40g Docker storage
and 30g root storage. Observed runtime: Linux 7.0.14, Docker Engine 29.7.2.
The actual native prerequisite installer ran before any KIND configuration.
Pinned .NET SDK 10.0.401, kind 0.33.0 and kubectl 1.35.8 were used.

- A normal privileged child container inherited a real /dev/kmsg without a mount.
- Official Testcontainers.K3s 4.16.0 with rancher/k3s:v1.35.9-k3s1
  (resolved digest sha256:ec9868c6a38d4e8c1869832fb5fd1eb8473c39794a0b44d2b952e7ba911951bc)
  started as agent, reached node Ready, scheduled a real pod to Succeeded,
  returned its exact expected log and passed API /readyz after scheduling.
  The tracked fixture contains no custom kmsg mount or device creation.
- The native plugin's existing KIND installer reached Ready with its pinned
  Kubernetes 1.35.8 node. A locally built image loaded through kind load
  docker-image ran to completion with exact expected output.
- After a cold VM stop/start, the installed interactive terminal hook restored
  /dev/kmsg without a manual preparation command. The boot ID changed; the
  persistent device inode, KIND node UID and original pod UID were retained.
  A new KIND pod completed, and a fresh unmodified K3s Testcontainers cluster
  again completed its pod and passed API readiness. Testcontainers disposed
  its clusters.
- The real helper passed eight concurrent calls and retained the device inode
  on repeated preparation. Negative tests in a disposable child container
  rejected a regular file, directory, symlink and wrong character device
  without replacing them.

The test pod image was loaded locally to isolate device/scheduling behavior
from nested-registry networking. Raw multi-platform busybox loading exposed
the documented KIND/containerd missing-digest issue; building a single-platform
fixture image through the standard build/load workflow passed. No unrelated
image-loader changes were made.

## Portable validation and limits

Two reproducing provider regressions failed before implementation, then passed:
prerequisites must run with KIND disabled on both creation and reuse, and failed
preparation must prevent first-time readiness. Packaging and shell syntax tests
cover inclusion in the native immutable runtime and workload install/startup
hooks. All 186 repository tests, build and integrity checks passed.

These tests establish shared device prerequisites and ordinary pod execution
on the observed sandbox runtime. They do not establish CNPG/Barman backup,
post-backup WAL replay, exact-backup-ID restore, SeaweedFS/Garage compatibility,
production HA, full Cilium/Istio support or all K3s/kernel version combinations.
The complete heavyweight workload image was not rebuilt for this isolated test;
the shared helper, native installer, managed KIND installer and terminal
recovery path were exercised directly against its exact source template.
No GUI or Computer Use was used.

The static Orca recipe doctor parsed the recipe successfully with no failures.
Its existing warnings are retained deliberately: integrity-pinned Node launchers
are not repo-relative script paths, and destroy is disabled because a workspace
must not delete its shared project sandbox. These warnings are not a clean
doctor gate and are not presented as end-to-end GUI provisioning acceptance.

The updated native and recovery runtime snapshots were installed locally. The
disposable lab was removed after collecting the restart receipt. Final inventory
confirmed the same three pre-existing sandbox IDs and statuses: native project
running, older project stopped, kit builder stopped. Sanitized local receipts
are under .artifacts/kind-k3s-compat/.

After refreshing the plugin, a normal Teck OMP Project GUI recipe run upgrades
an existing owned native sandbox. Already saved workspaces retain their older
immutable recipe until that upgrade has occurred; this validation intentionally
left the active project sandbox untouched.
