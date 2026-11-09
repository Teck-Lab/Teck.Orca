import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
// Explicit exports prevent the build image's OS, node/npm and package database
// from leaking into this mixin or shadowing the workload's files.
const files = [
  '/usr/share/dotnet', '/opt/teck-devtools', '/opt/teck-debuggers', '/usr/local/lib/omnisharp',
  '/home/agent/.local/opt/js-debug',
  ...['dotnet', 'omnisharp', 'marksman', 'terraform-ls', 'helm_ls', 'netcoredbg', ...readdirSync('/opt/teck-devtools/bin')].map(name => `/usr/local/bin/${name}`),
];
for (const source of files) {
  const destination = `/out${source}`;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
}
