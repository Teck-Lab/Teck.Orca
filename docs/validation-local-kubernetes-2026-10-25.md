> Historical validation of the superseded delivery design. Current workflow: validation-official-kind-2026-10-25.md.

# Local Kubernetes workspace validation - 2026-10-25

Layout correction: the initial GitOps paths in this historical report are superseded
by [the canonical layout validation](validation-gitops-layout-2026-10-25.md).

The workspace profile is implemented and tested in isolated Docker Sandboxes:
one persistent kind cluster per project, separate worktree namespaces, kindnet
and no Istio/Cilium. The full WSL2/Linux profile is explicitly disabled; it is a
separate integration milestone, not a validated result of these tests.

## Isolation and source ownership

Only these mountless test VMs were used for cluster operations:

| VM | Docker sandbox ID | Purpose |
| --- | --- | --- |
| teck-k8s-test-6be64c0ca54a | 366b18bb-f274-44f0-8573-0cc4ed3249cf | Kernel/mesh probe and weighted traffic tests |
| teck-k8s-test-49ed335a3a89 | 858e6dc5-822e-4f40-838e-23c4088f7895 | Managed bootstrap, application, native installer and recovery |

Both used 8 CPUs, 16g RAM, 30g root and 40g Docker storage. The test helper
verifies the exact recorded provider ID and refuses project sandbox names,
foreign/replaced identities and unreadable inventories before mutations.
The existing two project sandboxes and kit builder were not stopped, configured
or used for cluster tests. No computer/GUI automation was used.

Teck.GitOps/local/ owns profiles, kind topology/node digest, controller pins,
local source services and dependencies. Teck.Monorepo/deployment/ owns application
base/local/development/staging/prod overlays. Teck.Orca packages a checksum-verified
GitOps snapshot and implements lifecycle/deployment helpers. These are local
checkout changes; no GitHub commits, pushes, issues, releases or remote delivery
controller changes were made. Synthetic commits were made only in isolated local
fixture repositories and the cluster's local Git service. Terraform is untouched.

## Runtime and compatibility

| Component | Tested version |
| --- | --- |
| kind / kubectl | 0.33.0 / 1.37.1 |
| Kubernetes node | 1.36.4, sha256:099e049362a1526b2db71494e1947aae99bd16290d7c895f2b7ea312e3cbfaed |
| Helm | 3.22.1, architecture-specific SHA-256 |
| Gateway API / kgateway | 1.5.1 experimental / 2.4.7 |
| cert-manager | 1.21.3 |
| Argo CD | 3.5.6, chart 10.11.1 |
| Argo Rollouts / Gateway API plugin | 1.10.1 / 0.17.0 |
| Kargo | 1.12.4 |
| Local registry | 3.0.0, digest-pinned |
| Keycloak application dependency | 26.8.1, digest-pinned |

Official Helm/chart/manifest artifacts are checked against local SHA-256 pins.
kind needs a real kmsg character device (1:11), mounted read-only at /dev/kmsg
in its nodes. The source is /var/lib/teck-kubernetes/kmsg on persistent VM storage,
because Docker can create a directory for a missing /dev bind source during boot. The sandbox's public proxy CA is installed in node trust stores; TLS
verification stays enabled. containerd needs a NO_PROXY exception for the local
registry hostname. Git/registry endpoints are reachable from build tools, node
containerd, Argo CD and Kargo; no application port-forwarding is used.

The original probe demonstrated that Ready Istio pods did not establish ambient
functionality: IPv4 policy routing is disabled in the Docker Sandboxes kernel.
The installed 0.48.0-rc3 and inspected 0.49.2 kernels lack the required feature.
The workspace profile therefore installs no mesh or inert security policies.
Cilium/ambient, STRICT mTLS/default deny and agent-to-WSL routing remain untested.
The inspected WSL2 kernel having routing/BPF support is not a full-profile pass.

## Live application and delivery results

- Managed bootstrap created one control plane and one worker, then certificates,
  HTTPS gateway, local Git/registry and all delivery controllers. It ran as a
  detached guest process after the initiating sbx exec returned. The actual
  native plugin installer was subsequently tested against a fresh owned cluster
  in the second VM; it reached Ready without holding SSH startup for controllers.
- Gateway.Public built from a current standalone Teck.Monorepo source snapshot
  using the existing shared Containerfile. The pilot deployed real per-worktree
  Keycloak instances and imported a local realm with a generated client secret.
  Initial analysis checked gateway /alive and Keycloak's real OIDC configuration.
- The tracked sandbox/kubernetes-smoke/worktrees.mjs driver passed against the
  installed immutable guest assets. Two concurrent synthetic checkouts served
  alpha and beta through distinct trusted HTTPS hostnames. A dirty alpha change
  produced a different content hash/image digest and served alpha-dirty while
  beta stayed unchanged. Unauthenticated /orders/ returned 401 before reaching
  undeployed commerce backends. Test-only version endpoints were inserted only
  in the isolated source copies; host C# sources were not changed.
