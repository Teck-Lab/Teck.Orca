# Orca 1.4.244 sandbox runtime

The bundled-daemon plugin is 0.5.13 and requires desktop Orca 1.4.244 or newer.
The native SSH preview remains desktop-managed: updating the desktop supplies
its corresponding server on the next managed SSH connection. It does not ship
this separately bundled daemon. No desktop installation or project sandbox was
updated during packaging.

## Verified inputs

The source is the official [v1.4.244 release](https://github.com/stablyai/orca/releases/tag/v1.4.244),
commit `b8ec5c8d170bcb9988e65de547a3a4e98b2885a9`.
The Linux amd64 Debian distribution was downloaded and extracted without running
an installer; its GitHub release digest was checked:
`8fe4c5c3696c789d2da05e43e0cc9d95af9c1ddbf907f52b9c06203b068c4c89`.
Every copied common/target file was verified against its packaged manifest.

Upstream requires Node 24.22.1. Its archive and executable hashes were checked
against the release-tagged Node pins and each target's .runtime-node marker.
The target artifact versions use upstream's own ordering/hash implementation:

- Linux x64: `0.1.0+8d7c436899f7`.
- Linux ARM64: `0.1.0+e541feac9dbf`.

The App MCP accepts UTF-8 file content. PNG/font assets and the changed native
modules therefore use generated .b64 sidecars. Image construction restores the
original bytes and checks their upstream SHA-256 values.
Large generated text/sidecar files are compressed into bounded transport parts
because MCPHub rejects the original multi-megabyte requests. Materialization
checks their reconstructed hashes before installation.
Node's architecture-
specific archive is downloaded from nodejs.org during image construction and
verified against the pinned archive hash; no download occurs on reconnect.
The local bundler cache is under .artifacts/daemon/node. This avoids publishing
large binary archives through a text-only tool or using personal Git credentials.

## Checks

The root regression suite passed, including three new materialization tests that
reject corrupt Node/native payloads and unsafe asset paths. A guest-bootstrap
regression checks the launcher's actual relative imports against files copied
into a fresh sandbox. Live scoped acceptance caught and fixed missing launcher
policy/project-name dependencies in the existing PR's legacy recipe.

Live x64 acceptance uses npm run smoke:daemon with a local-only synthetic Git
fixture. It checks daemon/Node versions, a reachable runtime, parent/child
worktrees, managed terminal output, sandbox stop/start, retained worktree IDs and
persistent identity-file hashes. Only owned disposable sandboxes are removed;
existing project sandbox identities are checked afterward. ARM64 payload bytes
were verified but not executed.

Final scoped result: PASS. Sandbox `teck-orca-f-40bfafcb16bd`, provider
`21377350-110f-444c-be3c-aa878c4a10c7`, reported Orca 1.4.244 and Node 24.22.1
before and after restart. Parent/child worktrees and persistent identity survived.
The disposable VM was removed and all three pre-existing sandbox identities were
preserved. The scoped regression suite passed 145 tests; the changed bootstrap
and materialization checks also passed after the dependency fix.

The Windows desktop is still the user's installed 1.4.237. GUI acceptance after
the user's desktop update is not claimed. Existing project runtimes were left
running/stopped as found; this package does not silently replace their data.
