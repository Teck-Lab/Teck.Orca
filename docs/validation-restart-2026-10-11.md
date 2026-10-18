# PC restart and stale runtime connection

Validated with desktop and bundled Orca 1.4.224 on Windows, 2026-10-11.

## Failure observed

After restarting the PC, the feature's Docker Sandbox was stopped and `sbx
ports --json` returned an empty list. Orca retained a `running` ephemeral-VM
record and a saved websocket endpoint from before the reboot. Its runtime record
and feature ownership file had not changed since before the restart.

The user saw: “Remote runtime disconnected. Automatic retries stopped.
Reconnect to resume this terminal session.”

Read-only inspection of the installed desktop's main-process resume handler
found this early return:

```js
if (runtime.status !== 'suspended' && runtime.status !== 'resume_failed') {
  return runtime;
}
```

Workspace activation calls that handler. A stale `running` record therefore
prevents the provider's resume command from running. Our recipe is the component
that wakes the VM, starts the bundled daemon and returns its current pairing
result. After an actual VM stop, the old daemon process and port are gone.

At the time of the initial diagnosis the content-only plugin contributed a
recipe, without a worker entry. It could not override this desktop handler.
v0.4.4 subsequently adds a worker command and a loopback recovery bridge; see
[plugin recovery validation](validation-reconnect-2026-10-11.md). No installed application code, official skill, existing feature VM,
desktop record or user terminal was modified during this diagnosis.

## Cold-resume validation

`scripts/smoke-restart.mjs` creates a generated disposable feature, registers
parent and child worktrees, writes an uncommitted marker in the child, stops the
VM, then calls the existing resume recipe. It checks the connection using an
isolated host client and verifies persisted checkout metadata and contents.

Passed artifact:
`.artifacts/smoke/teck-orca-restart-1f249638-d237-4f7d-bf8f-d9126a2c66f3/result.json`.
Each invocation records its own UUID directory under `.artifacts/smoke/`.
The passing VM was `teck-orca-f-ea213cee6b2c`; it was removed after verification.

- The sandbox was actually stopped; published ports became empty.
- Resume woke it without creating a replacement sandbox or cloning again.
- The host endpoint changed from port 60110 to 60111.
- The newly emitted pairing result connected successfully from the host.
- The feature identity and both worktree IDs were preserved.
- The child's branch, parent link and uncommitted marker were preserved.
- The daemon's process runtime ID changed. Orca generates that ID per process;
  it is not the durable feature or worktree identity.
- The generated test VM and its ownership record were cleaned up.

The first harness run incorrectly expected the process runtime ID to persist.
The bundled server assigns a new UUID at process creation; that assertion was
corrected before the passing run. Production code needed no cold-resume change.

This test does not prove UI reconnection, survival of terminal processes, or
automatic continuation of an interrupted OMP turn. The earlier `smoke` test's
suspend operation was a no-op, so its suspend/resume check did not cover a PC
restart or an actual stopped VM.

## Required reconnect change

Orca must invoke the resume recipe when a recipe-backed runtime is unreachable,
including records marked `running`, then update the existing environment from
the returned pairing code, invalidate the old transport and reload the runtime
catalog. The desktop should serialize concurrent reconnects for one feature.
The existing environment identity and parent/child placement must be retained.

[Upstream issue #20774](https://github.com/stablyai/orca/issues/20774) and
[proposed PR #20777](https://github.com/stablyai/orca/pull/20777) discuss recovery
controls and a running-state reconnect path. The PR was open when checked;
its existence does not mean the installed desktop includes those controls, or
prove that it wakes a locally stopped VM whose record still says `running`.

Do not remove/recreate the feature to clear this connection error. Starting
the VM alone does not repair a changed connection port. v0.4.4 restores the
saved address through an explicitly invoked local bridge, preserving the
existing pairing rather than replacing it. No OS startup task or edits to the
desktop's live JSON stores are needed for that approach.
