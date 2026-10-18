# Feature sandbox and OMP launch validation

Version 0.3.1 contributes one recipe, `teck-sbx-feature`, named **Teck OMP Feature**. All four lifecycle commands invoke Node directly on Windows, macOS and Linux. The Windows PowerShell wrapper and separate POSIX recipe have been removed. Immutable runtime integrity checks and UTF-8 stdin forwarding remain in place. A Windows TMPDIR default is applied inside Node.

## Confirmed failure

The user-created `milkfish` feature workspace connected successfully to its Linux Docker Sandbox. Selecting OMP caused Orca 1.4.224 to send its PowerShell `ORCA_OMP_FRESH_CONFIG` guard into Bash, which rejected the syntax. This guard comes from Orca's renderer OMP launcher, not the recipe's lifecycle command. Replacing the recipe launcher alone cannot remove it.

Before the user prohibited desktop control, read-only checks of the existing sandbox confirmed `/usr/local/bin/omp` forwards to `/opt/paseo-omp/bin/omp`, version 18.8.7, and the bundled config.yml, models, rules and skill catalogue are present. No model request was submitted.

## Supported client workaround

In **Settings > Agents > OMP**, leave **Command** as `omp` and add `--no-title` to **CLI arguments**. This preserves selection of the OMP harness and its identity rather than requiring a manual `omp` launch. Orca's launch argument builder includes it in the command before applying the fresh-config guard. Its guard's option allowlist excludes `--no-title`, so it returns the command unchanged instead of wrapping it in PowerShell or requiring a client-generated config file. OMP uses the sandbox's existing configuration and skills. This flag disables OMP's automatic terminal-title generation and preserves the normal interactive TUI.

The installed host CLI's help confirms `--no-title` is supported. The [upstream OMP CLI reference](https://github.com/can1357/oh-my-pi/blob/main/docs/cli-reference.md) documents the flag as well. Do not use `--mode rpc-ui` as a terminal workaround: that selects a machine transport rather than OMP's interactive terminal UI. Explicit `--mode text` also selects non-interactive output.

This setting must be applied by the user through Orca's supported settings UI. The recipe/plugin cannot set client agent defaults. No desktop automation, hidden application RPC, private settings-file edits or installed-app patches are part of this workaround.

## Checks and limits

- All 16 repository tests passed after consolidation, including actual Windows host-shell execution of the Node command with UTF-8 lifecycle JSON, ownership checks, independent features, child retention and runtime tamper rejection.
- The real shell parser, argument formatter and OMP fresh-config wrapper were evaluated from the cached installed Orca renderer code. The stock `omp` command reproduces the PowerShell guard; `omp --no-title` and the executor model variant bypass it for PowerShell, cmd and POSIX shell formatting. This verifies command generation, not a live agent session.
- The prior feature release passed a live disposable Docker test with two independent feature sandboxes, repeat creation, suspend/resume, child retention, complete Orca skills and preserved relay PATH. Those test sandboxes were removed.
- Automatic OMP startup with the client argument has not been tested in the live desktop. Parent/child sidebar and remote worker dispatch acceptance remain unverified.
- macOS/Linux launch commands share the same Node code; no live macOS/Linux host test was performed.
- Issue draft/prefill commands can involve additional shell syntax. Testing the simple automatic OMP launch does not establish that every prompt-prefill path is compatible with the installed Orca version.

No desktop clicks, typing, terminal sends, new workspaces or live sandbox changes were made during the 0.3.1 fix after the user's desktop-control prohibition.

Installed release: `22f861d9dac661151820ba7360146afff0d7934ea8cd749d9cc0cb307a8e6188`.

## Version 0.3.2: writable OMP runtime directories

The next user-created sandbox passed the launcher guard but OMP failed to create `/home/agent/.omp/run` with EACCES. Read-only inspection confirmed `.omp` was root-owned (0755), while `.omp/agent` was agent-owned (0700). GNU `install -d -o agent` assigns ownership only to the explicitly named target, so the earlier command created its implicit `.omp` parent as root.

Configuration installation now explicitly creates `.omp`, `.omp/run` and `.omp/agent` with agent ownership and mode 0700. Provisioning performs a write check under the explicit `agent` account: the parent must be writable and a temporary directory must be creatable inside `.omp/run`. It removes that check directory immediately. A failed write check rejects provisioning instead of returning a connection to a broken workspace.

All 17 tests passed, including a new regression verifying write-check failure rejects provisioning and rolls back the fresh sandbox. The release was installed at digest `258e89d50fd1b0cf9817d65969ef9790b2bf35d5e7207c1b6fa6013b7df1e590`. The reported sandbox was inspected but not repaired, as requested; no existing sandbox configuration was changed.

A fresh disposable Docker smoke run passed all seven lifecycle checks with this release. The new agent-account write check passed on initial creation, repeat creation and resume. Test sandboxes `teck-orca-f-9d44d7cf4dbc` and `teck-orca-f-1aae945bdbb8` were removed; the report returned `ok: true` and `cleanedUp: true`. This validates runtime-directory writability and lifecycle behavior, not a live interactive OMP session.

## Guest CLI permission blocker

The user's OMP terminal now launches. The controlled visible-worker test stopped at `orca worktree current --json`: the guest CLI bridge denied `worktree.list`. No run, tasks or child worktrees were created. The bridge's error suggested enabling **Allow this host's orca CLI to control Orca** in SSH settings, but the user's SSH Hosts list was empty.

Installed-code inspection confirmed:

- SSH host listing explicitly filters out any target with an `owner` property.
- Recipe targets are created with `owner.type = on-demand-runtime`, so this settings list excludes them.
- The SSH bridge checks the saved target's `allowRemoteCliControl === true` when authorizing the guest caller.
- The strict SSH recipe target schema excludes `allowRemoteCliControl`. Emitting that property in the recipe result would fail validation rather than grant access.

Therefore the earlier instruction to edit this host in SSH Hosts settings was incorrect. This requires a supported Orca permission control for runtime-owned hosts. No existing targets or permissions were modified, and no desktop interaction was performed during this diagnosis. The current recipe must not be described as validated for guest-led visible worker creation.
