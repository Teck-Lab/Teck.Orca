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
Bun, .NET, Git/LFS, Docker Engine/Compose, kind 0.33.0, kubectl 1.37.1,
development tools and language servers
are available. Docker Engine runs project/test containers; Docker Sandboxes
manages this VM and its SSH transport.

When /etc/teck-orca/kubernetes.json exists, Kubernetes starts automatically in
one persistent kind cluster shared by this project's worktrees. Use teck-kube
status, deploy, promote, cleanup and kubectl; the helper always supplies its own
kubeconfig. Deploy/promote run from the real Orca worktree terminal. Separate
worktrees get separate namespaces, images and HTTPS hostnames. Application
manifests belong in deployment/; GitOps apps/local/ and bootstrap/local/ own the platform. Never delete
the shared cluster when finishing one task. Run teck-kube cleanup before removing
that workspace, or use cleanup --worktree with its exact saved Orca identity.

The workspace profile uses kindnet with no Istio or Cilium. It supports local
Argo CD, Rollouts/Gateway API and Kargo tests; success does not validate production
mTLS or network authorization. The optional full WSL2/Linux profile is disabled
until separately validated. Without the managed configuration, kind remains an
on-demand tool: use an explicit task kubeconfig/name and clean up only your own
cluster. Never silently replace an owned cluster after a configuration change.
