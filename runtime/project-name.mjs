// Naming metadata only. Never move checkouts, change workspace IDs or write
// Orca's private store. Both runtime modes use the public project setup API.
import { execFile } from 'node:child_process';
import { basename, posix, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const validName = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 120 && !/[\r\n\0]/.test(value);
export function projectNameFromRemote(remote) {
  let path;
  if (/^https?:\/\//i.test(remote)) {
    const url = new URL(remote);
    if (url.username || url.password) throw Error('A credential-free repository URL is required');
    path = url.pathname;
  } else if (/^git@[^\s:]+:.+/.test(remote)) path = remote.slice(remote.indexOf(':') + 1);
  else if (/^ssh:\/\//i.test(remote)) {
    const url = new URL(remote);
    if (url.password) throw Error('A credential-free repository URL is required');
    path = url.pathname;
  } else throw Error('Cannot determine the project name from this remote URL');
  const name = decodeURIComponent(posix.basename(path.replace(/\/+$/, '')).replace(/\.git$/i, ''));
  if (!validName(name)) throw Error('Invalid repository display name');
  return name;
}
export async function ensureProjectName({ projectId, projectRoot, displayName, run, register = false }) {
  if (typeof projectId !== 'string' || !projectId.trim() || !validName(displayName) || !projectRoot?.startsWith('/')) throw Error('Project identity, root and display name are required');
  const list = async () => {
    const result = await run(['project', 'setups', '--project', projectId, '--host', 'local', '--json']);
    if (!Array.isArray(result?.setups)) throw Error('Cannot verify Orca project setups');
    return result.setups.filter(s => s.projectId === projectId && s.path === projectRoot && s.hostId === 'local' && s.repoId);
  };
  let matches = await list();
  if (!matches.length && register) {
    await run(['repo', 'add', '--path', projectRoot, '--json']);
    matches = await list();
  }
  if (matches.length > 1) throw Error('Project setup is ambiguous; no name was changed');
  if (!matches.length) return { status: 'not-registered' };
  const setup = matches[0];
  if (setup.displayName === displayName) return { status: 'unchanged', repoId: setup.repoId };
  // Preserve an intentional user rename. Repair only the checkout-derived label.
  if (setup.displayName && setup.displayName !== basename(projectRoot)) return { status: 'custom', repoId: setup.repoId };
  await run(['project', 'setup-update', '--setup', setup.id, '--host', 'local', '--display-name', displayName, '--json']);
  return { status: 'updated', repoId: setup.repoId, displayName };
}
export async function preserveProjectName({ env = process.env, cli, register = false, exec = execute } = {}) {
  if (!env.TECK_ORCA_PROJECT_ID) return { status: 'no-project' };
  if (!cli) {
    // A PATH-resolved Orca is safe only inside a real managed terminal. Outside
    // one, Linux's `orca` could be the desktop screen reader.
    if (!/^[^:\s]+:[a-f0-9-]{36}$/i.test(env.ORCA_PANE_KEY ?? '') || !env.ORCA_WORKTREE_ID) return { status: 'no-pane' };
    cli = [env.ORCA_CLI_COMMAND || 'orca'];
  }
  const projectRoot = '/home/agent/project';
  const options = { env, encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 };
  const displayName = env.TECK_ORCA_PROJECT_NAME || projectNameFromRemote(
    (await exec('git', ['-C', projectRoot, 'remote', 'get-url', 'origin'], options)).stdout.trim());
  const run = async args => {
    const result = await exec(cli[0], [...cli.slice(1), ...args], options);
    const response = JSON.parse(result.stdout);
    if (!response.ok) throw Error(response.error?.message || 'Orca project name update failed');
    return response.result;
  };
  return ensureProjectName({ projectId: env.TECK_ORCA_PROJECT_ID, projectRoot, displayName, register, run });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]) && process.argv[2] === '--pane') {
  preserveProjectName().catch(() => process.stderr.write('Teck: could not preserve the project display name; check Orca project metadata.\n'));
}
