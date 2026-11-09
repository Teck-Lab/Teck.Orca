import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { desktopRpc, desktopProfile } from './orca-desktop-rpc.mjs';

const sourceRoot = () => join(homedir(), '.teck-orca-native-ssh');
export function projectSshAlias(projectId) {
  if (typeof projectId !== 'string' || !projectId.trim() || projectId !== projectId.trim() || /[\r\n\0]/.test(projectId)) throw Error('Invalid sandbox project identity');
  return `teck-orca-ssh-${createHash('sha256').update(projectId).digest('hex').slice(0, 12)}.sbx`;
}
export async function findPersistentProjectHost(projectId, { rpc = desktopRpc } = {}) {
  const alias = projectSshAlias(projectId), result = await rpc('ssh.listEditableTargets');
  if (!Array.isArray(result.targets)) throw Error('Cannot verify saved sandbox SSH hosts');
  const matches = result.targets.filter(t => t.host === alias && t.configHost === alias && t.port === 22 && t.username === '_default_user_');
  if (matches.length > 1) throw Error('Multiple persistent SSH hosts already claim this project sandbox');
  return matches[0] ?? null;
}
export async function ensurePersistentProjectHost(project, { rpc = desktopRpc, stateRoot = sourceRoot() } = {}) {
  const alias = projectSshAlias(project.projectId), folder = join(stateRoot, alias.slice(0, -4));
  const statePath = join(folder, 'state.json');
  if (lstatSync(folder).isSymbolicLink() || lstatSync(statePath).isSymbolicLink()) throw Error('Unsafe sandbox SSH ownership path');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (state.version !== 1 || state.projectId !== project.projectId || state.sandboxId !== project.id || state.sandboxName !== project.name ||
      state.sandboxName + '.sbx' !== alias || state.projectRoot !== '/home/agent/project' || state.phase !== 'ready') throw Error('Sandbox SSH ownership changed');
  const status = await rpc('status.get');
  if (status.desktopWindowStatus !== 'available' && status.desktopWindowStatus !== 'blocked') throw Error('Sandbox SSH registration needs the Orca desktop');
  if (!status.capabilities?.includes('ssh.target-management.v1')) throw Error('Update Orca to enable sandbox SSH registration');
  let target = await findPersistentProjectHost(project.projectId, { rpc });
  const marker = join(folder, 'ssh-target.json');
  if (existsSync(marker)) {
    if (lstatSync(marker).isSymbolicLink()) throw Error('Unsafe sandbox SSH target record');
    const saved = JSON.parse(readFileSync(marker, 'utf8'));
    if (saved.version !== 1 || saved.projectId !== project.projectId || saved.targetId !== target?.id)
      throw Error('Sandbox SSH registration changed; retained its ownership record');
  }
  if (!target) {
    const added = await rpc('ssh.addTarget', { target: { label: `${state.displayName} sandbox`, configHost: alias, host: alias,
      port: 22, username: '_default_user_', allowRemoteCliControl: true } });
    target = added.target;
    if (!target?.id || target.host !== alias) throw Error('Cannot verify registered sandbox SSH target');
  }
  mkdirSync(folder, { recursive: true });
  const temporary = marker + '.' + process.pid + '.tmp';
  writeFileSync(temporary, JSON.stringify({ version: 1, projectId: project.projectId, sandboxId: project.id, targetId: target.id }) + '\n', { mode: 0o600 });
  renameSync(temporary, marker);
  const current = await rpc('ssh.getState', { targetId: target.id });
  let connection = current.state ?? current;
  // Automatic connect respects cancelled sign-in and uses Docker's existing SSH
  // configuration. Orca owns its daemon and the durable host registration.
  if (connection.status !== 'connected') {
    const connected = await rpc('ssh.connect', { targetId: target.id, automatic: true }, { timeoutMs: 120_000 });
    connection = connected.state ?? connected;
  }
  if (connection.status !== 'connected') throw Error('Persistent sandbox SSH target has not connected yet');
  return { targetId: target.id, label: target.label, connection };
}
// Retire only our proven bootstrap aliases through Orca's local-only unlink
// operation. Never stop the shared server or write Orca's private stores.
export async function retireBootstrapConnections(project, host, { run, profile = desktopProfile(), cli = process.env.ORCA_CLI_COMMAND || 'orca' } = {}) {
  if (!run) return true;
  const canonicalId = host?.connection?.managedServer?.environmentId;
  if (!canonicalId) return false;
  const file = join(profile, 'orca-ephemeral-vm-runtimes.json');
  if (!existsSync(file)) return true;
  if (lstatSync(file).isSymbolicLink() || lstatSync(file).size > 1024 * 1024) throw Error('Invalid bootstrap connection inventory');
  const records = JSON.parse(readFileSync(file, 'utf8')).runtimes;
  if (!Array.isArray(records)) throw Error('Invalid bootstrap connection inventory');
  const owned = records.filter(r => r.recipeId === 'teck-native-ssh-project' && r.connectionMode === 'ssh' && r.status === 'running' &&
    r.sshTargetId === `runtime-ssh-${r.id}` && r.recipeResult?.userData?.instanceId === r.id &&
    r.recipeResult.userData.projectId === project.projectId && r.recipeResult.userData.sandboxName === project.name &&
    r.recipeResult.userData.sandboxId === project.id && r.runtimeEnvironmentId !== canonicalId);
  if (!owned.length) return true;
  const response = JSON.parse(await run(cli, ['environment', 'list', '--json']));
  if (!response.ok || !Array.isArray(response.result?.environments)) throw Error('Cannot verify desktop connections');
  const environments = response.result.environments, canonical = environments.find(e => e.id === canonicalId && e.orcadDeployment?.sshTargetId === host.targetId);
  if (!canonical?.runtimeId) return false;
  const call = async (args, id) => {
    const value = JSON.parse(await run(cli, [...args, '--environment', id, '--json']));
    if (!value.ok || value._meta?.runtimeId !== canonical.runtimeId || value.result?.truncated) throw Error('Connection verification changed');
    return value.result;
  };
  const snapshot = async id => {
    const terminals = await call(['terminal', 'list', '--limit', '1000'], id);
    if (terminals.totalCount !== 0 || !Array.isArray(terminals.terminals) || terminals.terminals.length) return null;
    const worktrees = await call(['worktree', 'list', '--limit', '10000'], id);
    if (!Array.isArray(worktrees.worktrees)) throw Error('Cannot verify retained worktrees');
    return JSON.stringify(worktrees.worktrees.map(w => ({ id: w.id, path: w.path, branch: w.branch })).sort((a, b) => a.id.localeCompare(b.id)));
  };
  for (const record of owned) {
    const alias = environments.find(e => e.id === record.runtimeEnvironmentId && e.orcadDeployment?.sshTargetId === record.sshTargetId);
    if (!alias) continue;
    if (alias.runtimeId !== canonical.runtimeId) return false;
    const a = await snapshot(canonicalId), b = await snapshot(alias.id);
    if (a === null || b === null || a !== b) return false;
    const forgotten = JSON.parse(await run(cli, ['environment', 'forget', '--environment', alias.id, '--yes', '--json']));
    if (!forgotten.ok || forgotten.result?.outcome !== 'forgotten' || forgotten.result.environmentId !== alias.id) return false;
  }
  return true;
}
export function createProjectHostManager({ ensure = ensurePersistentProjectHost, retire = retireBootstrapConnections, run, log = () => {} } = {}) {
  const pending = new Map(), done = new Set();
  return { sync(projects) {
    for (const p of projects) {
      if (p.state !== 'running' || done.has(p.id) || pending.has(p.id)) continue;
      const task = ensure(p).then(async host => { if (await retire(p, host, { run })) { done.add(p.id); log(`Persistent sandbox SSH host ready for ${p.title}`); } })
        .catch(() => log(`Persistent sandbox SSH host unavailable for ${p.title}; retained existing connections`))
        .finally(() => pending.delete(p.id));
      pending.set(p.id, task);
    }
    return Promise.allSettled([...pending.values()]);
  } };
}
