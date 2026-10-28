# Teck.Orca

One persistent Docker Sandbox per Orca project, shared by all of that project's features and worktrees. Orca creates it when you first select **Teck OMP Project** for a workspace and reuses it thereafter. OMP and a full Orca daemon run inside it. The desktop connects through Docker's native SSH; connection traffic wakes a stopped sandbox and starts its existing daemon.

## Setup

Requires Orca 1.4.229 or newer, host Node.js 22 or newer, Docker Sandboxes `sbx` 0.48 or newer, an active Docker login, and OpenSSH. Configure Docker-managed OmniRoute and MCPHub service credentials; private repositories also need GitHub service authentication. Tokens stay in Docker's credential store.

```powershell
sbx setup ssh
npm run build
npm test
npm run check
npm run setup
```

Setup installs the pinned runtime and, on Windows, a hidden per-user login companion at `%APPDATA%/Microsoft/Windows/Start Menu/Programs/Startup/Teck.Orca.ProjectSSH.vbs`. It starts the companion immediately and creates no sandbox, connection or workspace. No administrator task is needed. Other platforms need a user login manager to launch the portable supervisor for automatic recovery; Orca's recipe starts the transport for the current desktop session.

Enable **Per-Workspace Environments (Cloud VM)** in Orca's Experimental settings. Create a workspace in your project and choose **Teck OMP Project** in **Run on**. On first use Orca invokes the recipe to create the project's sandbox, pairs its daemon and creates the requested worktree. Later workspaces selecting that recipe reuse the same project sandbox, clone and daemon. Children created within that runtime also use it. Installation, plugin activation and the informational `npm run project` command never provision a sandbox.

Install or refresh the **`plugin/` subfolder** in Orca Settings > Plugins and approve the updated fingerprint. The repository root contains binaries and exceeds the plugin size limit. The v0.5.4 plugin offers the project recipe and retains recovery support for older feature records. There is no separate pre-provisioning command or pre-created project connection.

## Lifetime and restart recovery

Sandbox names (`teck-orca-p-<hash>`) derive solely from Orca's durable project ID. Another feature or worktree never allocates another sandbox for that project. Ownership records under `~/.teck-orca/projects/` also record Docker's sandbox ID, the clone URL and the local connection port. Setup is serialized. Unowned or replaced sandboxes are refused. A stopped sandbox is reused and woken normally.

After deliberately deleting a sandbox, create a new workspace with **Teck OMP Project** to start fresh. That create operation archives stale ownership metadata under `~/.teck-orca/projects/retired/` and provisions a new clone and runtime. Old workspaces cannot resume into its new identity. Reconnect, startup recovery and resume never recreate a missing sandbox; their errors direct you to restore the old sandbox or create a new workspace. Archived metadata does not contain the deleted sandbox's files or conversations.

The repository is cloned onto the VM's native disk at `/home/agent/project`. Push local work before using it remotely: host uncommitted changes and local-only commits are not copied. Worktree sleep is a no-op and the recipe sets `destroy: none`, so deleting a worktree retains the shared sandbox. Project sandboxes persist until explicitly removed; removal deletes sandbox-local files and sessions. Back up or push work before decommissioning one. Existing feature sandboxes are not automatically consolidated, upgraded or deleted.

Project sandboxes publish no Docker ports. The daemon listens on guest loopback port 6768. A desktop loopback listener on an available port in 20000-39999 forwards authenticated traffic over native `ssh <sandbox>.sbx`. Before forwarding, SSH wakes the VM and waits for its daemon to report ready. OMP talks to the guest daemon locally, so this path does not require the desktop SSH relay's **Allow remote CLI control** permission.

The workload kit allows outbound TCP port 443 to `quay.io` and `*.quay.io`, including Quay's image-layer CDN hosts. It also allows `builds.dotnet.microsoft.com` and `aka.ms` for .NET downloads and installation redirects, and `playwright.download.prss.microsoft.com` for Playwright's fallback browser downloads. These rules supplement Docker's default network allowlist. The Quay wildcard covers one subdomain level; the root domain has its own rule.

On Windows the login companion waits for Orca, then restores project listeners automatically. Closing Orca closes those listeners; reopening it restores them. A sandbox wakes only when a client connects. An occupied or OS-denied address is reported and never taken over. Diagnostics are under `~/.teck-orca/projects/<sandbox>/transport.log`; address conflicts require resolving the conflicting listener or OS reservation. Pairing authenticates end to end. Pairing credentials are never copied into project ownership records or logs. The companion observes Orca through its public status command and does not edit desktop stores.

Orca 1.4.229 loads plugin workers on demand. **Teck: Reconnect sandboxes** can restore project listeners and recover old feature connections; the Windows login companion provides automatic project recovery without invoking it. To disable automatic recovery, remove the named Startup VBS file and end the companion process. This retains every sandbox and checkout. Setup installs it again.

