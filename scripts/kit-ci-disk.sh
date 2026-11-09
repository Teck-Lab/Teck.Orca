#!/usr/bin/env bash
# Never call this from plugin setup or a developer/sandbox workflow.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "${RUNNER_OS:-}" != Linux ]]; then
  echo 'SDK cleanup is restricted to disposable GitHub-hosted Linux runners.' >&2
  exit 1
fi
# Fixed preinstalled SDK locations only; setup-node runs after this step.
# The runner service, Git, Docker and system Python are not in these directories.
sudo rm -rf -- /usr/share/dotnet /usr/local/lib/android /opt/ghc /usr/local/.ghcup /opt/hostedtoolcache
df -h /
available=$(df -B1 --output=avail / | tail -n 1)
if [[ "$available" -lt 34359738368 ]]; then
  echo '::error::Kit builds need 32 GiB free. Select a larger Ubuntu runner if its image no longer has reclaimable SDK space.' >&2
  exit 1
fi
