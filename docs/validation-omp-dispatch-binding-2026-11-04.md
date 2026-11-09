# OMP Dispatch binding compatibility

Validated with Orca Desktop 1.4.246, the paired project runtime
`68074fe9-8ee9-41ea-b027-83706bf36418`, and OMP 18.12.5.

## Observed defect

The installed extension requested `worker-list`, `worker-show` and `task-list`
as ordinary JSON, but consumed the full ownership records. The current CLI
returns concise display projections unless `--full` is specified. In particular,
the list omitted `resource.worktreeId` and `dispatchStatus`; show omitted the
dispatch, process incarnation and exact-worker observation; task-list omitted
the assignment spec. The extension could therefore never establish its binding.

Live session metadata corroborated this: the reported executor pane had a saved
`coordinator` role and no Dispatch authority. This applies the coordinator's
source/tool restrictions to the executor, prevents its native goal from being
bound for settlement, and disables the existing idle-startup assignment recovery.
Other attempts had budget-limited native goals; those are a separate reason for
automatic continuation stopping. No goal budgets were changed during this fix.

The specific reported worker was executing tool calls when inspected. No input,
replacement dispatch, mailbox consumption, session modification or process
restart was used to produce that activity. The earlier `desktopWindowStatus`
value was not established as the cause of a stalled turn.

## Change and verification

- Request full records for all three internal ownership reads. Preserve exact
  pane, terminal, process incarnation, task, model role and live-owner checks.
- Follow `page.nextCursor`; repeated cursors fail verification rather than loop.
- Make the test transport return real concise shapes unless `--full` is used.
  Before the fix, eight existing lifecycle tests failed; after the fix, all
  23 focused tests pass, including pagination and stale-authority checks.
- `npm run build`, all 188 tests in `npm test`, and `npm run check` pass.
- A read-only extension probe using real CLI records bound terminal
  `term_a3dfab1c-1ef3-4324-8a7c-d2414a641615` to executor Dispatch
  `ctx_9f238380fc0c`, Task `task_7925c393f5e1`, Run `run_7b3012ba9a84`.
  It used a local in-memory extension host, not a model turn, and sent no input.
  This verifies record compatibility; a fresh full worker execution was not run.

## Installation and current sessions

Generated both runtime releases and the main plugin recipe package, and installed
the immutable releases locally. Replaced only the guest orchestration extension
atomically after verifying its original hash, retaining a backup under `/tmp`.
Installed canonical SHA-256:
`e56a10be586e03f5b3a9bd5c923b25a2227d1e16f1a6ac051bddf6eeac0f5070`.

The normal recipe's existing workflow updater carries this correction to new or
reused project sandboxes. The active sandbox file is already updated, so new or
reloaded OMP sessions load the fix. Existing OMP processes retain their loaded
extension until reload; busy workers were deliberately left running. Existing
unbound native goals were not retroactively adopted or marked complete.
