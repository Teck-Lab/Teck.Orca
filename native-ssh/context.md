# Teck project sandbox — native Orca SSH preview

This persistent Docker Sandbox belongs to one Orca project. Orca manages its
own daemon through the registered SSH host. Preserve ORCA_* environment values
and CLI routing from the terminal. Do not start or pair another Orca daemon.

Run orchestration, managed worktree operations and worker launches with the
Orca-provided CLI inside this sandbox. A worktree is a checkout within this
project sandbox, not another VM. Keep one editing owner per checkout; use the
bundled orca-feature-workflow and the live Orca CLI/orchestration guides.

OMP is installed as `omp`, with the shared Teck model roles, GitHub MCP policy,
TDD and review guidance. Use the GitHub MCP for remote writes. Credentials are
proxy-managed by Docker Sandboxes; never print, copy or persist real values.

Use agent-browser and the installed Chromium for sandbox browser automation.
Keep TLS validation enabled and use a separate browser session per task. Node,
Bun, .NET, Git/LFS, Docker Engine/Compose, kind 0.33.0, kubectl 1.35.8,
development tools and language servers
are available. Docker Engine runs project/test containers; Docker Sandboxes
manages this VM and its SSH transport.

When /etc/teck-orca/kubernetes.json exists, one persistent KIND cluster starts for this project. Default startup has no Argo CD, Kargo, Git service or registry. Use the official Docker build -> kind load docker-image -> kubectl apply workflow. teck-kube deploy wraps that sequence for deployment/local/builds.json; it requires the current Orca worktree terminal and records image/source identities, rendered manifests and readiness. Use teck-kube addon cnpg|rollouts|gateway only when required. Each worktree gets a namespace and its own databases/dependencies.

Use teck-kube kubectl for direct commands with the dedicated kubeconfig; do not change the default context. Run real connectivity/migration/test Jobs and inspect failures, rather than treating apply success as test success. teck-kube cleanup deletes only the recorded worktree namespace with UID checks and keeps the shared cluster/operators.

Application manifests belong in deployment/; platform definitions remain apps/local/ and bootstrap/local/ in Teck.GitOps. The workspace uses kindnet without Istio/Cilium; it does not validate production mesh, HA or GitOps delivery. Never silently replace an owned cluster after topology/pin changes. Existing draft delivery clusters require explicit migration.
