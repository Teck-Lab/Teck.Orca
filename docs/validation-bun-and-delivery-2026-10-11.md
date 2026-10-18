# Bun cache permissions and delivery defaults

Version: Teck.Orca 0.4.2. Host: Windows; Orca 1.4.224; OMP 18.8.7;
Bun 1.4.2.

## Bun diagnosis and verification

Read-only inspection found `/tmp` and the feature checkout writable by `agent`,
but `/home/agent/.bun` and its install cache owned by root. In a separate
disposable sandbox, both default `bun install` and a custom `TMPDIR` reproduced
`bun is unable to write files to tempdir: EACCES`. Changing only
`BUN_INSTALL_CACHE_DIR` to an agent-writable directory succeeded.
The default cache path and override are documented in
[Bun's cache documentation](https://bun.com/docs/pm/global-cache).

Workload installation and recipe configuration now explicitly create the cache
and its parents as `agent`, then transfer cached content ownership to `agent`.
The preserved optional Docker image source applies the same ownership fix.
Provisioning probes cache and temporary-directory writes as `agent`, before
returning a ready workspace. A write failure removes only a fresh failed sandbox;
a reused feature is retained. No active user sandbox was repaired.

The reproduced sandbox passed `bun install --frozen-lockfile --ignore-scripts`
with default and custom temporary directories after the fix. A prefilled nested
root-owned cache file also became agent-owned. This sandbox was removed.

`npm run smoke:bun` separately provisioned a fresh feature, confirmed cache
ownership and installed `is-number@7.0.0` from a cold cache. Repeated installations
with `--frozen-lockfile --ignore-scripts`, using default and custom temporary
directories, both passed. Only the generated test sandbox was removed.
This tests Bun dependency installation, not arbitrary repository install scripts
or the user's failing-test repair.

## Delivery policy

Two previous Teck instructions explained the reported behavior: workflow loading
was required only for multi-task delivery, and publication required a separate
request. The user selected mandatory tracked planning and sub-issues for fixes,
with research/planning permitted in the parent worktree and PR delivery automatic
for work in their own repositories.

Teck's shared rules and workflow skills now require read-only diagnosis, a
verified GitHub parent plan and at least one native execution sub-issue before
implementation. Planning can use OMP's configured planning role/internal helpers
or separate Orca terminals in that same parent worktree. Execution uses a visible
parent-linked Orca child and executor,
even for one sub-issue. Assigned workers consume the existing plan instead of
recursively creating more plans or competing PRs. The lead reviews, integrates,
validates and creates/updates the canonical PR through the existing GitHub MCP
publication/signature workflow. Explicit narrower instructions still apply;
merging requires explicit authorization.

These are bundled instruction changes. The full live GitHub issue-plan,
implementation and automatic-PR sequence has not been tested end to end.
No GitHub records were created by these validation commands.

## Package and scope checks

- All 22 lifecycle, packaging and release regression tests passed, including
  Bun write-failure rollback and protection of a reused feature.
- The generated plugin is valid in the installed Orca manifest validator:
  version 0.4.2, three files, 7,958 bytes.
- All 12 official Orca guide files match their original snapshot hashes.
- No user terminal, desktop setting or active feature sandbox was changed.
- Refresh the `plugin/` package and create a new feature to load the new runtime.
  Existing feature sandboxes keep their installed rules.
