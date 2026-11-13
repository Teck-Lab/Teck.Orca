# Runtime upgrade validation

The official stable release APIs and npm's latest dist-tag identify
[Orca 1.4.258](https://github.com/stablyai/orca/releases/tag/v1.4.258) and
[OMP 18.20.0](https://github.com/can1357/oh-my-pi/releases/tag/v18.20.0).
The runtime target, compatibility daemon bundle, OMP image defaults and version
checks now use these releases. Official CLI, orchestration and environment guides
were refreshed from the extracted 1.4.258 CLI.

The official Windows distribution was extracted without installing or restarting
the desktop. Its SHA-256 matches the release API:
`39d99b0c2a90c87ea7b0bc3abcba22ab9c7cb082de68837760d207acaa0dba20`.
The bundler verifies upstream template hashes and both Linux Node executables.
Orca still pins Node 24.22.1; Bun remains 1.4.4.

Both Linux bundles were reconstructed from the Git index, including compressed
and encoded transport files. All 311 upstream common/target files per architecture
match their declared hashes. The artifact versions are
`0.1.0+288ccfe2aeba` for x64 and `0.1.0+2a4f4cb0dc19` for arm64.
The Git ignore rules now retain the distribution's bundled node_modules files.
Upstream checksum-verified files retain their exact bytes, including vendor whitespace.

An isolated OMP installation reproduced a startup failure when optional packages
were omitted: the required platform-specific pi-natives addon was missing.
The modular OMP image and sandbox maintenance installer now explicitly include
optional dependencies. OMP then reports `omp/18.20.0` under pinned Bun 1.4.4.
Its actual extension loader successfully registers Agent Office, Orca orchestration
and OmniRoute research, including the goal lifecycle and dispatch tool.

After that fix, `npm run validate` passed its isolated build, generated-asset
checks and all 336 tests. The repository's generated plugin package and recipes
were rebuilt and checked for publication.

Native SSH guest daemons remain managed by their matching desktop. This update
changes repository assets and does not replace a running desktop or guest daemon.
Docker is unavailable in this shell, so live image/sandbox smoke tests were not
run. No project sandbox, session, model configuration or credentials were changed.
