# Agent Office integration — 2026-11-08

Fork PR: https://github.com/Teck-Lab/agent-office/pull/1

The Orca plugin now starts a bundled Agent Office browser/server on Windows and connects each exactly owned, running Docker Sandbox through a reverse SSH tunnel. The office is observation-only. Docker Sandboxes have their own cloud-wing host type and logo; OMP sessions and native helpers have stable, source-scoped identities and parent relationships.

The OMP observer reports lifecycle, tool category, approval state and model/role metadata. It sends no prompts, tool arguments, results or working directories. Ingestion uses separate per-sandbox credentials, server-owned project/host labels, bounded batches, retry deduplication, heartbeat expiry and restart checkpoints. Neither the office nor an unavailable network gates OMP tool execution.

## Verified

- The fork's TypeScript check and production build pass. All five new ingestion tests pass.
- Eleven targeted Orca integration/package tests pass; `npm run check` passes. The sandbox panel test and eight panel render scenarios pass.
- A real isolated OMP run through `/usr/local/bin/omp`, using normal extension discovery without an explicit observer flag, delivered main-session, task, native-helper, parent-link and shutdown events through the plugin-managed connection, then exited successfully with `OFFICE_OK`. It did not touch the user's working sessions. The `.ts` discovery entry is required because OMP does not automatically discover standalone `.mjs` extensions.
- Restarting only the Orca plugin restored event transport, reused the existing host office process, and left exactly one office reverse SSH connection. The Open pixel office handler returned `opened: true`.
- An explicit office-button request opens the browser even with an existing viewer; the live viewer count increased from one to two. Automatic refreshes still avoid duplicate opens. A regression test covers both cases, and the panel test covers retrying after an error.
- Docker's SSH proxy requires its Windows settings environment. The helper preserves that environment and provides the canonical `LocalAppData` variable when using Git/MSYS SSH.
- Two consecutive restarts reconnected on their first attempt in approximately 10.7 seconds each, leaving exactly one office SSH connection. A fresh guest loopback port on each connection avoids collisions with the previous listener's cleanup; Windows cleanup terminates the owned SSH process tree, including its Docker proxy.
- The system Windows OpenSSH client exits silently with code 255 from this plugin worker, including for `-V`; Git for Windows' OpenSSH works. The owner-monitored helper probes clients and automatically falls back to the working Git installation. Closing its owner or input pipe closes its SSH child.
- Sandbox inventory is checked for the exact owned UUID/name and running state before guest configuration and before readiness probes. Office refreshes do not start a stopped sandbox.
- Pixtuoid, ttyd and its observer are removed from the running sandbox and new image sources. Older immutable kits retain a no-op at the old startup path so that they can still boot. Existing KIND and OMP sessions were retained.

## Limits

### Waiting-session presence correction

A synchronous observer configuration read failure (or an invalid configuration during rotation) could leave `inFlight` pointing to an already-settled promise. Every later flush then returned without retrying or sending presence. This was reproduced independently; a waiting coordinator could consequently expire even while its OMP process remained open. Turn completion is reported as `waiting`, not session shutdown.

The reporter now assigns its promise before executing the delivery body and releases the latch in the chained finalizer. Both new behavioral regressions failed before the fix and passed afterward. An isolated real HTTP office test preserved a waiting coordinator for 100 seconds of simulated time without tool events, recovered a configuration failure and a server restart, and removed the seat at explicit session shutdown. The complete Teck.Orca suite passed 229/229 tests and generated-asset checks passed.

The plugin was deployed/reloaded with unchanged capabilities, and the installed sandbox observer hash matches the corrected source. Existing OMP processes were not restarted; they must reopen/resume to load the corrected observer. The earlier observed coordinator-to-executor transition was a new executor's startup binding, and does not prove that the user's actual coordinator changed role.

Existing OMP processes must be reopened/resumed before they can emit native events. `/reload-plugins` in OMP 18.16.0 does not reload extension code. No running user session was interrupted to force this.

The broad fork Linux suite reported 479 passing tests, 23 cancellations, two skips and no assertion failures. The pending-promise cancellation was reproduced in the unchanged baseline cloud-places tests. The broad Windows suite also encounters existing POSIX/symlink assumptions. These are not reported as a passing full suite.

Automatic approval review rejected the browser screenshot check because of the user's instruction against computer control. Browser pixels were not visually verified; API/event delivery and the Orca panel's render scenarios were checked.

The local view is http://127.0.0.1:4747. It binds only to loopback; no hosted service or firewall opening was added. The fork PR targets Teck-Lab only; no upstream PR was created.
