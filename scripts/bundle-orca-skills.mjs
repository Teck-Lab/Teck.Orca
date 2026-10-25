// Explicit refresh from the installed Orca CLI; normal builds use the snapshot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { command } from './lifecycle.mjs';
import { repositoryRoot, sha256 } from './release.mjs';

const executable = process.env.ORCA_CLI_COMMAND || (process.env.ORCA_DEV_REPO_ROOT ? 'orca-dev' : process.platform === 'linux' ? 'orca-ide' : 'orca');
const orcaVersion = command(executable, ['--version']).trim();
const snapshots = [];
for (const name of ['orca-cli', 'orchestration']) {
  const guide = JSON.parse(command(executable, ['skills', 'get', name, '--full', '--json'], { timeout: 30_000 }));
  if (guide.name !== name || guide.full !== true || typeof guide.markdown !== 'string') throw new Error(`Incomplete Orca guide: ${name}`);
  const boundary = guide.markdown.indexOf('# Bundled references');
  if (boundary < 0) throw new Error(`Missing Orca references: ${name}`);
  const destination = join(repositoryRoot, 'runtime', 'omp', 'skills', name);
  mkdirSync(destination, { recursive: true });
  const write = (path, text) => {
    const canonical = text.replaceAll('\r\n', '\n').trimEnd() + '\n';
    mkdirSync(join(destination, path, '..'), { recursive: true });
    writeFileSync(join(destination, path), canonical);
    snapshots.push({ skill: name, path, sha256: sha256(canonical) });
  };
  write('SKILL.md', guide.markdown.slice(0, boundary));
  const pieces = guide.markdown.slice(boundary).split(/<!-- bundled-reference: ([^\n]+) -->\s*\n/g);
  for (let i = 1; i < pieces.length; i += 2) {
    const path = pieces[i].trim();
    if (!/^references\/[a-z0-9-]+\.md$/.test(path)) throw new Error(`Unsafe guide reference: ${path}`);
    write(path, pieces[i + 1]);
  }
  console.log(`Bundled ${name} and its references.`);
}
writeFileSync(join(repositoryRoot, 'runtime', 'omp', 'orca-guides.json'), JSON.stringify({ source: 'Installed Orca CLI: skills get --full --json', orcaVersion, files: snapshots }, null, 2) + '\n');
