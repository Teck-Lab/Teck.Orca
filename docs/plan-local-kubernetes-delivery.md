# Local application testing with KIND

Use the official KIND workflow: Docker build -> kind load docker-image -> render the existing local Kustomize overlay -> kubectl apply -> readiness and real tests. No Argo CD, Kargo, local Git service, registry or OCI delivery pipeline is required.

One persistent single-node KIND cluster belongs to each opted-in Orca project. Each worktree gets its own namespace, generated credentials and PostgreSQL/dependency resources. Keep the existing native SSH GUI Run on recipe/startup recovery and dedicated kubeconfig. Never delete a shared cluster on workspace cleanup; verify namespace ownership and UID before removal.

Bootstrap defaults to KIND networking/storage only. Optional pinned add-ons are CNPG, Rollouts and Gateway API/kgateway/TLS, enabled explicitly or by deployment/local/builds.json. Install shared controllers once and resume them. Platform definitions remain in Teck.GitOps apps/local categories, cluster-resources/local and bootstrap/local. Source repos own deployment/base and environment overlays; no separate local application manifest tree is introduced.

The agent can use kubectl directly or the teck-kube deploy convenience wrapper. The wrapper builds from current dirty source, assigns an image-content tag, loads it into KIND, records rendered manifests locally, validates resource scope/ownership, applies in phases and waits for actual readiness and tests. It creates no synthetic Git commits. Standard kubectl handles one-off debugging and test Jobs.

Validation must use a separate recorded Docker Sandbox. Prove bare startup, optional CNPG, connectivity/migrations against operator-managed PostgreSQL, concurrent worktree isolation, image updates, test failure reporting, cleanup and cold restart persistence. Keep real project sandboxes untouched. Publish source and evidence through the existing GitHub App MCP PRs.

Existing draft delivery clusters require explicit migration and are retained. Full Cilium/ambient, HA/backups and production GitOps promotion are outside workspace acceptance. The existing Gateway.Public pilot remains blocked on adaptation to current Monorepo gateways.
