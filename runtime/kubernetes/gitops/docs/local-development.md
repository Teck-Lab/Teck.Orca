# Local application development

The workspace uses the official KIND build/load/apply workflow. Orca starts one persistent, single-node KIND cluster per project. Base startup installs no delivery controllers, registry or Git server. Worktrees deploy into separate namespaces. No Argo CD, Kargo, local OCI release pipeline or Terraform is required.

Definitions follow apps/local/{category}/{application}, cluster-resources/local and bootstrap/local. Remote ApplicationSets exclude apps/local. There is no local ApplicationSet: agents apply local resources with kubectl. Local component versions/checksums are pinned in bootstrap/local/components.lock.json; the CNPG chart matches the existing development operator declaration (0.28.0 / operator 1.29.0). KIND uses Kubernetes 1.35.8, within that operator's documented version range.

Optional shared add-ons:
- cnpg: CloudNativePG operator only; each worktree owns its PostgreSQL Cluster.
- rollouts: Argo Rollouts controller and required RBAC, when manifests contain Rollout/AnalysisTemplate.
- gateway: Gateway API, kgateway and local TLS certificates, when testing HTTPRoute/HTTPS.

The sandbox command teck-kube addon <name> installs a pinned add-on. The deployment/local/builds.json addons list can request the same add-ons. They remain shared and resume on cluster restart; worktree cleanup does not remove controllers. Existing releases with a different pin are rejected rather than upgraded automatically. Keycloak remains an optional worktree resource under apps/local/security/keycloak and reuses canonical realm/client definitions.

Application repos own deployment/base and environment overlays. Build with Docker, load content-based image tags with kind load docker-image, render deployment/local, validate against the API and kubectl apply. teck-kube deploy is a convenience for these same operations, readiness and declared initial analyses. It creates no synthetic Git history or delivery destination. Inspect rendered manifests and results in the owned cluster worktree folder. Standard kubectl commands use the project's dedicated kubeconfig through teck-kube kubectl; the default kubeconfig is not changed.

Use CNPG Cluster resources plus application connectivity/migration tests or Kubernetes Jobs. Apply success is not a test result. Test Job failure fails deployment. Cleanup uses the recorded namespace UID and preserves other worktrees/databases. A shared namespace is isolation of resources, not a security boundary for privileged agents or cluster-wide operators.

Local storage and single-node testing validate application integration, not production HA, backups, Cilium or Istio ambient. GitOps promotion/synchronization belongs in the full environment. Old draft delivery clusters are retained and require explicit migration; startup never deletes their data.

The current application pilot has customer and admin web gateways. Local Keycloak renders web-customer-gateway and web-admin-gateway from the canonical client policy, with independent generated values in gateway-web-auth (customer-client-secret/admin-client-secret). Existing persisted realms from the public-gateway pilot require an explicit migration or an intentionally recreated worktree environment; realm import does not overwrite an existing realm.
