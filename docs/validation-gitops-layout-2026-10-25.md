# GitOps layout correction - 2026-10-25

The original standalone local/ tree was rejected because it bypassed the repo's
layout and duplicated security configuration. It has been removed.

- apps/local/{network,platform,security,system} use ordinary Kustomize/Helm app entry points and config.yaml metadata.
- cluster-resources/local owns prerequisite namespaces/RBAC; bootstrap/local owns initial setup, KIND profiles and artifact pins.
- projects/local reuses the existing category AppProject/ApplicationSet templates, patched to the private local Git source and local cluster. Remote wildcard generators explicitly exclude local.
- Bootstrap uses the canonical app declarations once, then Argo CD owns platform reconciliation. It does not repeatedly run Helm against Argo-managed resources. The private generated Git mirror carries verified cached chart/CRD artifacts for the same app entry points.
- Keycloak is under security. Its local import is rendered from the existing in-cluster development realm and gateway client YAML, with local name/redirect/secret overrides. The independent realm.json copy is gone.
- Kargo uses a normal ClusterPromotionTask alongside its controller overlay. Per-worktree promotion Kustomizations are nested under apps/local/teck-cloud/teck-cloud-core/worktrees.

Portable tests cover reference closure, duplicate Kustomize resource filenames,
remote/local generator isolation, declaration/artifact version coherence, and
canonical Keycloak source reuse. The scoped PR snapshot passes the root and native
build/test/check suites; final counts and live workload/restart results follow.
A fresh isolated sandbox bootstrapped nine Synced/Healthy ApplicationSet-owned
platform Applications. No active project VM, remote controller or Terraform was
used for the layout test. Full Cilium/ambient and current-Monorepo gateway migration
remain outside this validation.
