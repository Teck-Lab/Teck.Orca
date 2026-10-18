# Settled worker terminal cleanup

Version: Teck.Orca 0.4.1. Host: Windows; Orca 1.4.224; OMP 18.8.7.

## Diagnosis

Read-only inspection of the affected feature's saved coordinator session showed
that it loaded the official orchestration guide, accepted both worker reports,
then called `worker-retain` for both completed Dispatches. The original request
prohibited deleting test workspaces; it did not request live terminal retention.
Both worker records had `terminalState: retained`,
`retainedReason: user_requested`, no release request and no release error.
The worker's own `worker_done` followed the official contract correctly.

Teck's workflow summary said "release or retain" without the explicit user
request condition. Its shared OMP rules had no terminal disposition rule. This
left an ambiguity between preserving a worktree and retaining a live terminal.
OMP discovers the shared `RULES.md` as an always-apply native rule; see its
[version-matched context documentation](https://github.com/can1357/oh-my-pi/blob/v18.8.7/docs/context-files.md).

## Change

Only Teck-owned `RULES.md`, `orca-workers` and `orca-feature-workflow` were changed.
The coordinator releases settled owned worker terminals after accepting reports,
unless immediately reusing them or honoring an explicit request to keep the
terminal alive. Preserving worktrees or forbidding their deletion cannot supply
a `user_requested` retention reason. Finalization checks disposition receipts
as well as the empty reclaimable list, so unjustified retention cannot make the
cleanup check appear successful.

All official `orca-cli` and `orchestration` files and references remain identical
to their recorded snapshot hashes. No forced-close extension, CLI interception
or change to official Orca code was introduced. Existing sandboxes, terminals
and desktop settings were left untouched.

## Validation

Build consistency, all 21 unit/integration tests, setup and the installed Orca
plugin validator pass. The updated runtime is installed as
`3d65fb00b3d4623e1e6118cb2e6e705e03294083fea3e2568d3daef0271a0b5f`.

`npm run smoke:cleanup` provisions one disposable feature and sends the original
controlled-test prompt to a real OMP coordinator. That prompt contains no extra
cleanup instruction. The harness requires two succeeded Dispatches with released
terminal state, both linked child worktrees still present, no live OMP worker
terminals, an empty reclaimable list and a still-live coordinator terminal.
It removes only its newly generated test sandbox and saves the result under
the ignored `.artifacts/smoke` directory.

The live test passed with the unchanged original prompt. Run
`run_f22cc5cf55db` completed two successful Dispatches, both with terminal state
`released`. Both child worktrees remained parent-linked and had no live OMP
terminal, the reclaimable list was empty, and the coordinator remained alive.
The disposable sandbox was removed. Machine-readable results are under
`.artifacts/smoke/teck-orca-cleanup-974d7a86-732a-4779-a9e7-654f5098dffa/result.json`.

An initial harness run used the wrong prompt receipt field and stopped before
assessing cleanup; its disposable sandbox was also removed. The corrected
harness reads `result.send.accepted` and preserves that receipt. Comparison of
the old and new immutable release manifests confirms that only the three
Teck-owned instruction files and their skill checksum catalogue changed.

Existing feature sandboxes retain their original immutable recipe and installed
rules. Refresh/review the `plugin/` Dev folder and create a fresh feature to use
the update. Visual sidebar acceptance is separate from this CLI/state test.
