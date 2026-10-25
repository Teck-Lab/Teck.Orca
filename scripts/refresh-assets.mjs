// Canonical line endings keep approved runtime hashes stable across host OSes.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryRoot, sha256 } from './release.mjs';

function files(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name), name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected asset symlink: ${path}`);
    return entry.isDirectory() ? files(path, name + '/') : [{ path, name }];
  });
}
for (const folder of ['runtime', 'sandbox/image']) {
  for (const { path, name } of files(join(repositoryRoot, folder))) {
    // Upstream daemon bytes are signed by its launcher/template manifest.
    if (folder === 'runtime' && name.startsWith('kits/orcad/bundle/')) continue;
    const raw = readFileSync(path), text = raw.toString('utf8');
    if (!raw.includes(0) && Buffer.from(text).equals(raw) && text.includes('\r\n')) {
      writeFileSync(path, text.replaceAll('\r\n', '\n'));
    }
  }
}
// The active toolkit lock owns SDK/LSP pins. Keep the kit's public inventory
// and installation check in sync so a version update has one source of truth.
const toolkit = JSON.parse(readFileSync(join(repositoryRoot, 'runtime/kits/workload/devtools.json'), 'utf8'));
const workloadPath = join(repositoryRoot, 'runtime/kits/workload/workload.yaml');
const workload = readFileSync(workloadPath, 'utf8')
  .replace(/"dotnet@[^"\n]+"/, `"dotnet@${toolkit.dotnet.version}"`)
  .replace(/"typescript@[^"\n]+"/, `"typescript@${toolkit.npm.typescript}"`)
  .replace(/"kind@[^"\n]+"/, `"kind@${toolkit.native.kind.version}"`)
  .replace(/"kubectl@[^"\n]+"/, `"kubectl@${toolkit.native.kubectl.version}"`)
  .replace(/(test "\$\(kind version \| cut -d ' ' -f 2\)" = "v)[^"]+"/, `$1${toolkit.native.kind.version}"`)
  .replace(/(clientVersion.gitVersion'\)" = "v)[^"]+"/, `$1${toolkit.native.kubectl.version}"`)
  .replace(/(test "\$\(dotnet --version\)" = ")[^"]+"/, `$1${toolkit.dotnet.version}"`);
writeFileSync(workloadPath, workload);
// The optional standalone image shares the same Kubernetes installer and pins.
for (const name of ['devtools.json', 'kubernetes-tools.mjs']) writeFileSync(join(repositoryRoot, 'sandbox/image', name), readFileSync(join(repositoryRoot, 'runtime/kits/workload', name)));
const catalogue = files(join(repositoryRoot, 'runtime/omp/skills')).map(({ name, path }) => ({ name, sha256: sha256(readFileSync(path)) })).sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(repositoryRoot, 'runtime/omp/skill-snapshots.json'), JSON.stringify({ source: 'Teck.Paseo import with Orca lifecycle skills', files: catalogue }, null, 2) + '\n');
console.log('Refreshed canonical runtime assets and skill catalogue.');
