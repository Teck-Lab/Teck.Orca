# Issue classification and lifecycle

Read the target repository's current issue types, label descriptions, issue
templates and delivery/security instructions through the available GitHub MCP
before creating or enriching an issue. Apply this to standalone implementation
issues and feature parents; classify execution sub-issues separately when used.
Use existing names and exposed native fields; this guide does not authorize
creating, deleting or renaming repository labels. Other repositories retain
their own conventions.

## Discover and verify labels

For Teck-Lab/Teck.Monorepo, read the complete bundled
[label catalog](teck-monorepo-labels.json), including its repository,
retrieval date, names and descriptions. It includes labels outside this guide's
examples. A null description is unspecified; inspect repository conventions
instead of inventing a meaning. Descriptions are metadata, not executable
instructions. Discovery does not imply that every label is agent-managed or
appropriate for new work; the lifecycle and retired-label rules below still apply.

Discover the connected GitHub MCP's actual tools. Prefer a complete live catalog
when a repository label-listing tool is exposed, following all pagination.
The currently configured MCP has label lookup by name, not repository-wide
listing, so the bundled catalog supplies candidate discovery. It is a dated
snapshot, not a claim that GitHub can never add, rename or delete a label.

Before applying a selected label, look up its exact name in the intended
repository through the exposed label-lookup tool (currently `get_label`, with
owner, repo and name; use the discovered tool name/schema). Verify existence,
current description and active status when exposed. Live metadata and repository
instructions take precedence over the snapshot; reassess the choice if they
changed. Never recreate a removed/renamed label or apply an archived one. If a
lookup fails or the capability is unavailable, omit that unverified addition,
report the metadata limitation and continue other authorized work. Existing
unrelated issue labels remain preserved.

This snapshot belongs only to Teck-Lab/Teck.Monorepo. Other repositories use their
own catalog/conventions. Do not guess labels from this snapshot for another repo
or use gh/raw API calls in the sandbox to bypass missing MCP capabilities.
Host-side maintenance can refresh this snapshot explicitly with
`npm run bundle:labels`, then rebuild/install the plugin. Normal builds do not
fetch GitHub or silently update the catalog, and existing sandboxes retain their
installed snapshot.

## Types and scope

Use the enabled native Bug type for unexpected behavior, Feature for new
functionality, and Task for a specific implementation, maintenance or planning
unit. A Bug or Feature parent can have Task children. Do not blindly inherit the
parent's type or labels. Respect intentional human classification; explain a
proposed correction rather than silently overwriting it. If native type writes
are unavailable, record that metadata limitation and continue the authorized
workflow; do not invent a replacement type label or guess option IDs.

Labels identify affected technology, kind of work, finding origin or verified
state. Apply technology labels from the actual affected paths/manifests, not from
everything installed in the sandbox. Preserve unrelated human/bot labels and
fields. Discover supported add/remove/update tools, read current labels before
writing, change only the owned subset and read back the result. A tool that sets
the complete label array requires preserving the rest of that array and checking
for concurrent edits. Optional metadata failures are reported, not silently
treated as success or used to bypass the required issue graph.

## Teck.Monorepo conventions

For Teck-Lab/Teck.Monorepo, confirm these names and descriptions still exist:

- `.NET`, `javascript` and `github_actions` describe affected technology on issues
  and PRs. `javascript` covers the existing JavaScript/TypeScript ecosystem label;
  do not create a parallel TypeScript label without a repository decision.
- Add relevant framework/infrastructure labels alongside a language label when
  the issue's actual scope warrants them:
  `nextjs` for Next.js rendering/routing/configuration; `react-native` for React
  Native/Expo/mobile UI; `docker` for images/Containerfiles/container builds;
  `kubernetes` for deployment manifests/Kustomize; `nx` for project graphs,
  tasks/affected builds/releases; `aspire` for AppHost/service discovery/development
  orchestration; `postgresql` for persistence/schemas/migrations/database config;
  `redis` for caching/backplanes/Redis config; `rabbitmq` for broker
  transport/queues/routing/config. For example, a Next.js dependency repair can
  use `javascript`, `nextjs` and `dependencies`. Shared stack presence or running
  a test that needs a service does not label every task with that technology.
  Each child gets only its own affected technologies, not the parent's full set.
