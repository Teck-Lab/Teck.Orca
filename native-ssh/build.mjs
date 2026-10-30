import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
export function runtimeFiles(repositorySource = repository) {
  const root = join(repositorySource, 'native-ssh');
  const projects = JSON.parse(readFileSync(join(root, 'projects.json'), 'utf8'));
  if (!Array.isArray(projects) || !projects.length || projects.length > 16) throw Error('Configure 1–16 projects');
  projects.forEach(validateProject);
  if (new Set(projects.map(project => project.id)).size !== projects.length) throw Error('Duplicate project ID');
  const files = { 'projects.json': json(projects) };
  function copyTree(source, target) {
    for (const relative of walk(source)) files[target + '/' + relative] = readFileSync(join(source, relative));
  }
  for (const name of ['provider.mjs', 'configuration.mjs', 'system.mjs', 'recipe.mjs','kubernetes.mjs']) files[`src/${name}`] = readFileSync(join(root, 'src', name));
  copyTree(join(repositorySource,'runtime/kubernetes'),'assets/kubernetes');
  copyTree(join(repositorySource, 'runtime/omp'), 'assets/omp');
  for (const kit of ['workload', 'omniroute', 'mcphub']) copyTree(join(repositorySource, 'runtime/kits', kit), `assets/kits/${kit}`);
  for (const file of ['project-name.mjs', 'omp-launch.mjs', 'omp-launch-policy.mjs', 'omp-session.mjs', 'omp-session-extension.ts']) files[`assets/${file}`] = readFileSync(join(repositorySource, 'runtime', file));
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
  files['assets/omp/skill-snapshots.json'] = json({ source: 'Teck.Orca shared OMP policy, native SSH', files: skills });
  files['assets/provenance.json'] = json({ schemaVersion: 1, files: Object.fromEntries(Object.entries(files)
    .filter(([name]) => name.startsWith('assets/')).map(([name, bytes]) => [name, hash(bytes)])) });
  return files;
}
// Internal runtime builder; plugin registration and installation live at the repository root.
export function nativeRecipe(repositorySource = repository) {
  const { digest } = snapshot(runtimeFiles(repositorySource));
  const recipe = { schemaVersion: 1, id: 'teck-native-ssh-project', name: 'Teck OMP Project',
    description: 'One persistent project sandbox with OMP and optional local KIND. Created on first use, shared by later worktrees, connected automatically over Docker SSH. Worktree deletion retains the sandbox.',
    ...Object.fromEntries(['create', 'suspend', 'resume'].map(mode => [mode, recipeCommand(digest, mode)])), destroy: 'none' };
  for (const mode of ['create', 'suspend', 'resume']) if (Buffer.byteLength(recipe[mode]) >= 8191) throw Error('Native SSH launcher exceeds Windows command limit');
  return recipe;
}
