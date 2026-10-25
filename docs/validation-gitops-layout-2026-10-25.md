# GitOps layout validation � 2026-10-25

The local platform follows the existing repository hierarchy:

- apps/local/{network,platform,security,system}: Kustomize/Helm app entry points and config.yaml metadata.
- cluster-resources/local: namespaces and bootstrap RBAC.
- bootstrap/local: KIND profiles, initial bootstrap and verified component pins.
- projects/local: the existing category AppProject/ApplicationSet templates adapted for the isolated cluster.

Remote wildcard generators exclude apps/local. Bootstrap installs prerequisites once; Argo CD then owns platform reconciliation. Reconnect waits for the newly seeded source revision rather than accepting stale Healthy status.

Keycloak is apps/local/security/keycloak, rendered from the existing in-cluster development realm and client YAML. Local name, redirect hostname and generated secret are overrides. Worktree isolation remains intentional; there is no parallel dependencies tree or copied realm.json.

Kargo's shared ClusterPromotionTask is apps/local/system/kargo/teck-cloud. Generated worktree promotion overlays live below apps/local/teck-cloud/teck-cloud-core/worktrees.

Portable verification: canonical Kustomize reference closure, duplicate resource paths, remote/local ApplicationSet isolation, artifact/declaration pins, source realm/client reuse, Kargo task output scoping, and refreshed Argo source revisions. The companion scoped Orca PR passes root build/test/check (122 tests) and native build/test/check (21 tests); the broader preserved working checkout passes 123 root tests.

Live validation uses only an owned disposable sandbox, project isolated-kubernetes-layout-probe. Nine category ApplicationSet-owned platform Applications reached Synced/Healthy. A synthetic two-worktree HTTP application exercises real Keycloak, Rollouts/Gateway API and Kargo controllers. It does not establish compatibility with the latest Monorepo gateways.

Full Cilium/Istio ambient remains disabled. The Monorepo pilot still needs adaptation after Gateway.Public was retired on main. No Terraform or remote delivery rollout is part of this change.

Final live result: PASS. Two isolated worktrees served alpha/beta through trusted HTTPS. The canonical Keycloak client obtained a real client-credentials token. Kargo's shared task promoted the recorded immutable alpha release into its separate namespace and completed verification. A dirty update served alpha-dirty only in iteration; promotion retained alpha. Cleaning beta preserved alpha and the shared platform.

Cold VM stop/start: PASS through the installed interactive-shell startup hook, without a manual cluster ensure. The boot ID changed; both KIND node IDs, six namespace/Application/Secret UIDs and the iteration image digest were retained. Iteration and promotion HTTPS still served their distinct versions. All nine platform Applications remained Synced/Healthy. The disposable sandbox was removed after validation; existing project sandbox identities were preserved.
