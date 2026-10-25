# Isolated Kubernetes application smoke

`worktrees.mjs` is a Linux guest acceptance driver for the real Gateway.Public
pilot. It refuses installed project IDs that do not start with
`isolated-kubernetes-`. It is not a command for a user's Orca project.

Create a mountless test VM through `scripts/kubernetes-lab.mjs`; retain its exact
provider identity and protected VM inventory. Install the checksum-pinned kind
and kubectl tools, then use the native `configureKubernetes` installer with the
project ID `isolated-kubernetes-managed-probe` and the current immutable assets.
Wait for `teck-kube status` to report Ready. Do not point tests at an existing
project sandbox or copy its credentials/configuration into the lab.

Stage a standalone current Teck.Monorepo source copy under `/tmp/teck-...`, including
uncommitted deployment/ changes, excluding .git, node_modules, .nx, bin and obj.
Initialize a synthetic local Git repository with no GitHub remote, hooks or
personal signing/auth context. The existing shared Containerfile must be present.
The source copy can be agent-owned; privileged helper Git reads trust only the
exact checkout per invocation. The fixture adds a test-only version endpoint to
these copies and makes an additional synthetic checkout. It never changes the
host application's C# files or publishes to GitHub.

Copy the driver to the verified VM and run:

```text
node /tmp/teck-kubernetes-worktrees.mjs /tmp/teck-monorepo-source
```

It checks parallel HTTPS versions, unauthenticated rejection, local Kargo
promotion/verification, a dirty source update, and ownership-safe cleanup of one
worktree. A sanitized receipt is written to `/tmp/teck-worktrees-receipt.json`.
One iteration and promotion environment remain for a cold restart test. Verify
the saved node IDs, namespace/Application/secret UIDs and immutable image digest
before/after stopping only this recorded test VM. The companion restart.mjs
accepts before or after plus the same source-copy path and verifies those identities. Start it and exercise the
installed agent interactive shell hook; wait for its new boot to reach Ready
without a manual ensure/start command. HTTPS must still serve alpha-dirty in
iteration and alpha in promotion. Remove only the exact test VM after saving
receipts. Private kubeconfigs/CA keys stay inside that disposable VM.

The earlier weighted-canary compatibility fixture and results are described in
`docs/validation-local-kubernetes-2026-10-25.md`. This driver uses the normal
application strategy; it does not replace that explicit traffic-split/failure test.
