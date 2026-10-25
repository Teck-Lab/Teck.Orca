# Local Kubernetes profiles

Workspace: one persistent cluster per Orca project, kindnet, no Istio/Cilium,
local Argo CD/Rollouts/Kargo, HTTPS kgateway, Git and image sources. Full: optional
shared WSL2/Linux cluster; disabled until its own compatibility/routing tests pass.
Both consume application deployment/base + deployment/local. There are no remote
delivery controller dependencies or Terraform changes.

Orca packages a checksum-verified snapshot of this subtree. The kind configuration
and component lock are authoritative here; runtime helpers must not invent topology
or upgrade components on restart. Helm artifacts are checked against the lock.
The bootstrap installs controllers in dependency order, certificates from a local
CA, then gateway and source services. Application reconciliation uses local Git.

Local Git uses HTTP Git on the private cluster network and a loopback-only
agent endpoint. The pinned Git image supplies Perl and git-http-backend; the local
adapter serves only apps.git/gitops.git, bounds request sizes and forwards no URLs. It has no GitHub credentials and is not a security boundary between
agents sharing a project. Do not publish its unauthenticated write endpoint to Windows
or another network. The image registry is similarly local to this project VM.

Kargo controllers/webhooks are included. Its user-facing API/UI is disabled until
local authentication/ingress is configured; helpers use the Kubernetes API. Argo CD
uses its generated local admin credential, never a shared default password.

Worktree Applications have local sources, exact namespace destinations and manual
sync for override mode. Promotion mode uses separate Applications/destinations and
matching immutable source/image artifacts. Ignore only Rollouts-owned route weights,
and pass RespectIgnoreDifferences=true in both Application policy and direct sync
operations. The isolated traffic test proved real weighted HTTPS and failed analysis
restoring stable while retaining Degraded desired state.

Security/mesh validation requires the full target. Workspace success does not prove
Cilium policy, STRICT mTLS or Istio authorization. No sidecar substitution is implied.
