import { createHash, randomUUID } from 'node:crypto';
import { existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { command, directory, quote, readJson, withLock, writeJson } from './system.mjs';
import { configureSandbox, ensureNamingHook, ensureWorkflowPolicy, nativeEnvironment } from './configuration.mjs';
import {configureKubernetes} from './kubernetes.mjs';

export const stateDirectory = () => join(homedir(), '.teck-orca-native-ssh');
export const projectRoot = '/home/agent/project';
export function sandboxName(id) {
  if (typeof id !== 'string' || !id.trim() || id.trim() !== id || /[\r\n\0]/.test(id)) throw Error('A stable project ID is required');
  return `teck-orca-ssh-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
}
export function validateProject(project) {
  sandboxName(project?.id);
  if (typeof project.name !== 'string' || !project.name.trim() || project.name.length > 120 || /[\r\n\0]/.test(project.name)) throw Error('Project name is required');
  let url;
  try { url = new URL(project.cloneUrl); } catch { throw Error('A credential-free HTTPS clone URL is required'); }
  if (url.protocol !== 'https:' || url.username || url.password || /[\s\0]/.test(project.cloneUrl) || url.search || url.hash) throw Error('Use a credential-free HTTPS clone URL');
  if (!Number.isInteger(project.cpus) || project.cpus < 1 || project.cpus > 64 || !/^\d+[gm]$/i.test(project.memory) || parseInt(project.memory) < 1) throw Error('Invalid CPU or memory limit');
  if(project.kubernetes!==undefined&&project.kubernetes!==false&&project.kubernetes!=='workspace')throw Error('Invalid Kubernetes project profile');
  return project;
}
export function readState(project, root = stateDirectory()) {
  const name = sandboxName(project.id), folder = join(root, name);
  directory(folder);
  const path = join(folder, 'state.json');
  if (!existsSync(path)) return null;
  const state = readJson(path);
  if (state.version !== 1 || state.projectId !== project.id || state.sandboxName !== name ||
      state.cloneUrl !== project.cloneUrl || state.projectRoot !== projectRoot ||
      !['creating', 'provisioning', 'configured', 'cloned', 'ready'].includes(state.phase) ||
      (state.phase !== 'creating' && (typeof state.sandboxId !== 'string' || !state.sandboxId))) throw Error('Invalid native SSH ownership record');
  return state;
}
export async function inventory(run) {
  const rows = JSON.parse(await run('sbx', ['ls', '--json']));
  if (!Array.isArray(rows) || rows.some(row => typeof row.name !== 'string' || !row.name || typeof row.id !== 'string' || !row.id) ||
      new Set(rows.map(row => row.name)).size !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Cannot verify sandbox inventory');
  return rows;
}
export async function ensureKitBuilder({ run = command, lockRoot = join(homedir(), '.teck-orca') } = {}) {
  // Share the original plugin's builder lock, never its project ownership records.
  return withLock(lockRoot, 'sbx-kit-builder', async () => {
    let row = (await inventory(run)).find(row => row.name === 'sbx-kit-builder');
    if (!row) {
      await run('sbx', ['create', '--no-progress', '--name', 'sbx-kit-builder', '--skills', 'off', '--kit-arg', 'volumeSize=40g', 'docker.io/docker/sbx-kit-builder:1']);
      row = (await inventory(run)).find(row => row.name === 'sbx-kit-builder');
    }
    if (row?.agent !== 'sbx-kit-builder') throw Error('Cannot verify the Docker kit builder');
    await run('sbx', ['run', '--detach', '--name', 'sbx-kit-builder']);
    const current = (await inventory(run)).find(row => row.name === 'sbx-kit-builder');
    if (current?.id !== row.id || current.detached !== true) throw Error('Cannot verify detached builder identity');
    const disk = await run('sbx', ['exec', '-u', 'root', 'sbx-kit-builder', 'df', '-B1', '--output=size,avail', '/var/lib/docker']);
    const match = /^\s*(\d+)\s+(\d+)\s*$/m.exec(disk);
    if (!match || Number(match[1]) < 32 * 1024 ** 3 || Number(match[2]) < 12 * 1024 ** 3) throw Error('Docker kit builder needs at least 32 GiB capacity and 12 GiB free. No project sandbox was created; inspect the builder before retrying');
  });
}

export async function prepareProject({ project, assetRoot, stateRoot = stateDirectory(), run = command,
  configure = configureSandbox, ensureBuilder = ensureKitBuilder, syncName = ensureNamingHook, syncPolicy = ensureWorkflowPolicy, startCluster=configureKubernetes, log = () => {}, recreateMissing = true, expectedSandboxId }) {
  validateProject(project);
  if (!assetRoot) throw Error('Plugin assets are required');
  const name = sandboxName(project.id), folder = join(stateRoot, name), path = join(folder, 'state.json');
  return withLock(stateRoot, name, async () => {
    await run('sbx', ['setup', 'ssh']); // Idempotent; never pass --auto-create.
    const config = await run('ssh', ['-G', `${name}.sbx`]);
    if (!/^user _default_user_\r?$/m.test(config) || !/^proxycommand .*\bssh\s+proxy\b/m.test(config)) throw Error('Docker-managed .sbx SSH configuration is unavailable');
    const rows = await inventory(run), current = rows.find(row => row.name === name);
    let state = readState(project, stateRoot);
    if (expectedSandboxId && state?.sandboxId !== expectedSandboxId) throw Error('The original sandbox identity changed; create a new workspace to use a replacement');
    if (current && !state) throw Error('An unowned sandbox uses the preview name; refusing to adopt it');
    if (current && (!state.sandboxId || current.id !== state.sandboxId)) throw Error('Sandbox provider identity changed; refusing to adopt it');
    if (state && !current) {
      if (!recreateMissing) throw Error('The original project sandbox was deleted. Create a new workspace to start fresh');
      if (rows.some(row => row.id === state.sandboxId)) throw Error('The owned sandbox exists under another name; refusing to replace it');
      const retired = directory(join(folder, 'retired'));
      renameSync(path, join(retired, `${randomUUID()}.json`));
      log('The previous sandbox was deleted. Retained its ownership record and provisioning a separate replacement.');
      state = null;
    }
    if (!current) {
      if (!recreateMissing) throw Error('The original project sandbox is missing; create a new workspace to start fresh');
      await ensureBuilder({ run });
      state = { version: 1, projectId: project.id, displayName: project.name, cloneUrl: project.cloneUrl,
        sandboxName: name, projectRoot, cpus: project.cpus, memory: project.memory, phase: 'creating', sandboxId: null };
      writeJson(path, state);
      const env = Object.entries(nativeEnvironment(project)).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
      await run('sbx', ['create', '--no-progress', '--name', name, '--cpus', String(project.cpus), '--memory', project.memory,
        '--skills', 'off', ...env, join(assetRoot, 'assets/kits/workload'), '--kit', join(assetRoot, 'assets/kits/omniroute'),
        '--kit', join(assetRoot, 'assets/kits/mcphub')],project.kubernetes==='workspace'?{env:{DOCKER_SANDBOXES_DOCKER_SIZE:'60g',DOCKER_SANDBOXES_ROOT_SIZE:'30g'}}:{});
      const created = (await inventory(run)).find(row => row.name === name);
      if (!created) throw Error('Cannot verify the created sandbox; retained state for inspection');
      state = { ...state, sandboxId: created.id, phase: 'provisioning' };
      writeJson(path, state);
    }
    // No custom Orca process, pairing, desktop DB write, listener or port mapping.
    await run('sbx', ['run', '--detach', '--name', name]);
    if (state.phase === 'ready') {
      await syncName({ name, project: { ...project, name: state.displayName }, assetRoot, run });
      await syncPolicy({ name, assetRoot, run });
    }
    if (state.phase === 'provisioning') {
      await configure({ name, project, assetRoot, run });
      state = { ...state, phase: 'configured' }; writeJson(path, state);
    }
    if (state.phase === 'configured') {
      const clone = 'set -eu; if test -e "$2"; then test "$(git -C "$2" remote get-url origin)" = "$1"; git -C "$2" rev-parse --verify HEAD >/dev/null; else git clone -- "$1" "$2"; fi';
      await run('sbx', ['exec', '-u', 'agent', name, 'sh', '-c', clone, 'clone', project.cloneUrl, projectRoot]);
      state = { ...state, phase: 'cloned' }; writeJson(path, state);
    }
    if (!['cloned', 'ready'].includes(state.phase)) throw Error('Sandbox creation was interrupted before its identity was verified; inspect it before retrying');
    await run('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', `${name}.sbx`,
      `set -eu; . /etc/teck-orca/environment.sh; test -d ${quote(projectRoot + '/.git')} && test -x /usr/local/bin/omp && printf 'Teck SSH preview ready\\n'`]);
    if(project.kubernetes==='workspace'){
      try{await startCluster({name,project,assetRoot,sandboxId:state.sandboxId,run});}
      catch(error){log('Teck Kubernetes startup needs attention: '+error.message+'; inspect teck-kube status.');}
    }
    state = { ...state, phase: 'ready' }; writeJson(path, state);
    return state;
  });
}
export function sshInstructions(state) {
  return `Choose Teck OMP SSH Project (Preview) in Run on for each workspace. Orca registers SSH to ${state.sandboxName}.sbx as _default_user_ and creates a linked worktree under ${state.projectRoot}. The project sandbox is shared.`;
}
export function sshConnection(state) {
  return { type: 'ssh', projectRoot: state.projectRoot, target: { label: `${state.displayName} SSH Preview`,
    configHost: `${state.sandboxName}.sbx`, host: `${state.sandboxName}.sbx`, port: 22, username: '_default_user_' } };
}
