# Teck project sandbox

This Docker Sandbox belongs to one Orca project. Keep changes in the selected
worktree. Use Orca child worktrees and one editor per checkout. OMP native
helpers remain subordinate to their parent assignment. Credentials are managed
by the Docker Sandbox proxy; never print, copy or try to recover real keys.

Use `agent-browser` for browser work when the browser kit is installed. Use a
task-specific browser session and close it after verification. Chromium is
headless and trusts the injected sandbox CA; keep TLS verification enabled.

KIND uses the Docker daemon inside this project VM. Create clusters on demand
with unique names and explicit kubeconfigs; remove only your own test cluster.
K3s Testcontainers supplies its own K3s image. The Kubernetes kit provides the
device prerequisites for both harnesses, not a permanently running K3s service.
