# Reuse issue worktrees across executor attempts

The previous policy conflated creating an executor session with creating a new
checkout. Releasing a terminal preserved its worktree, but the next dispatch was
directed to new-child. Repeated #906 attempts accumulated separate build outputs.

Managed executor dispatch now requires a canonical issue URL or stable task key
for new sessions. One feature parent owns one child per issue/key. A changed title
or Run does not change that ownership. A follow-up reclaims an eligible settled
terminal or launches a fresh terminal in the same verified idle child. Parentage,
project, branch, complete worker/task inventories and terminal state are checked.
Shared feature checkouts remain forbidden for implementation.

A sandbox-local ownership record and per-feature exclusive lock serialize
coordinator sessions. Pending intent is written before worker-start. Unknown
launch results block fresh starts; an exact returned request ID replays the saved
arguments. An explicit verified child can be adopted after reconciliation. Missing
or reparented recorded children are not automatically replaced. Corrupt records
fail closed and release the placement lock; a crash-left lock requires manual
reconciliation. Records are under ~/.omp/run/issue-worktrees.

Complete Orca inventories discover legacy issue children through assignment
specifications, issue links and conservative issue-prefixed names. Multiple
legacy matches require an explicit canonical child. The adapter neither merges
nor deletes their files. Active issue dispatches block competing starts. A planned
parallel lane requires a stable parallel_key and an explicit reason describing
file ownership/dependencies, and subsequent lane attempts reuse that same child.
Native helpers remain available for smaller parallel work.

Rules, feature and worker skills now distinguish terminal disposition from
checkout reuse. The shared maintenance manifest includes the new routing module,
and its destination is allowed by the existing scoped updater. Official upstream
Orca skill snapshots are unchanged.

Validation:

- Full repository suite: 299 passed before the final corrupt-record regression.
- Final focused routing/extension suite: 62 passed, including that regression.
- Build, managed payload parity and generated asset checks passed.
- Read-only live inventory check refused another #906 child because existing
  legacy worktrees are ambiguous. No application worker was dispatched.
- Existing OMP sessions were not restarted or modified. The active sandbox must
  receive the managed update with sessions closed before the behavior is active.

Activation: close OMP sessions, use Teck sandbox → Updates → Update Teck.Monorepo,
then reopen/resume OMP. No sandbox recreation is required. This supersedes the
terminal-only reuse policy documented in the earlier executor isolation note.
