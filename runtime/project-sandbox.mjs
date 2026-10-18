import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { command, choosePublishedPort, containsPath, readSshConfig, REMOTE_PROJECT, runtimeEnvironment,
  syncConfiguration, validateCloneUrl, withFeatureLock } from '../scripts/lifecycle.mjs';
import { archiveProject, projectSandboxName, projectStateRoot, readProject, writeProject } from './project-state.mjs';
import { ensureKitBuilder } from './kit-builder.mjs';

// One owner per durable Orca project. There are deliberately no worktree leases,
// suspend/destroy callbacks, published Docker ports, or desktop store writes.
export async function provisionProject({ projectId, displayName, cloneUrl, repoPath, assetRoot,
  stateRoot = projectStateRoot(), env = process.env, run = command, sync = syncConfiguration, selectPort = choosePublishedPort,
  recreateMissing = false, expectedSandboxId, ensureBuilder = ensureKitBuilder }) {
  const name = projectSandboxName(projectId);
  cloneUrl = validateCloneUrl(cloneUrl);
  if (!displayName || !assetRoot || !repoPath) throw Error('Project display name, local repository and runtime assets are required');
  return withFeatureLock(stateRoot, name, async () => {
    // Use the managed SSH trust/authentication configuration; do not disable host key checks.
    readSshConfig(run('ssh', ['-G', `${name}.sbx`]));
    const rows = JSON.parse(run('sbx', ['ls', '--json']));
    if (!Array.isArray(rows)) throw Error('Unexpected sandbox inventory');
    const present = rows.some(row => row.name === name);
    const recorded = existsSync(join(stateRoot, name, 'state.json'));
    if (present && !recorded) throw Error('An unowned sandbox already uses this project name; refusing to adopt it');
    let state = recorded ? readProject(projectId, stateRoot) : null;
    if (expectedSandboxId && state?.sandboxId !== expectedSandboxId) throw Error('Project sandbox provider identity changed');
    if (state && state.cloneUrl !== cloneUrl) throw Error('Project clone URL changed; refusing to repurpose its sandbox');
    if (state && !present) {
      if (!recreateMissing) throw Error('The project sandbox is missing. Restore it to recover old work, or create a new workspace with Teck OMP Project to start fresh');
      if (state.sandboxId && rows.some(row => row.id === state.sandboxId)) throw Error('The owned project sandbox still exists under another name; refusing to replace it');
      archiveProject(projectId, stateRoot);
      state = null;
    }
    if (present && state?.sandboxId && rows.find(row => row.name === name)?.id !== state.sandboxId) throw Error('Sandbox provider identity changed; refusing to adopt a replacement');
    let creating = false;
    try {
      if (!present) {
        const cpus = Number(env.TECK_ORCA_CPUS ?? 8), memory = env.TECK_ORCA_MEMORY ?? '16g';
        if (!Number.isInteger(cpus) || cpus < 1 || !/^\d+(?:m|g)$/i.test(memory)) throw Error('Invalid sandbox CPU or memory setting');
        await ensureBuilder({ run });
        state = { schemaVersion: 1, projectId, displayName, sandboxName: name, cloneUrl,
          projectRoot: REMOTE_PROJECT, transport: 'docker-ssh', phase: 'creating', port: await selectPort() };
        writeProject(state, stateRoot);
        creating = true;
        const environment = Object.entries(runtimeEnvironment({ projectId, sandboxName: name })).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
        run('sbx', ['create', '--no-progress', '--name', name, '--cpus', String(cpus), '--memory', memory, '--skills', 'off', ...environment,
          join(assetRoot, 'runtime/kits/workload'), '--kit', join(assetRoot, 'runtime/kits/omniroute'),
          '--kit', join(assetRoot, 'runtime/kits/mcphub'), '--kit', join(assetRoot, 'runtime/kits/orcad')], { progress: true });
        const inventory = JSON.parse(run('sbx', ['ls', '--json']));
        state.sandboxId = inventory.find(row => row.name === name)?.id;
        if (!state.sandboxId) throw Error('Cannot verify newly created sandbox identity');
        writeProject(state, stateRoot);
        sync(name, assetRoot, run, { projectId, sandboxName: name });
        for (const key of ['user.name', 'user.email']) {
          let value;
          try { value = run('git', ['-C', repoPath, 'config', key]).trim(); } catch { continue; }
          if (value) run('sbx', ['exec', '-u', 'agent', name, 'git', 'config', '--global', key, value]);
        }
        run('sbx', ['exec', '-u', 'agent', name, 'git', 'clone', '--', cloneUrl, REMOTE_PROJECT], { progress: true });
      } else if (state.phase !== 'ready') {
        throw Error('Project provisioning was interrupted; inspect the retained sandbox before retrying');
      }
      // This only starts our own local daemon. Desktop connectivity always goes through SSH.
      const ready = JSON.parse(run('sbx', ['exec', '-u', 'agent', name, 'node', '/usr/local/lib/teck-orca/manage-daemon.mjs', `ws://127.0.0.1:${state.port}`, 'ssh']));
      if (ready.schemaVersion !== 1 || ready.projectRoot !== REMOTE_PROJECT || !ready.pairingCode?.startsWith('orca://pair?')) throw Error('Project daemon did not report ready');
      writeProject({ ...state, phase: 'ready' }, stateRoot);
      return { state: readProject(projectId, stateRoot), pairingCode: ready.pairingCode };
    } catch (error) {
      if (creating) {
        // Rollback is confined to the newly provisioned, still unregistered project.
        try {
          readProject(projectId, stateRoot);
          if (!containsPath(stateRoot, join(stateRoot, name))) throw Error('Unsafe project cleanup path');
          const inventory = JSON.parse(run('sbx', ['ls', '--json']));
          if (!Array.isArray(inventory)) throw Error('Cannot verify rollback sandbox inventory');
          const current = inventory.find(row => row.name === name);
          if (current) {
            if (!state.sandboxId || current.id !== state.sandboxId) throw Error('Cannot prove ownership of the rollback sandbox; retained for inspection');
            run('sbx', ['rm', '--force', name], { progress: true });
          }
          rmSync(join(stateRoot, name), { recursive: true, force: true });
        } catch (cleanup) { throw Error(`${error.message}; project rollback failed: ${cleanup.message}`); }
      }
      throw error;
    }
  });
}
