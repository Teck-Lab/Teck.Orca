# On-demand technical planning and research

Plugin 0.5.10 adds the `technical-planner` OMP task-agent definition and a focused
workflow reference. The main orchestrator consults it when uncertainty could
change implementation, and retains ownership of the adopted plan and execution.
Fast codebase scouting, ordinary direct implementation and independent review
keep their existing roles. Research is not a mandatory stage or approval gate.

The specialist uses `@slow`, which resolves in the existing sandbox to
`omniroute/teck-researcher`, with high thinking. The upstream model behind this
alias is configured in OmniRoute and was not independently verified. No role
mapping was changed, including `plan` and `default` on the orchestrator.

The agent's built-in tools are read/find/grep/glob/web_search. Its native child
spawn environment is empty, and advisor pairing and prewalk are disabled. OMP
18.12.5 normalizes absent/empty agent spawn lists to an absent declaration;
the executor serializes that declaration as an empty spawn environment, disabling
child spawning. No recursive delegation tool is included. Read-only research
and GitHub MCP reads are explicit instructions. Inherited MCP/extension tools
remain additive: this is not a new hard security boundary around all writes.

## Validation

Before installation, native OMP discovery failed the assertion that
`technical-planner` was available. After installation, the same discovery check
finds the user-profile definition at
`/home/agent/.omp/agent/agents/technical-planner.md`. Native parsing and model
selection confirm the slow-role route, thinking level, tools, disabled advisor
pairing and preserved main/executor/reviewer/scout mappings. Research reference
links resolve. The three edited skills pass the skill-creator quick validator.
Its PyYAML dependency was supplied through isolated `uv run`, without a project
dependency change.

Build, all 70 portable tests, package check and setup passed. No application
logic changed; the addition consists of an agent definition and workflow assets.
No model requests or agent sessions were started, so research quality and live
search/page-reader calls were not evaluated. Local evidence is in the ignored
`.artifacts/technical-planner/` directory.

## Existing sandbox update

Applied seven profile files to existing sandbox `teck-orca-p-bc02e0548944`, with
incoming checksums and guards against replacing user-modified files. Configuration,
models, WATCHDOG and the reviewer overlay retain their before/after hashes.
Session and conversation files were not modified. Previous affected files are
backed up at
`/home/agent/.local/state/teck-orca/policy-updates/before-0.5.10-1792688422291`.

The existing sandbox remains running, as it was before this update. No sandbox,
worktree, connection or Orca worker was created. The next OMP session receives
the installed rules and agent; refresh the Dev plugin in Orca for the host's
future-provisioning update.
