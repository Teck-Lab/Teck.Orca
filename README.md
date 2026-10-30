# Teck.Orca

One plugin provides one persistent Docker Sandbox per Orca project, shared by its worktrees, with OMP and optional local KIND. **Teck OMP Project** in the GUI **Run on** picker creates or reuses the VM. Orca connects over Docker's native SSH and manages its guest daemon.

## Setup and GUI workflow

Requires Orca 1.4.245+, host Node 22+, Docker Sandboxes 0.48+, OpenSSH, a Docker login and configured Docker-managed OmniRoute/MCPHub/GitHub service credentials. Tokens stay in Docker's credential store.

```powershell
sbx setup ssh
npm run build
npm test
npm run check
npm run setup
```

Install or refresh **plugin/** in Orca Settings > Plugins and approve the updated fingerprint. It is the only installable package; the repository root contains large runtime binaries. Setup installs the pinned native SSH runtime and older-sandbox recovery runtime, creating no project VM, connection or workspace.

Create a workspace from the local project, enable Per-Workspace Environments if required by Orca, and choose **Teck OMP Project** in **Run on**. Orca creates the sandbox only if absent, configures OMP, clones once, registers native SSH and creates the linked worktree. Choose that same recipe again for concurrent workspaces; they share the VM and retain independent sessions/checkouts. No pre-provisioning command or manual SSH-host registration is needed.

## Updating from either previous plugin

The main plugin keeps its identity, teck-lab.teck-sbx-recipes, now version 0.6.0. Native SSH is integrated into it; native-ssh/ is internal source and has no separate plugin/package/setup.

If **Teck OMP Native SSH Preview** is installed, remove that old plugin entry after refreshing plugin/. Keep its VM, saved workspaces and ownership records. The native recipe ID, sandbox names, ~/.teck-orca-native-ssh ownership/release roots and native-ssh/projects.json configuration are retained. New recipe runs reuse the existing native VM; old workspaces keep their immutable snapshots.

Older bundled-daemon project/feature sandboxes retain their data and **Teck: Reconnect sandboxes** recovery command. Their compatibility recipes remain available to saved snapshots and are no longer offered for new workspaces. No checkout/profile/data migration is performed. On Windows setup retains the older project transport's hidden login companion; native SSH connections use Orca's own relay and daemon management.

## Lifetime and resources

Native VMs are named teck-orca-ssh-<project-hash>. Creation is serialized and pinned to verified ownership/provider identity. Suspend and worktree deletion retain the shared VM. Resume never substitutes a missing/replaced VM; a new workspace create can explicitly replace a manually deleted VM and archive its old metadata. Archived records do not recover deleted files or conversations.

Defaults are 8 CPU / 16g memory; native-ssh/projects.json configures projects. Existing VM sizes remain unchanged. The repository is cloned at /home/agent/project; local uncommitted changes and local-only commits are not copied. OMP startup restores recorded project/worktree/pane sessions at an idle prompt; stopped processes and interrupted tool turns are not replayed.

The workload permits HTTPS to quay.io and *.quay.io, plus the existing SDK/browser download hosts and Docker default allowlist. Proxy-managed service credentials are used; host personal credential helpers are not copied. See [native runtime details](native-ssh/README.md).

## Runtime and validation

The workload retains OMP 18.14.0, Bun 1.4.4, Node/npm, .NET SDK 10.0.401, TypeScript 5.9.3, C++/Python/pip/uv/Go/Java, Docker Engine/Compose/Buildx, Git/Git LFS/GPG/GitHub CLI, Next.js DevTools MCP, Biome, 15 language servers, Chromium, Playwright and agent-browser. Linux amd64 includes pinned Google Chrome; ARM uses native Chromium through Chrome-compatible commands. Orca manages the native SSH guest server matching the desktop; the retained compatibility image pins Orca 1.4.245 and Node 24.22.1. No initialized runtime identity is baked into the image.

Root build/check cover the single plugin and both integrity-pinned runtime stores. Root npm test includes native SSH/provider tests as well as legacy recovery. See [consolidation validation](docs/validation-unified-plugin-2026-10-30.md). Historical smoke scripts below exercise their named legacy paths; provider/GUI acceptance is recorded separately.

## Feature workflow and OMP agents

Every implementation/fix remains GitHub-tracked. After read-only diagnosis,
default to one issue containing the approach, acceptance criteria and validation.
Use execution sub-issues only for distinct deliverables with separate acceptance
criteria and a concrete benefit from ownership, parallelism, dependencies, or
tracking blocked and ready work independently. Risk, file count and helper/review
sessions alone do not require sub-issues. See the canonical
[issue decision rule](runtime/omp/skills/github-execution-planning/references/issue-structure.md).

The lead coordinates and an OMP executor implements in a visible parent-linked
Orca child worktree. In a single-issue run both can link the same GitHub issue;
Orca worktree hierarchy does not require GitHub issue hierarchy. The single-issue
path has one independent final review after integration and combined checks.
A feature with execution sub-issues keeps child reviews before integration plus
the final integrated review. Both paths verify the exact reviewed snapshot and
use one canonical PR through GitHub MCP. Explicit narrower user instructions
apply; merging still requires separate authorization. See
[review gates](runtime/omp/skills/orca-feature-workflow/references/review-gates.md).

A whole-task blocker stays on the existing issue with evidence, owner and resume
condition. Split blocked/ready deliverables only when independent tracking is
useful. A prerequisite outside the feature can remain an external blocking issue;
parentage and dependency are separate relationships. Temporary tool/test failures
are diagnosed before creating additional work.

Context loading is role- and stage-specific: the compact shared RULES.md routes
to orca-feature-workflow; leads load planning, worker, review and publication
guidance at their action gates. Assigned executors/reviewers consume the existing
Dispatch rather than repeating coordinator planning. Full official Orca guides
remain bundled; placement/recovery references, label catalogs and PR-stack
mechanics load only when needed.

The existing OMP modelRoles mappings remain in place. OMP chooses its internal task agents for scouting and helpers; those helpers do not replace sidebar-visible implementation workers. Terminal workers are the intended interface. The sandbox bundles `orca` and `orca-ide`, routed to Orca's managed guest runtime and user-data directory.

After accepting a settled worker report, the coordinator releases that worker's owned terminal through Orca, preserving its child worktree and archived output. Immediate follow-up work can reuse the terminal; keeping it alive otherwise requires an explicit user request. Keeping worktrees or forbidding workspace deletion does not request terminal retention. This policy is in Teck's shared OMP rules and its own workflow skills; the official Orca skill snapshots remain unchanged. Existing feature sandboxes retain their original installed rules; refresh the plugin and create a fresh feature to use the latest workflow rules. The reconnect command does not change those rules.

Issue classification and agent status follow the repository's live types and
label conventions, with [Teck.Monorepo guidance](runtime/omp/skills/github-execution-planning/references/issue-classification.md)
for technology, security severity, intake, execution and human PR review. Closed
issues stay outside the active queue; human cleanup does not mean successful
completion and does not trigger historical relabeling or reopening.

The [complete Teck.Monorepo label catalog](runtime/omp/skills/github-execution-planning/references/teck-monorepo-labels.json)
supplies names and descriptions when MCP cannot list all labels. Agents verify
selected labels through live MCP lookups before adding them. To refresh the dated
snapshot from the host, run `npm run bundle:labels`, then build and setup; the
refresh reads GitHub through the host's existing gh login and changes no labels.
Ordinary builds stay offline. New feature sandboxes receive the updated catalog.

Refresh the packaged CLI/orchestration guides deliberately with `npm run bundle:skills`, then build and setup. Normal builds use the checked-in snapshots and do not need a running Orca instance. Live execution-host guides take precedence when available.

OMP runs in sandbox-backed Orca terminals. Orca's managed SSH daemon supplies filesystem, Git, terminal and orchestration services. This plugin does not translate Paseo's OMP JSONL RPC into Orca's structured UI protocol.

Orca's experimental native chat supports OMP through `omp acp`. The native SSH recipe uses a supported remote-runtime host type, but terminal OMP is the validated integration target; native chat and visual GUI acceptance are separate checks.

Orca workers and OMP native `task` subagents have different lifecycles. Orca-created workers can have their own parent-linked worktrees, sessions and GUI cards. OMP native subagents remain inside their parent's OMP session; they do not automatically create Orca cards or worktrees. Orca has hooks/transcript readers for some subagent activity, but this plugin does not promise separate live structured panes for those children. The bundled Orca skills explain when to create an Orca worker for visibility.

## Validation

See [dedicated review validation](docs/validation-review-gates-2026-10-11.md), [Bun and delivery policy validation](docs/validation-bun-and-delivery-2026-10-11.md), [worker cleanup validation](docs/validation-worker-cleanup-2026-10-11.md), [daemon validation](docs/validation-daemon-2026-10-11.md), [earlier launcher validation](docs/validation-2026-10-11.md) and [earlier Windows validation](docs/validation-2026-10-10.md) for completed checks and remaining GUI/provider acceptance checks.

`npm test` checks feature isolation within a project, repeat-create reuse, concurrent lifecycle locks, cleanup with child worktrees, retained-feature cleanup, ownership safeguards, PATH preservation, release integrity, and real host-shell invocation with UTF-8 JSON stdin. These tests mock provisioning and do not start a VM. `npm run smoke` explicitly creates two disposable feature sandboxes, validates loopback pairing, linked Orca worktrees, OMP terminals, isolation and installed skills, then removes them. Setting `TECK_ORCA_SMOKE_WORKERS=1` additionally launches a read-only OMP execution task from a real coordinator terminal and makes a provider request; it never creates GitHub records.

`npm run smoke:cleanup` creates one disposable feature and sends the original controlled-test prompt to a real OMP coordinator. It makes model requests, waits for two read-only OMP workers, verifies both worker terminals close while both linked child worktrees and the coordinator remain, then removes only its generated test sandbox. The prompt contains no extra cleanup instruction. The test also verifies all official Orca guides against their original snapshot hashes.

`npm run smoke:bun` creates one disposable feature, checks agent ownership of Bun's cache, installs a small registry dependency from a cold cache, and repeats installation with `--frozen-lockfile` using default and custom temporary directories. It removes only its generated test sandbox. Workload installation and recipe provisioning assign Bun's cache to `agent`; provisioning checks actual cache and temporary-directory writes before returning a ready workspace. Changing `TMPDIR` alone does not fix a root-owned Bun cache.

`npm run smoke:restart` creates one disposable feature with registered parent
and child worktrees, writes an uncommitted marker, actually stops its VM, then
invokes the resume recipe. An isolated host-side client verifies the new pairing
connection; the test checks preserved worktree IDs, parent linkage, branches and
the marker before removing only its generated VM. It does not manipulate the
desktop or test automatic UI reconnection.

Set `TECK_ORCA_SMOKE_RECONNECT_BRIDGE=1` to verify recovery using the original
saved environment through the production bridge, including VM wake on its
connection attempt. On Windows, also set `TECK_ORCA_SMOKE_PLUGIN_COMMAND=1` to
execute the command through the installed Orca plugin worker against an isolated
profile. These probes never run the command against the user's desktop profile.

`npm run smoke:omp-resume` creates one disposable feature and two real OMP
terminals in the same managed worktree. It makes two small read-only model
requests, stops/starts the VM and tests restored interactive shells using those
original pane identities. Both must reopen their own session and model. This
tests the guest fallback without clicking desktop Retry; it removes only its
generated sandbox.

`npm run smoke:review` creates one disposable feature and a synthetic local
repository. Three real advisor-model review Dispatches evaluate a defective
child with weak green tests, its corrected snapshot, and the integrated parent.
It requires explicit request-changes/approve/approve verdicts, unchanged reviewed
checkouts and released reviewer terminals, then removes only the generated test
sandbox. It makes model requests but creates no GitHub records.

```powershell
npm run doctor
orca vm recipe doctor teck-native-ssh-project --repo-path . --json
```

The npm doctor checks local prerequisites; the Orca doctor checks recipe wiring without provisioning. Orca's static doctor warns that inline `node` commands are not repository-relative script paths. That warning is expected for this portable plugin launcher: runtime integrity is checked by the launcher and its shell execution is tested directly. Live sandbox, remote OMP model requests and GUI behavior must be reported separately from those checks. Never run a live doctor against a project with valuable sandbox state: its destroy step can remove an otherwise unused project sandbox.

## Builder storage and Windows diagnostics

The shared `sbx-kit-builder` has its own `/var/lib/docker` volume. Free space on C: does not describe free space in this volume. Check it with `sbx exec -u root sbx-kit-builder df -B1 /var/lib/docker` and `sbx exec -u root sbx-kit-builder docker system df`.

Docker's installed builder kit defaults to a `10g` engine-store volume, which is too small for this workload's build, flattening and export stages. Before first project provisioning, Teck creates the shared build-only sandbox with `volumeSize=40g` if it is absent, then starts it detached so short exec sessions cannot auto-stop an active build. Creation is serialized across projects. Existing builders must have at least 32 GiB total capacity and 12 GiB available headroom; setup and project creation check this before starting a workload build. Project sandbox CPU/RAM limits do not change builder disk capacity.

To replace an undersized or full builder, explicitly run `powershell.exe -NoProfile -File scripts/recreate-builder.ps1` when no kit build is active. This recreates only `sbx-kit-builder` with `40g` and discards its shared build cache. Existing project sandboxes are retained. Setup never creates a builder; the recipe creates one only if absent, and neither automatically deletes or prunes an existing builder. Docker requires recreation for an already-formatted kit volume. See the [builder capacity validation](docs/validation-builder-capacity-2026-10-18.md).

On Windows, inspect `AppData/Local/DockerSandboxes/sandboxes/state/sandboxd/daemon.log` for the full cause of a generic container-start error. An EROFS `failed to initialize diskbuf` error can report ENOSPC for a failed temporary-file creation, as described by the [upstream containerd fix](https://github.com/containerd/containerd/commit/1a6bd7020a). `node scripts/diagnose-erofs.mjs` compares the converter with explicit temporary directories using tiny disposable files under `.artifacts`.

During validation on 2026-10-10, expanding the builder to 20g and creating `C:\tmp` did not clear this error. Restarting the daemon with `$env:TMPDIR = $env:TEMP` did, and the full disposable lifecycle test then passed. Restarting can interrupt active sandbox sessions; schedule it deliberately. Set the user environment variable TMPDIR to an existing Windows temp directory for future launches. The Node lifecycle supplies a process-local default on Windows when absent; it cannot change a daemon that is already running.

## Provenance

Derived from [mattjohnson/orca-sbx-recipes](https://github.com/mattjohnson/orca-sbx-recipes), upstream commit `40f210f3f0d390cd66de7923de2d773ea82d9c96`, retaining its MIT license. Runtime assets were copied from the local Teck.Paseo checkout on 2026-10-10 and adapted without modifying that repository. Files under `docs/upstream` describe the original POSIX implementation and are historical references, not current setup instructions.

## Native SSH and local Kubernetes

The integrated [native SSH runtime](native-ssh/README.md) preserves the Run on GUI
workflow and lets Orca manage its guest daemon. It supports a shared project KIND
cluster with isolated worktree deployments and optional application operators. See
[the profile plan](docs/plan-local-kubernetes-delivery.md) and
[isolated validation](docs/validation-local-kubernetes-2026-10-25.md).

## Coordinated OMP goals

Existing OMP model roles are retained. The coordinator owns the authorized
GitHub milestone/delivery goal, canonical issue plan and final acceptance. Orca
Tasks/Dispatches provide visible workers with independent sessions/checkouts.
Canonical execution issues/sub-issues retain tracked Orca executors with bounded
goals. Every role may also use native OMP task/eval helpers: planner, researcher,
executor, reviewer and coordinator. OMP owns those helpers' lifecycle; their
parent owns scope, evidence and acceptance. Native helpers do not each need an
Orca Dispatch or GitHub issue.

Apply planning and dependency waves recursively inside sub-issues. Create
sub-sub-issues for independently trackable deliverables, then start all ready
branches within configured capacity. For 1 -> {2,3} -> 4, accept 1 before starting
2 and 3 in parallel; start 4 when its actual prerequisites are accepted. Direct
coordinator tool calls remain scoped; native delegation follows the parent brief
and is not an OS isolation boundary. Independent deliverable/integration reviews
replace periodic WATCHDOG loops and per-helper full reviews. See the
[runtime workflow](runtime/omp/skills/orca-feature-workflow/references/goals-and-milestones.md).

The unified plugin 0.6.0 uses the Orca desktop-managed guest daemon over native
SSH. Compatibility images retain Orca 1.4.245 and Node 24.22.1. All image paths
pin OMP 18.14.0 and Bun 1.4.4. See the
[release changes and validation](docs/validation-orca-omp-2026-10-30.md).

## Planner-owned issue decomposition

The orchestrator can assign a verified Orca planner on the existing slow model
role to create/reuse execution children and real dependencies. One writer owns
the canonical plan at a time; the orchestrator checks returned IDs and evidence
before dispatch. Researchers/native planning helpers remain read-only. A missed
blocker triggers reassessment of only the affected scope while unrelated work
continues. See the [planner validation](docs/validation-planner-decomposition-2026-10-30.md)
and the standalone [issue-flow diagram](issue-flow.html).

## YAML scalar hardening

The vendored YAML 2.9.1 package includes reproducible linear-time scalar patches
for the four CodeQL ReDoS findings. `npm run check` verifies all vendor hashes
offline; `npm run vendor:yaml` is explicit dependency maintenance. See the
[security validation](docs/validation-yaml-security-2026-10-30.md).
