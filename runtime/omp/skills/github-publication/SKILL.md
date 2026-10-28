---
name: github-publication
description: Publish tested workspace changes through the configured GitHub MCP and GitHub App, manage branches and pull requests, and verify remote commit signatures without requiring local signing keys.
---

# GitHub publication

When publishing work to GitHub, use the configured GitHub MCP tools. Local `git` handles workspace state; the GitHub App behind MCP creates the canonical remote commit.

For implementation or repair requests in the user's own repository, publication
and creating/updating the canonical PR are part of delivery after reviewed
validation. Do not wait for a separate "create a PR" request. Confirm the intended
repository and base, reuse an existing repair PR, and verify the returned PR URL
and remote commit state. Explicit read-only, planning-only, local-only or
no-publication instructions take precedence. Missing publication tools or access
must be reported as a blocker. PR creation does not authorize merging.
The feature coordinator owns the canonical PR identity and dispatches one
task-role publication worker after independent approval. That worker inspects
the approved snapshot and performs this MCP/signature workflow; it must not
edit code, merge or publish a different snapshot. Implementation workers report
their tested changes instead of opening competing PRs. Return remote tree,
signature and PR evidence to the coordinator. The coordinator never publishes code itself.

## Commit signing through the GitHub App

Publish tested file contents with MCP `push_files` (or the appropriate single-file/deletion tool) and a Conventional Commit message. No local `git commit` is required first. App-authenticated API commit creation can produce GitHub-signed commits when author, committer, and signature overrides are omitted.

The App installation token and private key stay on the MCP server. Do not request a PAT or workspace GPG/SSH key for this path, mint credentials in the sandbox, or invent an App identity. An App's bot email supplies attribution; it does not sign a locally created commit. Pushing an existing local commit with an App token does not add a signature.

Missing local signing keys are not a blocker for MCP snapshot publication. Local checkpoint commits are optional; follow repository rules if using them. If a local signed commit fails, continue from the tested working-tree contents through MCP rather than requiring a signing key before publication. Preserve all intended edits and report that the remote snapshot has a different SHA and does not retain local commit history.

Read back the returned remote commit SHA and its verification status through an authorized GitHub read tool. Require `verification.verified: true`. If the repository requires GPG specifically, also require a signature beginning `-----BEGIN PGP SIGNATURE-----`, or confirmation from its signature-check CI job. A successful write, an App avatar, or the word MCP does not prove signing.

If the read tool omits verification fields, report verification as unconfirmed and inspect the repository signature-check result. If GitHub reports `unsigned` or rejects a signed-commit rule, report the exact server/API failure; do not weaken rules or install a local key as an automatic workaround.

See [GitHub bot signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification#signature-verification-for-bots).

## Decision matrix

| Goal | Use |
|---|---|
| Publish or update one or more files on a remote branch, history can be flattened | MCP (`push_files`, `create_or_update_file`, `delete_file`) |
| Create/delete/list a remote branch | MCP (`create_branch`, `list_branches`, `delete_file` is not for branches) |
| Open/update/merge/comment on a PR | MCP (`create_pull_request`, `update_pull_request`, `merge_pull_request`, `pull_request_review_write`, etc.) |
| Create/update issues and labels | Discovered native MCP tools |
| Native issue relationships, linked branches and manual PR links | Discovered native MCP tools; matching App-authenticated Action through MCP when missing (see fallback below) |
| Trigger or cancel Actions | MCP (`github_actions_run_trigger`, etc.) |
| Preserve the exact local commit graph in a PR | Explain the MCP snapshot limitation; obtain explicit authorization for another publishing route |
| Inspect local state, stage, optionally checkpoint, rebase, resolve conflicts | local `git` |

## Default rule

| Operation | Tool |
|---|---|
| `git status`, `git diff`, `git add`, optional checkpoint commits | local `git`; checkpoints are not a prerequisite for publishing |
| Verify history, rebase, resolve merge conflicts | local `git` |
| Publish/update/delete files on a remote branch | MCP (`push_files`, `create_or_update_file`, `delete_file`) |
| Create/list branches | MCP (`create_branch`, `list_branches`) |
| Create/update/merge/comment on PRs | MCP (`create_pull_request`, `update_pull_request`, `merge_pull_request`, `pull_request_review_write`, etc.) |
| Issues and labels | Discovered native MCP tools |
| Native issue relationships and Development links | Native MCP operation first; matching verified Actions bridge when missing |
| GitHub Actions | MCP (`github_actions_run_trigger`, etc.) |

## Native relationships and Actions fallback

Discover the connected MCP's actual schemas before assuming an example tool is
available. For native parent/sub-issue, blocked-by/blocking, relates-to, manual
PR-to-issue or linked-branch operations, prefer a direct MCP tool that implements
the requested relationship. A normal `create_branch` does not establish an
issue's Development link.

When that native operation is missing, use `github-execution-planning` and its
issue-relationship bridge reference if installed. Otherwise inspect the
repository's `.github/ISSUE_RELATIONSHIPS.md` and deployed
`.github/workflows/paperclip-issue-relationships.yml` (or its documented
equivalent). Dispatch only a matching authorized App-authenticated bridge
through MCP, wait for the exact run and its verified edge, and keep dependent
work undispatched until verification succeeds. The bridge is not a commit
publication, merge, security-alert-link or custom-field fallback.

No sandbox PAT/private key, `gh` write or local `git push` is needed for this
relationship path. Missing access or a failed verification is a reported blocker,
not permission to bypass a gate or improvise a new workflow.

## The `git push` escape hatch

MCP file tools create snapshot commits; they cannot push existing local commits while preserving their hashes and graph. If a PR must preserve the local commit history, ask the user explicitly:

> I can create the PR in two ways:
> 1. **MCP snapshot** â€” publish the current file contents as a single new commit on a remote branch. Fast, but flattens your local commit history.
> 2. **`git push`** â€” push the local branch with `git push origin <branch>`, then create the PR via MCP. Preserves commits, but uses local git for the transport step.

Only use `git push` after the user chooses option 2. After the branch is on GitHub, switch back to MCP for the PR and any further GitHub-side writes.

## Workflow

1. Inspect the local state first:
   ```bash
   git status --short
   git diff <base> --stat
   git log --oneline <base>..HEAD
   ```
2. Use snapshot publication by default when preserving exact local commit history was not requested. Tell the user it creates a new remote commit; do not block on creating a local commit.
3. If history does not matter, create or update the remote branch via MCP and publish files with `push_files` / `create_or_update_file`.
4. If history matters, ask the user, then `git push` the branch if permitted, and create the PR via MCP.
5. Verify the remote tree, returned commit SHA, signature status, and PR result with authorized GitHub read tools and the repository signature-check CI job.

## Anti-patterns

- Do not `git push` silently because it is faster.
- Do not flatten history without telling the user.
- Do not use `gh` for writes when MCP tools are available.
- Do not assume `push_files` will preserve local commit messages or order.
- Do not require a workspace signing key before App-backed API publication.
- Do not claim a commit is signed until remote verification or the signature-check CI job confirms it.


