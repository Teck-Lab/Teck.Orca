import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const projectStateRoot = () => process.env.TECK_ORCA_PROJECTS_DIR || join(homedir(), '.teck-orca', 'projects');
export function projectSandboxName(projectId) {
  if (typeof projectId !== 'string' || !projectId.trim() || projectId !== projectId.trim()) throw Error('A stable Orca project ID is required');
  return `teck-orca-p-${createHash('sha256').update(projectId).digest('hex').slice(0, 12)}`;
}
export function validateProject(state) {
  if (state?.schemaVersion !== 1 || state.sandboxName !== projectSandboxName(state.projectId) ||
      state.projectRoot !== '/home/agent/project' || state.transport !== 'docker-ssh' ||
      !['creating', 'ready'].includes(state.phase) || !Number.isInteger(state.port) || state.port < 20000 || state.port >= 40000 ||
      typeof state.cloneUrl !== 'string' || typeof state.displayName !== 'string' ||
      (state.phase === 'ready' && (typeof state.sandboxId !== 'string' || !state.sandboxId))) throw Error('Project sandbox ownership record is invalid');
  return state;
}
export function readProject(projectId, root = projectStateRoot()) {
  const path = join(root, projectSandboxName(projectId), 'state.json');
  if (lstatSync(path).isSymbolicLink() || lstatSync(join(root, projectSandboxName(projectId))).isSymbolicLink()) throw Error('Project state symlinks are forbidden');
  const state = validateProject(JSON.parse(readFileSync(path, 'utf8')));
  if (state.projectId !== projectId) throw Error('Project ownership mismatch');
  return state;
}
export function writeProject(state, root = projectStateRoot()) {
  validateProject(state);
  const directory = join(root, state.sandboxName);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink()) throw Error('Project state symlinks are forbidden');
  const path = join(directory, 'state.json'), temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
}
// Call under the project's lifecycle lock. Keep retired metadata for diagnosis;
// it cannot be discovered by the recovery supervisor or adopted by a new VM.
export function archiveProject(projectId, root = projectStateRoot()) {
  const state = readProject(projectId, root);
  const retired = join(root, 'retired');
  mkdirSync(retired, { recursive: true, mode: 0o700 });
  if (lstatSync(retired).isSymbolicLink()) throw Error('Retired project state symlinks are forbidden');
  const destination = join(retired, `${state.sandboxName}-${randomUUID()}`);
  renameSync(join(root, state.sandboxName), destination);
  return destination;
}
export function listProjects(root = projectStateRoot()) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory() && /^teck-orca-p-[a-f0-9]{12}$/.test(item.name) &&
    existsSync(join(root, item.name, 'state.json'))).map(item => {
    const raw = JSON.parse(readFileSync(join(root, item.name, 'state.json'), 'utf8'));
    if (item.name !== projectSandboxName(raw.projectId)) throw Error('Project directory/identity mismatch');
    return readProject(raw.projectId, root);
  }).filter(state => state.phase === 'ready');
}
