# Pixtuoid sandbox preview

Pixtuoid 0.22.0 and ttyd 1.7.7 are pinned to upstream architecture-specific
release hashes. Pixtuoid's shipped licences and font notices accompany the
installed binaries. The guest service runs as agent, binds ttyd to 127.0.0.1:9431,
and launches only `pixtuoid run --protocol sixel`. No agent launcher or model
configuration was replaced.

The existing owned Teck.Monorepo VM was retained. Repeated service startup
returned the same boot identity and port. Pixtuoid doctor detected OMP 18.16.0,
its extension and its session root. Upstream's release records OMP 18.15.0 as its
verified version; actual rendering observed two existing OMP sessions, including
one reporting a running Bash tool. No new paid agent turn was submitted.

`scripts/smoke-pixtuoid-view.mjs` used an isolated, headless Windows Edge profile
to exercise browser -> loopback gateway -> Docker exec -> ttyd -> Pixtuoid, verify the
terminal WebSocket, check for disconnect text and canvas output, and capture the
actual pixel artwork for visual inspection, and reconnect the same browser URL
after transport restart. A sandbox-browser reverse-forward
experiment could load HTTP but not its WebSocket; it was discarded as evidence.

The final plugin was reloaded in the real desktop with its original four
capabilities. Automatic opening produced one active ttyd browser connection.
Two subsequent `sandbox.office` requests reused that view without starting
another Pixtuoid terminal. No sandbox restart or OMP interruption was needed.

The preview manager tests cover coalescing, existing-view heartbeats, respecting
closed views, sandbox boot changes, identity replacement and stopped sandboxes.
The browser wrapper sends heartbeats so plugin reload can reuse an open view.
Fresh image hooks and native recipe reuse carry the same guest assets. No
production VM reboot or complete fresh workload image rebuild was performed.

Validation: 211 Node tests, asset/package checks, Orca manifest validation and
the existing declarative UI tests/check scenarios passed before final validation.

## Hover rendering correction

The first preview left tooltip text and panels visible after mouse movement.
An isolated Edge sweep reproduced it. ttyd 1.7.7's xterm image canvas has no
explicit stacking level, letting retained text paint above replacement image
tiles. The wrapper now sets `.xterm-image-layer { z-index: 0 }` inside the
terminal frame on every frame load, matching upstream xterm's top image layer.
Native tooltip text remains visible where Pixtuoid carves out its image tiles.

The browser smoke now keeps its transport state in an isolated temporary root,
checks the computed image stacking level after reconnect, and optionally sweeps
the scene with `TECK_OFFICE_HOVER_PROBE=1`, capturing before/during/after PNGs.
The corrected 750px-wide, DPR 1 after-hover screenshot has no retained tooltip panels or trails.
211 tests and asset/package checks passed again. This is a host preview change;
the sandbox, running agents and KIND cluster were not restarted.

Follow-up: this did not fix the full preview. At a 1536×864 viewport with DPR
1.25, furniture hover tests reproduce retained popup fragments and misaligned
tiles. Computed stacking level and connection smoke tests do not prove hover
cleanup. A separate PNG protocol/PTY compatibility trial on port 9432 also did
not resolve the artifacts; it was stopped and its unshipped adapter removed.
The user chose to investigate a standalone browser office instead. No replacement
office has been installed and the existing preview has not been removed.
