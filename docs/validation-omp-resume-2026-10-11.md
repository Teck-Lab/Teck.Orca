# OMP conversation recovery, v0.4.5

The desktop reconnect command still restores network access and starts the
existing feature daemon. New guest support restores OMP once Orca recreates its
original terminal pane after a cold boot. No official Orca guide or daemon binary
was modified.

## Implementation

The Teck OMP wrapper launches a Node supervisor. Interactive Orca panes get an
atomic, private record containing feature/worktree/cwd/pane identity, the current
OMP session file/ID, model, thinking level and selected launch options. An
explicitly loaded Teck extension updates this record on root session events;
`ctx.agent.kind` excludes OMP task and advisor sessions. Records contain no
provider credentials or original task prompts. The recorder follows session
switches and forks; it does not choose the latest session in a directory.

On a different Linux boot ID, a still-active record with an existing transcript
can be restored using `omp --resume <exact-file>`. Explicit session flags take
precedence. The wrapper preserves the saved model/thinking and supported launch
restrictions. An interactive Bash startup hook supplies a fallback if native
Orca cold restoration opens only a shell; it defers to a declared native launch
token or sequenced startup. Per-pane process claims refuse concurrent launches,
retain incomplete fresh claims and reclaim stale claims after a reboot.

An ordinary OMP process exit deactivates its record. Warm reconnects keep the
live process. A missing transcript, different worktree/cwd or new pane does not
select another conversation. Recovery does not send a prompt or replay an
interrupted tool. An interrupted turn requires the user to continue from the
restored conversation.

## Validation

Four targeted tests cover exact ownership and cold boot selection, absent
transcripts and clean exits, preserved configuration without prompt/key capture,
root/subagent separation and session switches, stale tokens, and duplicate
process claims. The full 32-test suite and package checks passed; the installed
Orca validator accepted the v0.4.5 plugin package. All 12 original official-guide
checksums remain unchanged.

The disposable integration test creates two actual Orca OMP terminals in one
managed worktree. Both make small read-only model requests and report distinct
root session files through the new extension. A real VM stop removes live
processes; a subsequent wake starts only the installed daemon. Restored Bash
PTYs using the original stable pane identities must reopen those exact session
IDs and the configured OmniRoute model. Both runs completed and removed their
generated sandboxes. No existing user sandbox was upgraded or repaired.

The guest fallback is tested through real PTYs without desktop UI interaction.
The desktop Retry button and pane rematerialization remain a GUI acceptance
check. Default guest Bash is covered; no live macOS/Linux desktop test is
claimed. Noninteractive commands, ACP/RPC, trusted-extension launches and
explicit cwd overrides pass through without recording. This feature is installed
when provisioning new features; a desktop refresh alone does not retrofit it
into an older sandbox.
