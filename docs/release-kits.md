# Releasing the catalogue and sandbox kits

The repository has two release products: the Orca plugin package and the Docker
Sandboxes v3 workload composed from reusable kits. Publishing images does not
update an existing sandbox, and this workflow does not load or restart a plugin.

## Validate source without changing the installed plugin

Run `npm run validate` for the full source checks. It copies the relevant source
and required dotfiles into a fresh temporary directory, generates runtime assets,
recipes and the plugin there, then runs `npm run check` and `npm test` in that
copy. CI uses the same command. The watched `plugin/`, existing recipes, Git
metadata, local artifacts and installed dependencies are never copied or changed.
The generated source is authoritative; a stale development package is not a
source-test failure. Portable release candidates have their own integrity checks.

The temporary copy is removed after success or failure. Use
`npm run validate -- --keep` to retain it for diagnosis; the command prints its
path. This does not deploy, provision a sandbox, run live smoke tests or restart
Orca. `npm run build` still writes the development package and should only be
used when deliberately preparing that package for installation.

## Build a candidate

After the implementation and version changes are merged, create an exact
`vX.Y.Z` source tag. The tag must match both `package.json` and the root
`orca-plugin.json`. In GitHub Actions, run **Release sandbox kits** and select
that tag. A branch run or a run in another repository is rejected before any
publication. Ordinary pushes and pull requests do not publish images.

The workflow uses the repository's `GITHUB_TOKEN` for GHCR and GitHub OIDC for
Cosign. It does not require a personal token, signing key, or host Git account.
The publish jobs need `packages: write` and `id-token: write`; all jobs have only
read access to repository contents. Existing GHCR packages must grant this
repository Actions access. Package visibility remains an organization decision;
private packages require configured Docker Sandboxes registry credentials.

The workflow performs these steps:

1. Stage build contexts from the canonical kit and runtime sources.
2. Build and publish each component for Linux amd64 and arm64, recording the
   image digest reported by Buildx. The frontend is `docker/sandbox-kit:3`, not a
   regular Dockerfile build of the descriptor.
3. Sign and verify each immutable image. Export both platform filesystems with
   Buildx's tar exporter and inventory contents, modes, ownership and links
   without extracting the archive. The export uses a single `FROM` instruction
   against the immutable image, with no `RUN` steps. Container create/export is
   unsuitable here: Docker injects runtime device and hostname files that are
   not part of the image. Direct image export keeps genuine system files in the
   collision audit without excluding whole paths.
4. Reject differing files at the same path, including collisions with the base
   workload. Shared directories and byte/type/mode/ownership-identical files
   are allowed. Unexpected collisions must be resolved in component sources,
   not hidden by rearranging the set.
5. Generate a set descriptor containing only published references and the
   recorded digests. Buildx checks declared dependencies and feature providers.
6. Publish and sign the combined workload, then create `kit-release.json` from
   the real component/set receipts and matching successful filesystem audit.
7. Package the portable plugin with that lock and upload a release-candidate
   artifact containing the build receipts, file audit and source checksum
   manifest. No catalogue entry or repository commit is manufactured.

The component references are
`ghcr.io/teck-lab/teck-orca/<component>:X.Y.Z`; the combined workload is
`ghcr.io/teck-lab/teck-orca:X.Y.Z`. Consumers use the lock's digest in addition to
the versioned reference. Re-running a tag can rebuild mutable upstream inputs;
it does not change an already committed plugin's digest lock. Prefer a new
version for a changed candidate.

## Validate and promote

Download the candidate artifact and test the portable plugin and pinned kit in
a separate disposable Docker Sandbox. Image builds and filesystem audits alone
do not prove Docker Sandboxes lifecycle, proxy-managed credentials, native SSH,
KIND/K3s startup, OMP sessions, or Office reporting. Record those results before
promoting the candidate. Do not test an update by replacing the active project
sandbox.

Commit the candidate's portable plugin folder and the real kit lock to the
repository using the authorized GitHub App workflow. The package must be in the
exact Git commit that the catalogue references. Then run the catalogue generator
against that clean committed folder:

```text
node scripts/update-catalogue.mjs --plugin <committed-plugin-folder> --output orca-catalog.json
```

The generator uses Orca's installed `plugin release-entry` command and refuses
uncommitted package content. Commit the generated catalogue separately: it
points to the preceding package commit, avoiding a self-referential commit hash.
The initial empty catalogue is intentional until this first verified package
exists. Users install/update through Orca's catalogue GUI; these release steps
are maintainer operations, not commands users need to run on a new machine.

## Local preparation commands

These commands stage data only; they do not publish, provision, or restart:

```text
node scripts/kit-source.mjs --out .artifacts/kits
node scripts/kit-release.mjs compose --receipts <receipt-folder> --out .artifacts/set/teck-orca.yaml
node scripts/kit-release.mjs audit --receipts <receipt-folder> --inventories <inventory-folder> --out .artifacts/filesystem-audit.json
node scripts/kit-release.mjs lock --receipts <receipt-folder> --set <set-receipt.json> --audit .artifacts/filesystem-audit.json --out .artifacts/kit-release.json
node scripts/package-portable-plugin.mjs --output .artifacts/plugin --kit-release .artifacts/kit-release.json
```

There is deliberately no example production digest: only actual Buildx metadata
may supply one. `kit-release.mjs record` reads `containerimage.digest` from its
`--metadata` JSON file or the `BUILD_METADATA` environment variable supplied by
the build action.

## Upstream contracts

- [Docker v3 distribution](https://docs.docker.com/ai/sandboxes/customize/author/distribute/):
  Buildx publishes OCI kits; v1/v2 pack/push commands are not the v3 pipeline.
- [Kit set composition](https://docs.docker.com/ai/sandboxes/customize/author/kit-sets/):
  published component references, digest pins, and explicit file-conflict review.
- [Buildx tar export](https://docs.docker.com/reference/cli/docker/buildx/build/#tar):
  export the image root filesystem directly to a streaming tar archive.
- [GitHub GHCR authentication](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images):
  repository token authentication and job-scoped permissions.
- [Cosign installer](https://github.com/sigstore/cosign-installer): verified tool
  installation and GitHub OIDC signing. Docker's kit signatures are
  Cosign-compatible.