OMP records interactive conversations by project, worktree, working directory and stable pane identity. Cold restoration can reopen the exact saved conversation at an idle prompt with its model and thinking settings. An unused welcome pane has no transcript yet; a matching OMP `fresh` breadcrumb lets it reopen OMP with the same settings. A missing saved conversation without that evidence is refused. Explicit session selections take precedence. Processes do not survive VM stop, and interrupted tools or turns are not replayed. See [OMP recovery validation](docs/validation-omp-resume-2026-10-11.md) and the [fresh-pane fix](docs/validation-omp-fresh-pane-2026-10-18.md).

## Runtime and validation

The workload retains OMP 18.11.3, Bun 1.4.2, Node/npm, .NET SDK 10.0.401, TypeScript 5.9.3, C++/Python/pip/uv/Go/Java, Docker Engine/Compose/Buildx, Git/Git LFS/GPG/GitHub CLI, Next.js DevTools MCP, Biome, 15 language servers, Chromium, Playwright and agent-browser. Linux amd64 includes pinned Google Chrome; ARM uses native Chromium through Chrome-compatible commands. The guest daemon remains Orca 1.4.224 with checksum-verified Node 24.21.0; desktop integration requires 1.4.229. No initialized runtime identity is baked into the image.

`TECK_ORCA_CPUS` (default `8`) and `TECK_ORCA_MEMORY` (default `16g`) configure new project sandboxes. Existing sizes do not change. `TECK_ORCA_PROJECTS_DIR` and `TECK_ORCA_RELEASES_DIR` override host storage for diagnostics/tests. Project setup retains model configuration, toolkit, skills, workflow rules, Docker-managed service authentication and Git author identity. Repeated setup preserves existing guest configuration.

After changes run build, tests, check and setup, then refresh the plugin. `npm run smoke:project` creates a disposable project, checks SSH-only paired connectivity and OMP startup, stops the VM twice and verifies the original pairing, worktree IDs, parentage, branches and uncommitted files. It recreates the desktop listener between cold starts. It removes only its test sandbox. Reports are under `.artifacts/smoke/`. This is separate from a full Windows reboot or continuation of an interrupted OMP turn.

The older `smoke`, `smoke:restart` and `cleanup` commands cover legacy feature sandboxes. Existing immutable recipe snapshots remain valid. Historical diagnosis is in [restart recovery](docs/validation-restart-2026-10-11.md), [fixed-port recovery](docs/validation-recovery-2026-10-12.md), and [native SSH investigation](docs/investigation-native-ssh-wake-2026-10-12.md). First-use recipe checks use mocked providers; enabling the corrected plugin has not been used to create a new real sandbox during the fresh reset.

OMP search uses the existing Docker-managed MCPHub credential for `github` and `searxng`; URL reads use OmniRoute Firecrawl. Optional toolkit checks and model policy evaluations are described in [Contributing](CONTRIBUTING.md). Update SDK/LSP versions in `runtime/kits/workload/devtools.json`; existing sandboxes retain their installed tools.

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

The existing OMP modelRoles mappings remain in place. OMP chooses its internal task agents for scouting and helpers; those helpers do not replace sidebar-visible implementation workers. Terminal workers are the intended interface. The sandbox bundles `orca` and `orca-ide`, both pinned to its own runtime and user-data directory.

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

OMP runs in sandbox-backed Orca terminals. The bundled daemon supplies filesystem, Git, terminal and orchestration services. This plugin does not translate Paseo's OMP JSONL RPC into Orca's structured UI protocol.

Orca's experimental native chat supports OMP through `omp acp`. The daemon recipe uses a supported remote-runtime host type, but terminal OMP is the validated integration target; native chat and visual GUI acceptance are separate checks.

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
orca vm recipe doctor teck-sbx-feature --repo-path . --json
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

## Native SSH and local Kubernetes preview

The separate [native SSH preview](native-ssh/README.md) preserves the Run on GUI
workflow and lets Orca manage its guest daemon. It supports a shared project KIND
cluster with isolated worktree deployments and optional application operators. See
[the profile plan](docs/plan-local-kubernetes-delivery.md) and
[isolated validation](docs/validation-local-kubernetes-2026-10-25.md).

## Coordinated OMP goals

The existing configured model roles are retained. Default/plan sessions only
coordinate GitHub metadata and Orca Tasks/Dispatches/messages. All implementation,
research, review, integration and publication uses visible Orca workers with
acceptance-bounded native OMP goals. The coordinator goal matches the authorized
GitHub milestone/delivery scope; phased todos track its next coordination action.
The tool guard prevents coordinator source inspection, editing, test execution
and code publication, and blocks native task/eval helpers. Explicit independent
reviews replace periodic WATCHDOG loops. See
[runtime workflow](runtime/omp/skills/orca-feature-workflow/references/goals-and-milestones.md)
and [isolated validation](docs/validation-omp-coordination-2026-10-28.md).
