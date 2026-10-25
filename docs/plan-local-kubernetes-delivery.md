# Local Kubernetes application and delivery testing plan

Updated 25 October 2026. Workspace implementation and isolated acceptance results are recorded below.
The optional full profile requires separate WSL2 validation. This revision replaces
the requirement to run ambient inside Docker Sandboxes.
See [compatibility results](validation-local-kubernetes-2026-10-25.md).

## Agreed architecture

| | Workspace | Full |
| --- | --- | --- |
| Runtime | Docker Engine in the existing project Docker Sandbox | Dedicated WSL2/Linux environment on the developer PC |
| Sharing | One persistent kind cluster per project, shared by its worktrees | One shared kind cluster, with isolated project/worktree namespaces |
| Networking | kindnet; no Cilium or Istio | Cilium + Istio ambient, following GitOps configuration |
| Delivery | Local Argo CD, Kargo, Rollouts/Gateway API plugin, kgateway and HTTPS ingress | Same delivery components plus mesh/network security |
| Purpose | Everyday application/deployment/delivery testing | Platform integration, mTLS, authorization and network-policy validation |
| Startup | Automatic through the GUI recipe after pilot validation | Optional; need not run alongside workspace clusters |

Start with Teck.Monorepo and the native SSH preview. Preserve Run on and Orca's
linked-worktree behavior. Build/setup/plugin activation create no resources.
Test in a separate sandbox before enabling an existing project.

Workspace provides no mesh mTLS, Istio authorization or Cilium enforcement.
Do not install inert security policies, report security checks as passed or
substitute sidecars implicitly. Full retains STRICT mTLS, default-deny and exact
service-account allowances. Unsupported full prerequisites must fail explicitly,
never silently downgrade to workspace.

Neither profile uses remote Argo CD/Kargo, production secrets or remote GitOps
writes. Terraform, server provisioning and vcluster are excluded. Downloads and
source reads are allowed; offline operation is separate.

## Compatibility gates

The isolated mountless lab is teck-k8s-test-6be64c0ca54a. Ownership/protected project
identities are recorded under .artifacts/kubernetes-lab/. Two-node kind works
with a persistent kmsg device supplied to kubelet and the sandbox's public proxy CA installed
in node containerd. TLS verification remains enabled.

Docker Sandboxes' kernel, including 0.49.2, lacks ambient's IPv4 policy routing
and some Cilium prerequisites. Workspace explicitly avoids these components.
The inspected WSL2 kernel has the missing routing/BPF features; complete
Cilium/ambient functionality and agent-to-WSL connectivity remain untested.

Before project activation, prove trusted HTTPS, local source/controller access,
real canary traffic, analysis failure/recovery and restart in the lab.
Controller readiness alone does not establish compatibility.

## Repository ownership

| Repository | Responsibilities |
| --- | --- |
| Application repo | deployment/{base,local,development,staging,prod}; application resources, rollout strategy and analysis/tests |
| Teck.GitOps | Both platform profiles, kind topology/image pins, component lock, controller/source services, actual cluster destinations and operational overrides |
| Teck.Orca | Immutable packaging, project lifecycle, worktree identity, deployment helpers, connectivity and diagnostics |

Both profiles consume the same application's deployment/base + deployment/local.
Applications describe environments, not cluster inventories. Multiple production
clusters reference the same versioned prod overlay. Cluster overrides belong in
GitOps; do not fork application manifests into workspace/full copies.

Use apps/local/{network,platform,security,system} for local app overlays,
cluster-resources/local for prerequisites, bootstrap/local for KIND/profile pins,
and projects/local to adapt the existing category ApplicationSets.
Do not bootstrap remote root ApplicationSets. Package a pinned configuration
snapshot in the immutable Orca runtime and seed a local Git service from it.
Snapshot upgrades are explicit, not fetches of HEAD at every startup.

## Platform and ingress

Start workspace kind with one control plane and one worker, Kubernetes 1.36
matching the configured deployed minor, and a pinned node image digest. Nodes
share the sandbox kernel/resources. Pin tested Gateway API, kgateway, cert-manager,
Argo CD, Rollouts/plugin, Kargo, Git service and registry versions. Full adds
Cilium, Istio and local certificate integration following GitOps patterns.

Each cluster has independent local source services/controllers. Test registry/Git
access from build tools, node containerd, Argo CD and Kargo; loopback identifies
different namespaces. Allow local publishing only to explicit local repositories.
Reuse no human GitHub or remote delivery credentials.

Agent/browser -> trusted HTTPS hostname -> kgateway -> stable/canary Service -> pod.