- Kargo discovered the exact locally published immutable release and promoted
  its matching manifests/image into a separate promotion namespace/Application.
  The GitOps Kustomize reference points to that exact apps.git commit. Kargo
  verification succeeded and the promoted endpoint served alpha independently
  of subsequent alpha-dirty iteration changes. There were no remote Argo/Kargo
  endpoints or human GitHub credentials in this flow.
- The dedicated traffic fixture sampled 300 real HTTPS requests during 50/50
  canary traffic: v1=155, v2=145. Argo refresh AND sync preserved the active weights.
  Successful analysis promoted v2. A deliberately bad canary failed analysis,
  left the desired Rollout Degraded, restored route weights to 100/0 and returned
  v2 for 80/80 subsequent requests. Recovery did not falsely mark the bad desired
  version healthy.
- Cleanup removed one worktree while the other HTTPS application and shared
  cluster kept running. Removing the remaining prototype worktree also removed
  its separate promotion objects without removing the shared cluster. All
  ownership checks happen before deletion; Kubernetes deletes use exact UID
  preconditions. Unit tests reject foreign/replaced objects without partial
  deletion. Source/image history is retained rather than globally pruned.

Live failures drove fixes: kubelet kmsg access; containerd proxy bypass; HTTP Git
child-process/protocol handling; direct sync RespectIgnoreDifferences; actual
/alive probe path; relative generated Kustomize resources;
Kargo block-style YAML updates, canonical admission-assigned Promotion names and
bounded Argo update retries; failed state retaining newly recorded resource UIDs;
persistent kmsg bind storage across VM boots; bounded cold API authorization/cache
startup retries; and privileged reads of the exact
agent-owned checkout without changing Git trust
configuration. The native wrapper preserves proxy/public-CA and Orca worktree
context, and adds managed guidance without replacing the OMP profile.

## Restart and resource observations

The installed agent interactive startup hook passed a real cold VM stop/start.
The boot ID changed; both recorded node IDs, six namespace/Application/secret
UIDs, and the iteration image digest stayed unchanged. The hook reconciled the
new boot to Ready without a manual start/ensure command. Trusted HTTPS continued
to serve alpha-dirty in iteration and alpha in the independent promotion target.
The first restart probes exposed the volatile device bind and transient API
startup authorization issues; both were corrected and the final cold test passed.

The exact final guest asset digest matches the live restart-tested installer:
51e1777da03ac98b786a7939d781f685582b25630a8677d0c451821cbbc40cfe.
Preview 0.1.4 is installed as immutable release
2a43937a5d70acf70c78c9cce762943b0ebfd9416fad6b214d94d7ddec7dea7c.
Both test VMs were removed after saving sanitized receipts. The original project
VMs and kit builder retain their original provider identities.

A representative managed-VM sample with real application/dependency instances
showed about 5 GiB used RAM and 9.8 GiB Docker storage; about 11 GiB memory remained
available including reclaimable cache. This is not a measured peak or scale test.
Defaults remain 8 CPUs/16g. Newly created Kubernetes-enabled project VMs get 60g
Docker/30g root storage. Existing disks are not resized. Bootstrap checks minimum
free space and fails without deleting data. Owned node IDs, namespace/secret UIDs
and pinned component versions must survive recovery; pin/topology changes require
an explicit migration rather than silent replacement.

## Portable checks and practical limits

Root build, tests and check passed: 117 tests including 39 focused Kubernetes
checks. Native preview build, tests and check passed: 21 tests. Those include real
Windows shell invocation of approved launchers and mocked provider lifecycle
coverage; the live sandbox tests establish the Kubernetes results separately.

The pilot is Gateway.Public + Keycloak, not a complete authenticated commerce
stack. Existing application deploy/ resources are retained during migration.
Kargo's user-facing API/UI is disabled pending local authentication/ingress;
helpers use its Kubernetes API. Windows-host browser/DNS access is not configured;
the tested HTTPS consumers are inside the sandbox and cluster.

No new Orca GUI creation/linked-worktree/OMP session recovery acceptance test was
performed. The GUI Run on recipe remains unchanged, setup creates no VM, and
worktree deletion has no destructive shared-cluster hook. Agent cleanup is
explicit. Refresh native-ssh/plugin after installation; ordinary recipe reuse
installs/starts the managed helper when selected for an additional workspace.
Older workspace recipe snapshots remain pinned until the shared helper is installed. Application deployment/ changes must
reach the normal remote-clone checkout through the usual GitHub App workflow;
host uncommitted application files are not copied by the production plugin.

Sanitized traffic/source/image/concurrency/restart receipts and exact test VM
ownership live under ignored .artifacts/kubernetes-lab/. No kubeconfig, private CA
key, real token or initialized OMP profile is copied into the repository.
