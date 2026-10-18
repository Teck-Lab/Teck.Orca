// Invoked by Orca on first use. Setup and plugin activation never provision.
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { command, REMOTE_PROJECT } from '../scripts/lifecycle.mjs';
import { provisionProject } from './project-sandbox.mjs';
import { projectSandboxName, projectStateRoot, readProject } from './project-state.mjs';
import { launchProjectTransport, redact } from './project-transport.mjs';
import { orcaExecutable } from './project-supervisor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function createProjectLifecycle({ env = process.env, assetRoot = root, stateRoot = projectStateRoot(),
  run = command, provision = provisionProject, launch = launchProjectTransport, read = readProject } = {}) {
  return async (mode, payload = {}) => {
    if (!['create', 'resume', 'suspend', 'destroy'].includes(mode)) throw Error('Unknown project lifecycle mode');
    const previous = payload.recipeResult?.userData;
    const projectId = env.ORCA_PROJECT_ID?.trim() || previous?.projectId;
    const instanceId = env.ORCA_VM_INSTANCE_ID?.trim() || env.ORCA_WORKSPACE_ID?.trim() || previous?.instanceId;
    const name = projectSandboxName(projectId);
    if (!instanceId) throw Error('Orca workspace/runtime instance identity is required; choose Teck OMP Project in Orca');
    if (mode !== 'create' && (previous?.projectId !== projectId || previous.sandboxName !== name ||
      previous.instanceId !== instanceId || previous.connectionMode !== 'project-ssh')) throw Error('Lifecycle payload belongs to another project or workspace');
    if (mode === 'suspend' || mode === 'destroy') return;
    if (mode === 'resume') {
      let owned;
      try { owned = read(projectId, stateRoot); }
      catch (error) {
        if (error.code === 'ENOENT') throw Error('The previous project sandbox was removed. Create a new workspace with Teck OMP Project to start fresh');
        throw error;
      }
      if (owned.sandboxId !== previous.sandboxId) throw Error('Project sandbox provider identity changed');
    }
    const repoPath = env.ORCA_REPO_PATH || process.cwd();
    const cloneUrl = env.ORCA_REPO_URL?.trim() || previous?.cloneUrl || run('git', ['-C', repoPath, 'remote', 'get-url', 'origin']).trim();
    const displayName = env.ORCA_PROJECT_NAME?.trim() || env.ORCA_REPO_NAME?.trim() || basename(repoPath);
    const desktop = JSON.parse(run(orcaExecutable(env), ['status', '--json']));
    const ownerPid = desktop?.result?.app?.pid;
    if (!desktop.ok || !desktop.result.app.running || !Number.isSafeInteger(ownerPid)) throw Error('Orca desktop must be running to create a project workspace');
    const { state, pairingCode } = await provision({ projectId, displayName, cloneUrl, repoPath, assetRoot, stateRoot, env,
      recreateMissing: mode === 'create', expectedSandboxId: mode === 'resume' ? previous.sandboxId : undefined });
    await launch(projectId, ownerPid, { stateRoot });
    // Orca pairs the environment and creates the requested worktree. Do not
    // pre-register a separate environment or project host from a setup script.
    return { schemaVersion: 1, pairingCode, projectRoot: REMOTE_PROJECT,
      userData: { projectId, sandboxName: name, sandboxId: state.sandboxId, cloneUrl, instanceId, connectionMode: 'project-ssh' } };
  };
}
export async function main(mode = process.argv[2]) {
  let payload = {};
  if (mode !== 'create') {
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    payload = JSON.parse(input);
  }
  const result = await createProjectLifecycle()(mode, payload);
  if (result) process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`teck-orca project: ${redact(error)}\n`); process.exitCode = 1; });
}
