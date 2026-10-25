# Local development profiles

This subtree is independent of remote bootstrap/root ApplicationSets. The approved
local design uses one workspace kind cluster per Orca project and an optional full
cluster on a compatible Linux runtime. Terraform is outside this subtree.

Applications own deployment/{base,local,development,staging,prod}. GitOps owns
cluster installation, topology, controller pins and operational overrides. Both
profiles consume the same application local overlay. Do not duplicate app manifests.

Workspace has no Istio or Cilium. Never represent its tests as mesh/policy evidence.
Full requires independent Cilium/ambient and agent-networking validation before use.
Do not downgrade full automatically or substitute sidecars.

Platform component versions/checksums are pinned in components.lock.json; they
are bootstrap dependencies, not application versions managed by Kargo. Local app
images/manifests must be paired immutably and promoted only through local sources.
Dynamic worktree Applications/AppProjects are created by the Orca helper and are
an explicit exception to the remote projects/ ApplicationSet convention. Scope
them to exact local source repositories and worktree namespaces.

Never import remote delivery credentials, human Git credentials, production
secrets, initialized runtime state, private CA keys or kubeconfigs here.
