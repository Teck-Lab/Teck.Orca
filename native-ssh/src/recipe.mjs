// Orca runs this lifecycle through its approved Run on recipe. No worker or
// setup command provisions a VM; registration is the SSH recipe runner's job.
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareProject, sandboxName, sshConnection, stateDirectory } from './provider.mjs';
import { command, redact } from './system.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export function createLifecycle({ env = process.env, assetRoot = root, stateRoot = stateDirectory(), run = command,
  provision = prepareProject, projects = JSON.parse(readFileSync(new URL('../projects.json', import.meta.url), 'utf8')),
  log = message => process.stderr.write(redact(message)) } = {}) {
  return async (mode, payload = {}) => {
    if (!['create', 'suspend', 'resume', 'destroy'].includes(mode)) throw Error('Unknown preview lifecycle mode');
    const previous = payload.recipeResult?.userData;
    const id = env.ORCA_PROJECT_ID?.trim() || previous?.projectId;
    const instanceId = env.ORCA_VM_INSTANCE_ID?.trim() || env.ORCA_WORKSPACE_ID?.trim() || previous?.instanceId;
    const name = sandboxName(id);
    if (!instanceId) throw Error('Choose Teck OMP SSH Project (Preview) in Orca Run on');
    if (mode !== 'create' && (previous?.version !== 1 || previous.projectId !== id || previous.instanceId !== instanceId ||
        previous.sandboxName !== name || previous.connectionMode !== 'native-ssh' || !previous.sandboxId)) throw Error('Lifecycle belongs to another project or workspace');
    // Worktree sleep/deletion never stops or deletes a project-shared VM.
    if (mode === 'suspend' || mode === 'destroy') return;
    const configured = projects.find(project => project.id === id);
    const cloneUrl = env.ORCA_REPO_URL?.trim() || previous?.cloneUrl || configured?.cloneUrl ||
      (await run('git', ['-C', env.ORCA_REPO_PATH || process.cwd(), 'remote', 'get-url', 'origin'])).trim();
    const project = { id, name: configured?.name || previous?.projectName || env.ORCA_PROJECT_NAME?.trim() || env.ORCA_REPO_NAME?.trim() || basename(env.ORCA_REPO_PATH || process.cwd()), cloneUrl,
      cpus: configured?.cpus ?? 8, memory: configured?.memory ?? '16g',kubernetes:configured?.kubernetes??false };
    const state = await provision({ project, assetRoot, stateRoot, run, log,
      recreateMissing: mode === 'create', expectedSandboxId: mode === 'resume' ? previous.sandboxId : undefined });
    return { schemaVersion: 1, connection: sshConnection(state), userData: { version: 1,
      projectId: id, projectName: project.name, instanceId, sandboxName: name, sandboxId: state.sandboxId, cloneUrl, connectionMode: 'native-ssh' } };
  };
}
export async function main(mode) {
  let payload = {};
  if (mode !== 'create') {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 1_048_576) throw Error('Lifecycle payload is too large'); }
    payload = JSON.parse(input);
  }
  const result = await createLifecycle({ run: (program, args, options = {}) => command(program, args,
    { ...options, log: message => process.stderr.write(redact(message)) }) })(mode, payload);
  if (result) process.stdout.write(JSON.stringify(result) + '\n');
}