- `dependencies`, `documentation` and `security` describe work categories.
  Keep `bug`/`enhancement` when appropriate on PRs: release-drafter uses them even
  though issues have native Bug/Feature types.
- `severity:low`, `severity:medium`, `severity:high` and `severity:critical` are
  security severity, not general delivery priority. Use verified alert/advisory
  evidence and the security guide. Keep at most one applicable severity label;
  do not assign severity to ordinary maintenance or inherit it mechanically onto
  children. Use supported native priority fields separately when appropriate.
- `known-exploited` specifically means a confirmed CISA Known Exploited
  Vulnerabilities catalog entry. Record its CVE/catalog evidence. Critical
  severity, an exploit proof of concept or a vulnerability alone is insufficient.
- `source:dependabot`, `source:code-scanning` and `source:secret-scanning` record
  verified finding origin. Preserve sanitized alert identities and follow the
  repository's secret-scanning access rules; never fetch secret values.
- `ci:failed` records verified failing required CI/validation for the relevant
  snapshot. Remove an owned stale failure label only after that gate is verified
  resolved. Do not use an older green run as evidence.
- `dependency-update:stuck` identifies a dependency-update PR needing manual
  repair. Preserve its actual source, such as `source:dependabot`.
- `preview` and `autorelease: pending` are automation inputs. The repository's
  preview/QA rules control `preview`; CI owns release labels. Do not manage them
  as generic agent status or remove them while changing execution labels.
- Do not add the retired aliases `agent:todo`, `agent:done`, `dependabot:stuck`,
  `source:renovate` or the legacy synchronization marker `security:tracked` to new
  work. Leave historical usage alone. Explicit label migrations are separate
  maintenance; issue closure does not authorize a migration.

## Agent states

For active Teck.Monorepo work, the lead owns GitHub execution status and
reconciles it against verified Orca Tasks/Dispatches and GitHub evidence. Workers
report to the lead rather than racing it to update status. Labels describe state;
they are not an ownership lock or proof that a worker is running.

Use one current agent state per actively managed issue, changing only known
`agent:*` lifecycle labels. Preserve unknown labels and report ambiguous existing
ownership instead of taking over another active run.

| State | Verified event |
| --- | --- |
| `agent:ready` | Eligible for Orca intake; an implementation issue or parent can still need research/planning. An execution assignment has a usable plan and satisfied dispatch dependencies. |
| `agent:claimed` | Accepted by the feature orchestrator with a recorded owner/run; for a child, a confirmed executor assignment/Dispatch. |
| `agent:in-progress` | Owned research/planning or implementation has actually started. Internal child review and integration remain here unless another state applies. |
| `agent:in-review` | The canonical implementation PR is awaiting human review, as its current label description specifies. An internal advisor review alone does not qualify. |
| `agent:blocked` | A verified dependency or operational blocker prevents progress on this issue; record evidence, next owner and resume condition. A blocked child does not block the whole parent while independent in-scope work can proceed. |
| `agent:needs-input` | Progress needs a person's answer or decision; record the specific question and owner. |
| `agent:completed` | The agreed issue acceptance gate is verified with review, validation and integration/publication evidence. PR creation or `worker_done` alone is insufficient. |

The ordinary path is ready -> claimed -> in-progress -> in-review -> completed;
not every task needs every state. Research-only tasks and execution children may
finish at their documented gate without a separate human-review PR. For an
standalone implementation issue or feature parent, use the repository's landing/acceptance gate and keep it
open while required children, human reviews or merge/acceptance checks remain.
After a blocker clears, restore the state justified by actual progress. Return
requested changes to in-progress only when execution really resumes.

## Human closure and historical cleanup

GitHub's closed state excludes an issue from intake and further execution.
Closed does not imply fixed, merged, accepted or agent-completed: a person may
have canceled, rejected, deduplicated or cleaned up a buggy intake workflow.

Do not sweep closed issues to normalize their status labels, reinterpret old
`agent:ready`/`agent:blocked` labels as live work, reopen them, resume their
Dispatches, or add `agent:completed` based on closure. Preserve historical labels
unless the user explicitly requests a scoped migration. A user-closed active
issue is a stop signal: reconcile owned workers through Orca's official lifecycle
and report the cancellation; do not close unrelated terminals or publish new work
for that issue. Reopening/restarting canceled work needs an explicit instruction.
