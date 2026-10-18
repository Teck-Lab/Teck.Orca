# Full feature toolkit validation

Plugin v0.4.6 restores the complete toolset from the standalone image into the active v3 workload kit, including the exact pinned shell-docker base. SDK trees are archived at build time and expanded during fresh provisioning to stay below Docker?s 250,000 path-component inventory limit. No SDK files or official Orca skills were removed or edited.

Verified in a disposable feature sandbox on Windows/Linux amd64, as agent UID 1000:

- .NET SDK 10.0.401: generated, built and ran a C# console application.
- Node v22.22.1, Bun 1.4.2, OMP omp/18.8.7, TypeScript 5.9.3: installed; TypeScript strict typecheck passed; Bunx available.
- C++ static binary, Go (go version go1.26.0 linux/amd64) and Java (javac 25.0.4) compiled and executed.
- Python executed; pip and uv 0.9.26 were available.
- Docker Engine 29.7.2 built a scratch image and ran its static binary without network; Compose and Buildx commands worked.
- All 15 primary language servers returned valid LSP initialize capabilities: typescript-language-server, biome, vscode-html-language-server, vscode-css-language-server, vscode-json-language-server, vscode-eslint-language-server, tailwindcss-language-server, pyright-langserver, bash-language-server, yaml-language-server, docker-langserver, marksman, terraform-ls, helm_ls, omnisharp.
- Google Chrome 153.0.8010.36; Playwright Chromium, agent-browser, Git/LFS/GPG/GitHub CLI and Next.js DevTools MCP were available. The image build?s headless browser interaction/screenshot probe passed.
- Bundled guest Orca daemon started and returned the feature recipe?s pairing result.
- 32 existing plugin/lifecycle regression tests passed; generated recipe check and installed Orca plugin-loader validation passed.
- All 12 official Orca guide hashes matched their original catalogue.

Runtime release: `281bc7d8faf218a06b331f135e65bb395e0b68e3d92dad0474e3b3f9e8a043ba`. Local report: `.artifacts/smoke/teck-orca-devtools-c3738022-c6b3-4057-abb3-9161d5632a40/result.json` (ignored). Only disposable test sandboxes and unused kit-builder cache were cleaned up. The existing user feature was neither repaired nor upgraded.

Native ARM archives and the source base are architecture-aware; this live test covered amd64. Linux ARM uses native Chromium for the Chrome-compatible command names.