Full additionally enforces ambient transport and authorization on relevant hops.
Provide local DNS, certificates and proxy exclusions for tools, clients and
Chromium. Keep hostname verification enabled. Direct pod requests and application
port-forwarding do not establish real-ingress acceptance.

Full-target access requires tested Kubernetes API and HTTPS gateway routes across
Docker Sandboxes/Windows/WSL, correct certificate SANs and DNS. Broad host shell
access, cross-cluster pod routing and mesh federation are unnecessary.

## Worktree iteration and local promotion

Derive namespaces, Applications and hostnames from stable Orca project/worktree
IDs. Give worktrees separate image references, writer locks and delivery objects.
The full target must distinguish projects as well.

Daily iteration builds the current worktree including dirty changes, renders
deployment/local with generated namespace/hostname/image digest overrides, and
syncs its local Argo CD Application. Record a source content identifier plus HEAD.
Disable automatic sync/self-heal for override mode and scope its permissions to
local Applications. Report OutOfSync with Git accurately.

Promotion tests use separate Git-driven Applications/destinations. Publish a
local immutable test release binding exact source snapshot, manifest revision and
image digests. Kargo promotes that matched pair, Argo CD reconciles it and
Rollouts executes the strategy. Reject mismatches and unrelated newest versions.
No real GitHub releases are needed; switching deployment mode is explicit.

For platform-sensitive changes, validate the same image/manifest revision on full.
Workspace results alone cannot validate security changes.

Rollouts owns selected HTTPRoute backend weights. Scope Argo CD diff exceptions
to those fields on intended routes, with RespectIgnoreDifferences=true. Prove
refresh/sync preserves active splits. Use real analysis dependencies and measure
stable/canary responses. Deliberately bad canaries must fail analysis and restore
stable traffic; failed desired state remains failed after traffic recovers.

## Lifecycle and cleanup

1. Lock the project and verify sandbox/provider and cluster ownership.
2. Check Docker, disk, ports, pinned versions and profile prerequisites.
3. Create missing nodes once, with dedicated kubeconfig and recorded node IDs.
   Refuse foreign resources with the same name.
4. Bootstrap CRDs, certificates, sources, gateway and delivery in dependency
   order, with bounded checks. Install mesh components only for full.
5. Resume existing nodes; never replace an unhealthy cluster silently.
6. Reconcile the pinned profile without automatic component upgrades.
7. Register worktrees only when actual Orca identity/checkout exist; recipe
   creation may precede checkout creation.

Use reusable guest modules under runtime/kubernetes/ and verified native-preview
assets. Preserve the original plugin during the pilot. Keep SSH/OMP usable during
durable bootstrap; report starting/ready/failed separately. Validate supervision
rather than relying on a host recipe's background child. Preserve default
kubeconfigs, OMP identity, SSH registration and project naming.

Worktree suspend/destroy never stops or deletes the shared cluster. Cleanup
removes only owned worktree objects, preserving other environments. Never prune
from unreadable Orca inventory. Use a verified deletion hook if available,
otherwise an ownership-aware agent cleanup command.

## Acceptance and completion

| Area | Required evidence |
| --- | --- |
| Compatibility | Real trusted HTTPS, local sources, interoperable controllers |
| First use/reuse | Concurrent requests produce one owned cluster/controller set; setup creates none |
| Application | Real Teck.Monorepo service/dependencies run from current source including dirty changes |
| Isolation | Two worktrees serve different versions through distinct HTTPS hostnames |
| Delivery | Weighted responses, Argo sync preserves weights, failed analysis restores stable |
| Promotion | Kargo promotes matched immutable manifest/image artifacts via local sources |
| Independence | No remote Argo/Kargo endpoints, credentials or GitOps writes |
| Recovery | Sandbox restart preserves node/worktree/OMP identities |
| Cleanup | One environment removed; others/cluster preserved; unverifiable ownership prevents deletion |
| Full | Separate WSL2 compatibility, agent routing, Cilium policy, mTLS and authorization positive/negative tests |

Use TDD for lifecycle/deployment code and explicit live controller tests. Run
repository build/tests/checks after source changes. Never label workspace
results as full-profile/security validation.

Defaults are 8 CPU/16 GiB per project; new enabled VMs use 60g Docker/30g root
storage without resizing existing disks. Measure startup, steady state, concurrent
apps, builds and rollout surges before adjusting. Budget Docker/node storage,
Git/registry retention and controller images. Never globally prune Docker.
Capture versions, node IDs, analysis/source/image receipts and resource pressure;
keep credentials, kubeconfigs and private CA keys out of Git/logs.

The finished pilot requires no manual host CLI setup or remote delivery service.
Document measured limits and remaining profile differences. kind does not prove
production scale, HA or physical-network behavior.

