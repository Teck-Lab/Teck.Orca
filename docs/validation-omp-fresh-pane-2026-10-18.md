# OMP fresh-pane recovery, v0.5.2

The reported shutdown sequence reconnected the original project sandbox and
restored terminal output, but left Bash running in the OMP pane. Read-only
inspection found a matching active Teck record from the previous Linux boot,
with the original project, worktree, cwd and stable pane identity. The recorded
JSONL did not exist. OMP's own terminal breadcrumb matched its exact cwd and
session path and carried `fresh`: this was an unused welcome session, with no
conversation transcript yet.

OMP 18.11.3 intentionally creates its session journal lazily. Its session manager
marks the breadcrumb non-fresh once a journal materializes. See the pinned
[session manager source](https://github.com/can1357/oh-my-pi/blob/v18.11.3/packages/coding-agent/src/session/session-manager.ts).

The launcher now distinguishes two cold recovery modes. Existing journals still
resume by exact path. An absent journal with an exact fresh breadcrumb reopens
OMP using the saved launch options, model and thinking level, without submitting
a prompt. This unused pane receives a new session ID. Missing saved journals
without that evidence, conflicting non-fresh breadcrumbs, clean exits, warm
boots and different owners remain refused. Explicit session flags and Orca's
declared native startup command retain precedence. No replacement transcript
is fabricated, and no recent-session directory search chooses a conversation.

Validation:

- All 55 Node tests pass. The added regression covers the fresh boundary,
  mismatched owners and breadcrumbs, missing persisted journals, conflicting
  evidence, warm boots, clean exits and preserved model/thinking options.
- Build and generated package checks pass.
- Two isolated real OMP PTYs in the existing running sandbox exercised the new
  launcher and a bare Bash restoration hook. A changed fixture boot marker
  simulated cold recovery. The fresh welcome pane reopened with its settings;
  a persisted fixture reopened the exact session ID and file. No model requests
  were made, and the sandbox was not stopped. Temporary panes, records and files
  were cleaned up. The local report is `.artifacts/omp-recovery/result.json`.
- Only `omp-launch.mjs` and `omp-session.mjs` were updated in the user's existing
  sandbox, after backing up their previous bytes locally and verifying its
  provider identity. Guest hashes match the source. Configuration was retained.
- After confirming the affected original pane was at Bash, the public Orca
  terminal API invoked its restoration hook once. Screen output now shows OMP
  18.11.3 at its idle input, with a live claimed launcher in the original pane,
  model `omniroute/teck-orchestrator` and thinking `high`.
- Setup installed release
  `319761a8caa5fae35a974ed1307ed5c8ded30492c08dc2e05e84b225947c2c36`
  for new projects. The user handles plugin refresh. The original sandbox ID
  remains `42f6e38e-f8f5-43f7-9e64-90fc4becd630`, with eight CPUs and 16 GiB RAM.

A full desktop shutdown and real VM stop were not repeated against the user's
project during this fix. The original reproduction supplies the cold-start
failure; the isolated probes verify both recovery branches without disrupting
that project. No desktop control was used.
