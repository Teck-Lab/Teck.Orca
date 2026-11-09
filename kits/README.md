# Docker Sandboxes v3 components

The published Teck environment is one workload plus eight mixins. It still
creates one persistent Docker Sandbox per Orca project. Worktrees and additional
OMP sessions reuse that sandbox through its saved SSH target.

| Component | Owns |
| --- | --- |
| `base` | Docker's current shell/Docker base image, shared OS libraries, base network policy |
| `omp` | Pinned OMP and Bun runtimes |
| `devtools` | .NET, language servers and debuggers |
| `browser` | Chromium, Chrome and agent-browser |
| `kubernetes` | KIND, kubectl and shared KIND/K3s device prerequisites |
| `workflow` | OMP models, roles, skills, worktree policy and launch helpers |
| `office` | Agent Office observer and optional MCP binding |
| `omniroute` | Proxy-managed model credential and network access |
| `mcphub` | Proxy-managed MCPHub and Hindsight credentials and network access |

Tool mixins contain selected runtime files, not another operating system or
package database. OS dependencies belong in `base`. Static tools install at
image build time. Lifecycle hooks initialize writable state and restore device
prerequisites; the host plugin supplies project identity and connection settings.
No model tokens, user profiles or conversations enter a build context.

`scripts/kit-source.mjs` stages isolated contexts from these definitions and
canonical `runtime/` assets. It records source and staged-content hashes. Kit
dependencies use `provides` and `requires`; list order is not an override policy.
The release pipeline audits files on both architectures before composing a set.

The set descriptor and `kit-release.json` are generated from real OCI build
receipts. They pin every component and the final set by digest. New provisioning
verifies the final set's exact GitHub Actions signing identity before creation.
Existing sandboxes retain their original image and ownership record.

There is no committed placeholder release lock. The initial catalogue remains
empty until a real signed release has passed isolated sandbox validation and its
portable plugin has been committed. See [release procedure](../docs/release-kits.md)
and [current validation](../docs/validation-v3-kits-2026-11-09.md).
