# Runtime upgrade validation

The live upstream stable release API identified Orca 1.4.254 (published
2026-11-08) and npm's latest dist-tag identified OMP 18.18.3. The plugin's native
runtime targets are updated accordingly. Every OMP image default and standalone
image smoke check now pins 18.18.3; Bun remains 1.4.4, which satisfies the package.

The running Teck.Monorepo sandbox was upgraded from OMP 18.16.0 using the existing
ownership-checked maintenance path. No OMP sessions were running. User models,
configuration, MCP connections, credentials and conversation files were retained.

Live validation found that root's mkdtemp directory retained mode 0700 after
installation. The updater now makes installed runtime roots traversable (0755)
and verifies OMP as the agent user before activating a selection. The existing
18.18.3 prefix was repaired, and both direct and normal launcher invocations as
agent report omp/18.18.3. An isolated print-mode model request loaded the installed
extensions and returned its expected marker. Memory recall/retention were disabled
only for that temporary smoke session; no application files were accessed.

OMP 18.18.3 changes the native ask tool to an HTML-form schema. Teck's extensions
do not construct the old questions-array payload. The current worker presets and
Orca/native-helper role restrictions remain in force.

Orca's native SSH server is updated by its managing desktop, not by replacing a
guest binary behind the deployment manager. After the user updated Windows,
Orca automatically upgraded the connected sandbox to 1.4.254. A supported managed
update request returned already-current. The managed status and guest CLI both
report 1.4.254, with the former 1.4.248 version available for rollback. No forced
restart or desktop installation was performed by the plugin. All five original
worktree IDs, paths and branches were verified unchanged; the regular persistent
connection remains the only saved environment. Bundled CLI, orchestration and
VM guides were refreshed from the installed 1.4.254 CLI.
The retained legacy compatibility daemon bundle remains at 1.4.248; it is not
the daemon used by this native SSH sandbox.

All 267 plugin tests and generated-asset checks passed after updating the pins.

Sources: https://github.com/stablyai/orca/releases/tag/v1.4.254 and
https://github.com/can1357/oh-my-pi/releases/tag/v18.18.3.
