# Orca / OMP runtime and delegation validation — 2026-10-30

The bundled daemon plugin is 0.5.14; native SSH preview is 0.1.9. Images pin
Orca 1.4.245 (bundled-daemon path), OMP 18.14.0 and Bun 1.4.4. Node for the
bundled daemon remains 24.22.1. The native SSH path uses the desktop-managed
Orca guest server, so its server upgrade follows the desktop update.

## Release provenance

- [Orca 1.4.245](https://github.com/stablyai/orca/releases/tag/v1.4.245), source
  `1c6ac8c3c4d2c3dec2cb5966d225ca2a0e0471d3`.
- Official Linux AMD64 Debian SHA256:
  `54420e22d49dda9df66ed4e943b62844c955d4fd9d5c1059bf8f7702b760bc89`.
- Bundled `orcad-server.js` SHA256:
  `33458faa0690a64159776e1857ef3b40a6bea1b697ca289214064e8ed6dfff82`.
- [OMP 18.14.0](https://github.com/can1357/oh-my-pi/releases/tag/v18.14.0), npm
  `@oh-my-pi/pi-coding-agent@18.14.0`. Its package engine requires Bun >=1.4.4.
- Daemon artifact versions are `0.1.0+9e4fc7c6495b` (x64) and
  `0.1.0+11fc821f039c` (ARM64). The bundle records file hashes and reconstructs
  encoded/compressed vendored assets before image installation.

## Orca changes since 1.4.237 and 1.4.244

| Release | Relevant behavior | Scope for our setup |
| --- | --- | --- |
| 1.4.238 | OMP plan-review/question card fixes; correct Pi/OMP transcript ownership; ACP image sending | Terminal question routing benefits; image sending is native ACP chat |
| 1.4.241 | Lost OMP ACP sessions recover by replacing the ACP process and loading the session on the next send; model effort remembered | ACP chat recovery does not prove terminal reconnect/resume works |
| 1.4.242 | Pi/OMP Session History deduplication uses the owning agent | History correctness |
| 1.4.243 | OMP native child names display correctly; finished/cancelled children no longer stay Working | Directly relevant to enabling native OMP helpers |
| 1.4.243 | Recognize renamed Pi/OMP terminals; preserve session titles; pass provider slash commands through | Includes Windows Shift+Enter routing and provider identity |
| 1.4.244 | OMP skills appear as `/skill:<name>` slash entries | Native ACP chat; not a new terminal plugin API |
| 1.4.245 | OMP commit-message/chat-name generation passes prompts through documented file arguments | Local, SSH and WSL transports; fixes empty generation results |
| 1.4.245 | Agent identity resists foreign names in task titles; conversation-file/symlink history fixes | General agent/history correctness |

Primary implementation references:
[ACP session recovery](https://github.com/stablyai/orca/pull/33359),
[native OMP child lifecycle](https://github.com/stablyai/orca/pull/29263),
[renamed terminal recognition](https://github.com/stablyai/orca/pull/34292),
[OMP prompt transport](https://github.com/stablyai/orca/pull/34644).
Release notes are available for
[1.4.238](https://github.com/stablyai/orca/releases/tag/v1.4.238),
[1.4.241](https://github.com/stablyai/orca/releases/tag/v1.4.241),
[1.4.242](https://github.com/stablyai/orca/releases/tag/v1.4.242),
[1.4.243](https://github.com/stablyai/orca/releases/tag/v1.4.243),
[1.4.244](https://github.com/stablyai/orca/releases/tag/v1.4.244) and
[1.4.245](https://github.com/stablyai/orca/releases/tag/v1.4.245).

The final upstream child-lifecycle fix uses OMP runtime job state at root
`agent_end`, and clears children OMP no longer runs. It is not a new polling
observer, orchestration protocol or promise of a separate GUI terminal for every
native helper. Generic ACP/coordinator card improvements do not establish those
capabilities for our terminal integration.

## Delegation policy

The blanket native task/eval ban is removed for every role. Native task/eval,
wait and agent:// messaging remain available; OMP owns child lifecycle. Native
children keep their own tools/preset and do not restore, claim or settle their
parent's Orca Dispatch/native goal. Identity uses OMP's `agent.kind === 'sub'`,
including native agents whose depth is zero. The parent owns scope, permissions,
actual evidence and final acceptance. This is a behavioral/tool policy, not OS
isolation of delegated code.

The same planning, execution and verification flow applies recursively within
issues and sub-issues. Independently trackable deliverables may become durable
GitHub sub-sub-issues; transient helpers do not each need an issue or Orca Task.
Record only actual blocking prerequisites. For 1 -> {2,3} -> 4, accept 1, start
2 and 3 concurrently, then start 4 when its actual prerequisites are accepted.
Use configured capacity limits rather than a fixed two-worker recommendation.
Final issue closure still follows its delivery gate, not intra-PR scheduling.

Existing model roles and custom presets/settings/sessions are preserved. Managed
profile upgrades install the bundled technical-planner preset as well as the
policy; the planner can itself use native helpers. Independent review covers the
deliverable/integration rather than adding a full review per helper or wave.

## Validation

Scoped root build/check and all 146 tests passed. Native SSH build/check and all
22 tests passed, including the managed planner upgrade. Behavioral tests first
reproduced blocked native delegation and inherited parent authority, then passed
with the new policy. Parent ownership, exact goal binding, report retry and
publication restrictions retain their existing regression coverage.

Live disposable acceptance results are recorded below after completion. No
production project sandbox, model mapping, remote Git repository or desktop UI
is changed by the fixture. Native child rows in the desktop GUI are not visually
validated by these command-line tests.
