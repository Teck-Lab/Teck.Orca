# User-requested PR stacks

Load only when the user explicitly requests a stack. Ordinary work uses one
canonical integration PR, regardless of issue hierarchy or worker count.

Record the stack choice in the canonical issue/plan. A stack is useful for
sequential, independently reviewable deltas. Each PR targets the preceding PR's
branch, with the bottom PR targeting the verified repository base. Record the
ordered URLs, head/base branches, acceptance gates, and dependencies.

Use discovered GitHub MCP branch/PR operations and github-publication for remote
contents and signature verification. The availability of head/base fields does
not imply an automatic stack manager or restacker. Preserve concurrent edits.

Validate each delta against its immediate base and the combined change against
the repository base. Merge bottom-up only when explicitly authorized; do not
merge a dependent PR directly into the default branch while prerequisites remain.
Closing keywords and intermediate merges do not prove final issue acceptance.

Squash merges change ancestry. Retargeting a PR's base alone is not a safe
restack: reconstruct the remaining task delta on the updated base locally,
validate it, publish through MCP, and verify the resulting remote tree/diff,
signature and new checks. Require supported branch/ref operations for any
necessary rewrite; do not silently force-push or require local signing keys.

If available MCP capabilities cannot safely maintain the requested stack, report
the exact limitation and propose one integration PR or sequential PRs off the
updated default branch. Preserve the user's accepted delivery shape until a
change is agreed rather than silently abandoning it.
