import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateProject } from './src/provider.mjs';
import { recipeCommand, snapshot } from './release.mjs';

export const root = dirname(fileURLToPath(import.meta.url));
const repository = dirname(root);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function walk(folder, prefix = '') {
  return readdirSync(folder).sort().flatMap(name => {
    const path = join(folder, name), stat = lstatSync(path), relative = prefix + name;
    if (stat.isSymbolicLink()) throw Error(`Package symlink is forbidden: ${relative}`);
    if (stat.isDirectory()) return walk(path, relative + '/');
    if (!stat.isFile()) throw Error(`Unsupported package entry: ${relative}`);
    return [relative];
  });
}
export function runtimeFiles() {
  const projects = JSON.parse(readFileSync(join(root, 'projects.json'), 'utf8'));
  if (!Array.isArray(projects) || !projects.length || projects.length > 16) throw Error('Configure 1–16 projects');
  projects.forEach(validateProject);
  if (new Set(projects.map(project => project.id)).size !== projects.length) throw Error('Duplicate project ID');
  const files = { 'projects.json': json(projects) };
  function copyTree(source, target) {
    for (const relative of walk(source)) files[target + '/' + relative] = readFileSync(join(source, relative));
  }
  for (const name of ['provider.mjs', 'configuration.mjs', 'system.mjs', 'recipe.mjs','kubernetes.mjs']) files[`src/${name}`] = readFileSync(join(root, 'src', name));
  copyTree(join(repository,'runtime/kubernetes'),'assets/kubernetes');
  copyTree(join(repository, 'runtime/omp'), 'assets/omp');
  for (const kit of ['workload', 'omniroute', 'mcphub']) copyTree(join(repository, 'runtime/kits', kit), `assets/kits/${kit}`);
  for (const file of ['project-name.mjs', 'omp-launch.mjs', 'omp-launch-policy.mjs', 'omp-session.mjs', 'omp-session-extension.ts']) files[`assets/${file}`] = readFileSync(join(repository, 'runtime', file));
  files['assets/kits/workload/context.md'] = readFileSync(join(root, 'context.md'));
  files['assets/kits/workload/workload.yaml'] = Buffer.from(files['assets/kits/workload/workload.yaml'].toString('utf8')
    .replace('displayName: Teck Orca feature', 'displayName: Teck Orca native SSH project'));
  // Canonical LF is needed for guest shell scripts even on a CRLF checkout.
  for (const [name, bytes] of Object.entries(files)) {
    if (bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes)) throw Error(`Unexpected binary asset: ${name}`);
    files[name] = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
  }
  const skills = Object.entries(files).filter(([name]) => name.startsWith('assets/omp/skills/'))
    .map(([name, bytes]) => ({ name: name.slice('assets/omp/skills/'.length), sha256: hash(bytes) })).sort((a, b) => a.name.localeCompare(b.name));
  files['assets/omp/skill-snapshots.json'] = json({ source: 'Teck.Orca shared OMP policy, native SSH preview', files: skills });
  files['assets/provenance.json'] = json({ schemaVersion: 1, files: Object.fromEntries(Object.entries(files)
    .filter(([name]) => name.startsWith('assets/')).map(([name, bytes]) => [name, hash(bytes)])) });
  return files;
}
export function packageFiles() {
  const { digest } = snapshot(runtimeFiles());
  const version = JSON.parse(readFileSync(join(root, 'package.json'))).version;
  const manifest = {
    manifestVersion: 1, id: 'teck-native-ssh-preview', publisher: 'teck-lab',
    name: 'Teck OMP Native SSH Preview', version,
    description: 'Run on recipe: create or reuse one Docker Sandbox per project, connect automatically over native Docker SSH, and let Orca manage its daemon and linked worktrees.',
    engines: { orca: '>=1.4.237' }, pluginApi: 1,
    contributes: { vmRecipes: [{ path: 'recipes/native-ssh-project.json' }] }, capabilities: [],
  };
  const recipe = { schemaVersion: 1, id: 'teck-native-ssh-project', name: 'Teck OMP SSH Project (Preview)',
    description: 'One persistent project sandbox with OMP. Created on first use, shared by later worktrees, connected automatically over Docker SSH. Worktree deletion retains the sandbox.',
    ...Object.fromEntries(['create', 'suspend', 'resume'].map(mode => [mode, recipeCommand(digest, mode)])), destroy: 'none' };
  for (const mode of ['create', 'suspend', 'resume']) if (Buffer.byteLength(recipe[mode]) >= 8191) throw Error('Preview launcher exceeds Windows command limit');
  return { 'orca-plugin.json': json(manifest), LICENSE: readFileSync(join(repository, 'LICENSE')),
    'recipes/native-ssh-project.json': json(recipe) };
}
export function build({ destination = join(root, 'plugin'), check = false } = {}) {
  const files = packageFiles();
  const bytes = Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0);
  if (bytes > 50 * 1024 ** 2 || Object.keys(files).length > 1500) throw Error('Preview exceeds Orca plugin limits');
  if (!check) {
    // Only remove the obsolete generated v0.1.0 command-based preview package.
    // walk rejects symlinks and every file remains inside this explicit output root.
    if (existsSync(join(destination, 'orca-plugin.json'))) {
      const old = JSON.parse(readFileSync(join(destination, 'orca-plugin.json')));
      if (old.id !== 'teck-native-ssh-preview') throw Error('Refusing to replace another plugin');
      for (const name of walk(destination)) if (!files[name]) {
        if (!/^(?:assets\/|src\/|README\.md$|projects\.json$)/.test(name)) throw Error(`Unexpected output file: ${name}`);
        unlinkSync(join(destination, name));
      }
    }
    for (const [name, bytes] of Object.entries(files)) {
      const path = join(destination, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
    }
  }
  if (!existsSync(destination)) throw Error('Run npm run build --prefix native-ssh first');
  const actual = walk(destination);
  if (JSON.stringify(actual.sort()) !== JSON.stringify(Object.keys(files).sort())) throw Error('Unexpected files in preview package');
  for (const [name, bytes] of Object.entries(files)) if (!readFileSync(join(destination, name)).equals(bytes)) throw Error(`Preview package is stale: ${name}`);
  return { destination, files: actual.length, bytes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = build({ check: process.argv.includes('--check') });
  console.log(`${process.argv.includes('--check') ? 'Checked' : 'Built'} ${result.destination}: ${result.files} files, ${result.bytes} bytes. No sandbox or Orca connection was created.`);
}
