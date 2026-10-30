# Kubernetes tooling validation - 2026-10-25

kind 0.33.0 and kubectl 1.37.1 are pinned in the shared workload lock for
Linux amd64 and arm64, with official SHA-256 checksums. The workload archive,
installation checks, native SSH preview and optional standalone image include
both tools. No startup hook creates a cluster.

Sources:

- https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0
- https://kind.sigs.k8s.io/docs/user/quick-start/
- https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/

The default node image for kind 0.33.0 uses Kubernetes 1.37.0; kubectl 1.37.1
matches its minor version. Projects targeting another Kubernetes version should
choose a supported node image and a compatible kubectl client.

## Live installation

Downloaded the official Linux amd64 binaries once on Windows, verified their
pinned hashes, then staged the same installer and lock used by future builds
in each running owned VM. Installation verified both hashes and client versions
before replacing either executable. The tools run as the agent user on PATH.

| Sandbox | Provider ID | kind | kubectl | Docker Engine |
| --- | --- | --- | --- | --- |
| teck-orca-p-bc02e0548944 | 0af8fa44-d946-41ad-84c3-cec655a7c5a5 | 0.33.0 | 1.37.1 | 29.7.2 |
| teck-orca-ssh-bc02e0548944 | 52096697-8d49-4331-b1a0-fca580439e5f | 0.33.0 | 1.37.1 | 29.7.2 |

Both provider identities were checked before installation. Before/after checks
found no kind node containers and no default kubeconfig; Docker stayed available.
No cluster was created, project files changed, or sandbox restarted. Removed
only the unique guest staging directory. Detailed receipts are under
`.artifacts/kubernetes-tools/` (ignored by Git).

## Packages and portable checks

- Original plugin 0.5.12: build, all 82 tests and package check passed.
- Native SSH preview 0.1.3: build, all 20 tests and package check passed.
- Four installer tests cover architecture URLs/pins, repeated installation,
  checksum/version failure preserving existing tools, and rejecting invalid pins.
- Installed checksum-verified immutable releases:
  - Original: `3a6c6bdb997018b34b42da87412f50ef73834ae64ce086d5337e3af24cd2781c`
  - Preview: `64b781f51db473de457828e0327be509db8401ff51734a20c08fccc1c9c489be`

Refresh the applicable plugin through Orca's GUI to select the new runtime for
future sandbox creation. Existing VMs already have the tools installed.

The workload policy now declares Kubernetes download/registry entry hosts for
future VMs. This installation did not change running VM network policies or test
registry redirects. Actual node image pulls, cluster creation, application
deployment, arm64 execution and full image builds were not exercised here.
