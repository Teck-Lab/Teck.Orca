# Issue-relationship Actions fallback

Use this reference only when a required native relationship operation is absent
from the connected GitHub MCP. This is the contract of the existing
`paperclip-issue-relationships.yml` bridge, not a universal workflow installed in
every repository. Its legacy filename does not require Paperclip.

## Discover before dispatch

Read the target repository's `AGENTS.md`, `.github/ISSUE_RELATIONSHIPS.md` and
the deployed workflow on its default branch through MCP. Use the workflow-owning
repository and its documented dispatch inputs, organization and repository
allowlist; do not hardcode a company/repository or derive the source from the
current working directory. A cross-repository edge still dispatches in the
repository that owns the bridge.

Check that the deployed revision exposes the requested relationship and mints an
installation token using the existing App credentials in Actions. Local edits,
an unmerged PR or this reference do not prove that the new revision is deployed.
An older relates-to-only workflow cannot provide blockers or sub-issues. If the
repository documents a different bridge, use its actual schema rather than
assuming these inputs apply.

Prefer a discovered direct MCP operation when it provides the exact native
relationship. A normal branch creation, body mention or relates-to edge is not
a substitute for a Development link, parent or blocker.

## Dispatch inputs

Set the inputs explicitly rather than relying on a repository-specific default:

| Input | Value |
| --- | --- |
| `operation` | `add` or `remove` |
| `relationship` | One supported value in the direction table below |
| `source-repository` | Source issue's repository, using the deployed workflow's allowed short name |
| `issue-number` | Source issue number as a string; it must not be a PR |
| `related-repository` | Related issue/PR/branch repository's allowed short name |
| `related-issue-number` | Related issue or PR number as a string; omit/leave blank for branch |
| `branch-name` | Branch only: short Git branch name without `refs/heads/` |
| `base-branch` | Optional for branch add only; otherwise omit/leave blank |

Do not guess tool names/argument names: discover the connected MCP Actions
dispatch schema and send these as workflow inputs, against the default branch.
Use only authorized repositories, IDs and mutations within the user's task.

| Relationship | Meaning of add from source to related item |
| --- | --- |
| `relates-to` | Source relates to related issue; no execution ordering |
| `blocked-by` | Source is blocked by related issue |
| `blocking` | Source blocks related issue |
| `sub-issue` | Related issue becomes a child of source |
| `parent` | Related issue becomes the parent of source |
| `pull-request` | Related PR becomes a manual closing reference on source |
| `branch` | Create a new linked branch in related repository for source issue |

Removal uses the same input direction. Never swap endpoints merely because
`operation` is `remove`. For example, to make issue A wait for B, choose
`blocked-by` with source A and related B; to remove that edge, keep A/B unchanged.
Reject self-links and cycles. An existing parent requires explicit removal
before reparenting; do not detach it incidentally.

## Branch and PR constraints

For a requested native issue-linked branch, use a direct linked-branch tool if
exposed, or dispatch branch add **before** creating/publishing to that remote
branch through MCP. The bridge creates a new branch from `base-branch`, or the
related repository's default branch when omitted. It refuses an already-existing
unlinked branch: report the limitation and use the GitHub UI if authorized.
Never delete/recreate or force-update an existing branch to manufacture the link.

Branch remove only unlinks the issue; it never deletes the branch. Manual PR
links are closing references, not neutral mentions; add only when the PR
delivers that issue. They do not merge, change bases or restack the PR.
PR removal manages manual links, not body-derived closing keywords. If those
keywords still link the PR, preserve human text and update them separately
through MCP when authorized, then verify the resulting state.

The existing App must have Issues write. Branch add additionally requests
Contents write; branch remove requests Contents read; PR links request Pull
requests write. Missing grants require an authorized administrator, not a new
PAT, sandbox App private key or ad hoc credential minting.

## Completion and failure

Record the exact workflow run ID/URL for the dispatch. A dispatch acknowledgement
or an arbitrary latest run is not proof of success. Wait for that run's terminal
result and inspect its read-back summary for the requested operation, direction,
repository pair, issue/PR/branch and verified present/absent state. Use a direct
authorized GitHub read-back too when the MCP exposes it. If the run cannot be
identified or its verification cannot be inspected, report it as unverified.

Only then dispatch dependency-free work. Relationship creation does not remove
an unresolved prerequisite; blocked work still waits for its completion gate.
Bridge jobs serialize and queue within the repository's concurrency limit;
queuing is not execution success. Do not cancel unrelated runs or launch
dependent work while its edge is pending.

Inspect a failed/timed-out run and current state before considering a retry.
An idempotent redispatch must reuse the same issue IDs and validated inputs, not
recreate the graph. Allow at most one automatic retry for a confirmed transient
failure; stop on permission/capability failures, invalid graphs, inconsistent
read-back or another failure. Never blindly redispatch an accepted running job.

## Unsupported operations

This bridge does not create issues, publish/sign commits, dispatch agents, merge
PRs, manage stacks, set issue types/priority/custom fields or GitHub Projects
fields, or link security alerts natively. Do not send an invented operation or
misreport an alert URL as a native link. Follow the repository's agent-led alert
review policy; use GitHub's Tracking UI for native alert linking when needed.
It never requires fetching detected secret values or reinstating an alert intake.

If neither native MCP nor a matching deployed bridge supports a required
operation, report the specific gap and next owner. Optional metadata limitations
are warnings, not reasons to block unrelated implementation. Do not silently
extend a workflow, weaken rulesets or fall back to `gh`/local `git push`.
