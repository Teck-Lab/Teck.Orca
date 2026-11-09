# Plugin status and runtime update validation

Validated on Windows on 2026-11-04. The existing plugin is now version 0.7.0,
targeting Orca 1.4.248 and OMP 18.16.0. The desktop installer was extracted into
an ignored test directory, never installed over the user's desktop.

## Automated checks

- `npm run build`, `npm test`, and `npm run check` passed: 192 repository tests.
- `npm run test:plugin` passed with the exact 1.4.248 CLI: two native SDK UI
  tests and connected, fresh, unavailable, and stopped render scenarios, with
  no SDK issues or warnings. These checks do not enable a plugin or provision a VM.
- Strict TypeScript checking passed against the 1.4.248 SDK declarations.
- Runtime tests cover exact ownership, stopped/missing VM handling, safe public
  projections, settings, event subscriptions and teardown. The orchestration
  regression preserves full ownership fields and paginates compact CLI inventories.

## Disposable runtime checks

Two independently created disposable sandboxes passed the runtime smoke and
were removed afterward. Both reported Orca 1.4.248, Node 24.22.1 and OMP 18.16.0.
The second check loaded the orchestration extension with OMP's actual extension
loader and verified its goal lifecycle and `orca`, `orca_dispatch`, and
`git_inspect` tool registration. These probes did not make model calls or dispatch
work to the user's agents. Reports are under the ignored `.artifacts/smoke/`
directories `teck-orca-daemon-4ce4da6a-666e-40b2-9fc5-502cb7659e96` and
`teck-orca-daemon-530d2bdd-d592-4a07-90a6-b777517609fe`.

## Desktop worker and UI verification

A separate hidden 1.4.248 desktop profile loaded the existing plugin identity,
approved only the requested access, and successfully answered a real
`sandbox.status` request. Its read-only probe reported the existing project
VM's Orca 1.4.246, OMP 18.12.5, 8 CPUs, 16 GiB memory, free disk space and
1/1 KIND nodes Ready. It did not restart or upgrade that VM.

Live testing found that 1.4.248 hashes generated `.orca/` SDK files differently
between dev registration and worker verification. Build now archives those files
outside the installable tree and package checks reject unexpected contents.
The real worker restarted successfully after that fix.

Screenshot commands returned no render errors, but the isolated desktop's
first-run onboarding overlay covered the panel. The images therefore do not
establish visual layout correctness; native SDK rendering and interaction tests
passed. No GUI automation or changes to the user's desktop profile were used.

## Scope and limitations

The panel exposes read-only runtime/resource/KIND information and GUI settings
for monitoring. It never provisions a VM and skips stopped VMs; launch/prompt
hooks record delivery requests, not successful execution. No tool enforcement
hook was added for SSH OMP because that transport does not support it.
CPU/memory are read-only because `sbx` offers no in-place resize operation.

Official CLI, orchestration and VM recipe skill snapshots are bundled for
1.4.248. Existing sandbox binaries are not silently replaced: the desktop manages
its native SSH server after the matching desktop update; the OMP pin applies
to newly built sandboxes. No repository other than Teck.Orca was changed.
