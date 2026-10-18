import { spawnSync } from 'node:child_process';
import { createHash, randomUUID, randomInt } from 'node:crypto';
import { createServer } from 'node:net';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Docker's Windows converter needs a writable temporary directory. Keep this
// process-local default in Node so every host uses the same recipe launcher.
if (process.platform === 'win32' && !process.env.TMPDIR) process.env.TMPDIR = tmpdir();
export const REMOTE_PROJECT = '/home/agent/project';
const namePattern = /^teck-orca-[fp]-[a-f0-9]{12}$/;
export const shellQuote = (value) => {
  if (String(value).includes('\0')) throw new Error('NUL is not a valid command argument');
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
};
export const sandboxName = (projectId, featureId) => {
  if (!projectId?.trim()) throw new Error('ORCA_PROJECT_ID is required');
  if (!featureId?.trim()) throw new Error('ORCA_VM_INSTANCE_ID or ORCA_WORKSPACE_ID is required for a feature sandbox');
  return `teck-orca-f-${createHash('sha256').update(JSON.stringify([projectId, featureId])).digest('hex').slice(0, 12)}`;
};
export const containsPath = (parent, child) => {
  const path = relative(resolve(parent), resolve(child));
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
};

export function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    encoding: 'utf8', windowsHide: true, shell: false,
    input: options.input, timeout: options.timeout ?? 900_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  // Recipe stdout must contain only the final JSON, even when sbx writes progress to stdout.
  if (options.progress) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) throw new Error(`${program} could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${program} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout ?? '';
}

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
function guardedRemove(stateRoot, path) {
  if (!containsPath(stateRoot, path)) throw new Error('Refusing unsafe state cleanup');
  rmSync(path, { recursive: true, force: true });
}

export async function withFeatureLock(stateRoot, name, operation, timeoutMs = 120_000) {
  if (!namePattern.test(name) && name !== 'sbx-kit-builder') throw new Error('Invalid sandbox name');
  mkdirSync(stateRoot, { recursive: true });
  const lock = join(stateRoot, `${name}.lock`);
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      mkdirSync(lock);
      try { writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token })); }
      catch (error) { guardedRemove(stateRoot, lock); throw error; }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')); } catch {}
      let stale = owner ? !alive(owner.pid) : false;
      if (!owner) { try { stale = Date.now() - statSync(lock).mtimeMs > 30_000; } catch {} }
      if (stale) {
        const recovery = `${lock}.recovery`;
        try {
          mkdirSync(recovery);
          try {
            let current;
            try { current = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')); } catch {}
            if (owner ? current?.token === owner.token && !alive(current.pid) : !current && existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 30_000) {
              guardedRemove(stateRoot, lock);
            }
          } finally { guardedRemove(stateRoot, recovery); }
          continue;
        } catch (error) { if (error.code !== 'EEXIST' && error.code !== 'ENOENT') throw error; }
      }
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for feature lifecycle lock: ${name}`);
      await delay(100);
    }
  }
  try { return await operation(); } finally {
    let owner;
    try { owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')); } catch {}
    if (owner?.token === token) guardedRemove(stateRoot, lock);
  }
}

export function readSshConfig(output) {
  const config = Object.fromEntries(output.split(/\r?\n/).filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    return [line.slice(0, space), line.slice(space + 1)];
  }));
  if (!config.proxycommand || !/\bssh\s+proxy\b/.test(config.proxycommand) || config.user !== '_default_user_') {
    throw new Error('Docker-managed SSH is not configured. Run sbx setup ssh, then retry.');
  }
  return config;
}

export function connectionResult(name, projectId, featureId, ready) {
  if (name !== sandboxName(projectId, featureId)) throw new Error('Feature/sandbox identity mismatch');
  if (ready && (ready.schemaVersion !== 1 || ready.projectRoot !== REMOTE_PROJECT || typeof ready.pairingCode !== 'string' || !ready.pairingCode.startsWith('orca://pair?'))) throw new Error('Invalid Orca daemon readiness result');
  return {
    schemaVersion: 1,
    ...(ready ? { pairingCode: ready.pairingCode, projectRoot: REMOTE_PROJECT } : {}),
    userData: { sandboxName: name, projectId, featureId, instanceId: featureId, connectionMode: 'orcad' },
  };
}

export function publishedEndpoint(output) {
  const data = JSON.parse(output);
  const rows = Array.isArray(data) ? data : data.ports;
  if (!Array.isArray(rows)) throw new Error('Unexpected sbx ports response');
  const port = rows.find((row) => Number(row.container_port ?? row.sandbox_port ?? row.target_port) === 6768 && ['127.0.0.1', 'localhost'].includes(row.host_ip));
  if (!port || !Number.isInteger(Number(port.host_port)) || Number(port.host_port) < 1 || Number(port.host_port) > 65535) throw new Error('Cannot verify a loopback-only Orca port mapping');
  return `ws://127.0.0.1:${port.host_port}`;
}

export function startDaemon(name, run = command) {
  const endpoint = publishedEndpoint(run('sbx', ['ports', name, '--json']));
  // Pairing credentials belong only in the recipe result, never progress logs/state.
  const ready = JSON.parse(run('sbx', ['exec', '-u', 'agent', name, 'node', '/usr/local/lib/teck-orca/manage-daemon.mjs', endpoint], { timeout: 150_000 }));
  return ready;
}

function payloadIdentity(env, payload) {
  const data = payload?.recipeResult?.userData;
  const projectId = env.ORCA_PROJECT_ID?.trim() || data?.projectId;
  const featureId = data?.featureId;
  if (!projectId || !featureId) throw new Error('Lifecycle payload belongs to another project or feature recipe');
  const name = sandboxName(projectId, featureId);
  if (data?.sandboxName !== name || data?.projectId !== projectId || data?.instanceId !== featureId) throw new Error('Lifecycle payload belongs to another project or feature recipe');
  const expectedInstance = env.ORCA_VM_INSTANCE_ID?.trim() || env.ORCA_WORKSPACE_ID?.trim();
  if (expectedInstance && data?.instanceId !== expectedInstance) throw new Error('Lifecycle payload belongs to another workspace instance');
  return { projectId, featureId, name, instanceId: data.instanceId };
}

export function validateCloneUrl(url) {
  if (/^(?:https?|ssh):\/\//i.test(url)) {
    const parsed = new URL(url);
    if (parsed.password || (parsed.protocol !== 'ssh:' && parsed.username)) throw new Error('Use a credential-free clone URL and sbx-managed Git credentials');
    return url;
  }
  if (/^git@[^\s:]+:.+/.test(url)) return url;
  throw new Error('A reachable HTTPS or SSH Git clone URL is required; host-local paths cannot be cloned inside this sandbox');
}

export function runtimeEnvironment(identity = {}) {
  return {
    HOME: '/home/agent',
    ORCA_USER_DATA_PATH: '/home/agent/.local/share/teck-orca/orca',
    PATH: '/usr/local/bin:/opt/paseo-omp/bin:/home/agent/.local/bin:/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin',
    OMNIROUTE_API_KEY: 'proxy-managed', MCPHUB_API_KEY: 'proxy-managed',
    OMNIROUTE_BASE_URL: 'https://omniroute.tecklab.dk/v1',
    OMNIROUTE_MODEL: 'teck-orchestrator', OMNIROUTE_RESEARCH_ENABLED: '1',
    MNEMOPI_DATA_DIR: '/home/agent/.local/share/teck-orca/memory',
    OMP_SKIP_SETUP: '1', ONNXRUNTIME_NODE_INSTALL: 'skip',
    AGENT_BROWSER_EXECUTABLE_PATH: '/usr/local/bin/chromium',
    AGENT_BROWSER_ARGS: '--no-sandbox,--disable-dev-shm-usage',
    AGENT_BROWSER_CA_CERT: '/etc/ssl/certs/ca-certificates.crt',
    AGENT_BROWSER_IGNORE_HTTPS_ERRORS: 'false', AGENT_BROWSER_CONTENT_BOUNDARIES: 'true',
    NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/ca-certificates.crt',
    ...(identity.projectId ? { TECK_ORCA_PROJECT_ID: identity.projectId, TECK_ORCA_SANDBOX_NAME: identity.sandboxName } : {}),
    ...(identity.featureId ? { TECK_ORCA_FEATURE_ID: identity.featureId } : {}),
  };
}

export function syncConfiguration(name, assetRoot = root, run = command, identity = {}) {
  const staging = mkdtempSync(join(tmpdir(), 'teck-orca-config-'));
  try {
    cpSync(join(assetRoot, 'runtime', 'omp'), staging, { recursive: true });
    const remoteStaging = `/tmp/${basename(staging)}`;
    run('sbx', ['cp', staging, `${name}:/tmp/`], { progress: true });
    // Preserve Orca's relay CLI directory and routing environment from the PTY.
    const environment = Object.entries(runtimeEnvironment(identity)).map(([key, value]) => `export ${key}=${shellQuote(value)}${key === 'PATH' ? ':"${PATH:-}"' : ''}`).join('\n') + '\n';
    const wrapper = '#!/bin/sh\n. /etc/teck-orca/environment.sh\nexec node /usr/local/lib/teck-orca/omp-launch.mjs "$@"\n';
    const recovery = '# Teck-owned fallback for a cold-restored interactive Orca pane.\n' +
      'case $- in *i*)\n  . /etc/teck-orca/environment.sh\n' +
      '  node /usr/local/lib/teck-orca/omp-launch.mjs --teck-restore-pane\n;; esac\n';
    const install = [
      'set -eu',
      `trap 'rm -rf -- ${shellQuote(remoteStaging)}' EXIT`,
      // install -d only assigns ownership to explicitly named directories. Its
      // implicit .omp parent otherwise belongs to root, blocking OMP's run dir.
      'install -d -o agent -g agent -m 700 /home/agent/.omp /home/agent/.omp/run /home/agent/.omp/agent /home/agent/.local/share/teck-orca /home/agent/.local/share/teck-orca/memory /home/agent/.local/share/teck-orca/orca /home/agent/.local/state/teck-orca',
      // The runtime is expanded and validated as root. Bun reports an unwritable
      // install cache as a tempdir error, even when TMPDIR itself is writable.
      'install -d -o agent -g agent -m 755 /home/agent/.bun /home/agent/.bun/install /home/agent/.bun/install/cache',
      'chown -R agent:agent /home/agent/.bun/install/cache',
      `cp -R ${shellQuote(remoteStaging)}/. /home/agent/.omp/agent/`,
      'chown -R agent:agent /home/agent/.omp/agent',
      'find /home/agent/.omp/agent -type d -exec chmod 700 {} +',
      'find /home/agent/.omp/agent -type f -exec chmod 600 {} +',
      'if test -d /home/agent/.omp/agent/scripts; then find /home/agent/.omp/agent/scripts -type f -exec chmod 700 {} +; fi',
      'install -d -m 755 /etc/teck-orca /usr/local/lib/teck-orca',
      `printf '%s' ${shellQuote(environment)} > /etc/teck-orca/environment.sh`,
      'chmod 644 /etc/teck-orca/environment.sh',
      `printf '%s' ${shellQuote(wrapper)} > /usr/local/lib/teck-orca/omp`,
      'chmod 755 /usr/local/lib/teck-orca/omp',
      'ln -sfn /usr/local/lib/teck-orca/omp /usr/local/bin/omp',
      `printf '%s' ${shellQuote(recovery)} > /etc/teck-orca/omp-recovery.sh`,
      'chmod 644 /etc/teck-orca/omp-recovery.sh',
      `grep -qF '/etc/teck-orca/omp-recovery.sh' /home/agent/.bashrc || printf '%s\n' '. /etc/teck-orca/omp-recovery.sh' >> /home/agent/.bashrc`,
      'chown agent:agent /home/agent/.bashrc',
      `grep -qF '/etc/teck-orca/environment.sh' /etc/sandbox-persistent.sh || printf '%s\n' '. /etc/teck-orca/environment.sh' >> /etc/sandbox-persistent.sh`,
    ].join('; ');
    run('sbx', ['exec', '-u', 'root', name, 'sh', '-c', install], { progress: true });
    run('sbx', ['cp', join(assetRoot, 'runtime', 'manage-daemon.mjs'), `${name}:/usr/local/lib/teck-orca/manage-daemon.mjs`], { progress: true });
    for (const file of ['omp-launch.mjs', 'omp-session.mjs', 'omp-session-extension.ts']) {
      run('sbx', ['cp', join(assetRoot, 'runtime', file), `${name}:/usr/local/lib/teck-orca/${file}`], { progress: true });
    }
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

export async function choosePublishedPort({ randomPort = () => randomInt(20000, 40000), serverFactory = createServer } = {}) {
  // Windows/HNS can reserve dynamic ports after a reboot. Publish a fixed
  // loopback port below the default dynamic range, probing actual bind rights
  // so exclusions/other applications in this range are respected as well.
  for (let attempt = 0; attempt < 64; attempt++) {
    const port = randomPort();
    if (!Number.isInteger(port) || port < 20000 || port >= 40000) throw Error('Invalid published port candidate');
    try {
      await new Promise((resolve, reject) => {
        const server = serverFactory();
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
      });
      return port;
    } catch (error) {
      if (!['EACCES', 'EADDRINUSE'].includes(error.code)) throw error;
    }
  }
  throw Error('No available loopback port in 20000-39999; no sandbox was created');
}

export function createLifecycle({ env = process.env, run = command, assetRoot = root, stateRoot = env.TECK_ORCA_STATE_DIR || join(homedir(), '.teck-orca', 'features'), sync = syncConfiguration, start = startDaemon, selectPort = choosePublishedPort } = {}) {
  const exists = (name) => {
    const rows = JSON.parse(run('sbx', ['ls', '--json']));
    if (!Array.isArray(rows)) throw new Error('Unexpected sbx ls response');
    return rows.some((row) => row.name === name);
  };
  const statePath = (name) => join(stateRoot, name, 'state.json');
  function writeState(name, data) {
    mkdirSync(dirname(statePath(name)), { recursive: true });
    const temp = `${statePath(name)}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(data) + '\n');
    renameSync(temp, statePath(name));
  }
  function owned(name, projectId, featureId) {
    const data = JSON.parse(readFileSync(statePath(name), 'utf8'));
    if (data.sandboxName !== name || data.projectId !== projectId || data.featureId !== featureId || data.projectRoot !== REMOTE_PROJECT) throw new Error('Sandbox ownership record mismatch');
    return data;
  }
  function prepare(name, projectId, featureId) {
    run('sbx', ['exec', name, 'true'], { progress: true });
    sync(name, assetRoot, run, { projectId, featureId, sandboxName: name });
    for (const key of ['user.name', 'user.email']) {
      let value;
      try { value = run('git', ['-C', env.ORCA_REPO_PATH || process.cwd(), 'config', key]).trim(); } catch { continue; }
      if (value) run('sbx', ['exec', name, 'git', 'config', '--global', key, value], { progress: true });
    }
    const checks = 'set -eu; test -w /home/agent/.omp; runtime_check=$(mktemp -d /home/agent/.omp/run/teck-orca-check.XXXXXX); rmdir "$runtime_check"; bun_cache_check=$(mktemp -d /home/agent/.bun/install/cache/teck-orca-check.XXXXXX); printf probe > "$bun_cache_check/write"; rm "$bun_cache_check/write"; rmdir "$bun_cache_check"; temp_check=$(mktemp -d); rmdir "$temp_check"; command -v node; command -v g++; command -v python3; command -v ps; omp --version; test -r /home/agent/.omp/agent/models.yml; test -x /usr/local/bin/chromium; test -x /opt/teck-orcad/node; test -r /opt/teck-orcad/server/orcad.js; orca-ide --help >/dev/null';
    run('sbx', ['exec', '-u', 'agent', name, 'sh', '-c', checks], { progress: true });
  }
  return async (mode, payload = {}) => {
    if (!['create', 'resume', 'suspend', 'destroy', 'cleanup'].includes(mode)) throw new Error('Unknown recipe lifecycle mode');
    const feature = env.ORCA_VM_INSTANCE_ID?.trim() || env.ORCA_WORKSPACE_ID?.trim();
    const { projectId, featureId, name, instanceId } = mode === 'create' ? { projectId: env.ORCA_PROJECT_ID?.trim(), featureId: feature, name: sandboxName(env.ORCA_PROJECT_ID?.trim(), feature), instanceId: feature } : payloadIdentity(env, payload);
    const lockTimeout = Number(env.TECK_ORCA_LOCK_TIMEOUT_MS ?? 120_000);
    if (!Number.isFinite(lockTimeout) || lockTimeout < 0) throw new Error('Invalid lock timeout');
    return withFeatureLock(stateRoot, name, async () => {
      let creating = false;
      let addedLease = false;
      const acquireLease = () => {
        const data = owned(name, projectId, featureId);
        if (instanceId && !data.instances?.includes(instanceId)) {
          writeState(name, { ...data, instances: [...(data.instances ?? []), instanceId] });
          addedLease = true;
        }
      };
      try {
      if (mode === 'suspend') return undefined; // Children may still use the feature VM.
      if (mode === 'destroy' || mode === 'cleanup') {
        if (!exists(name)) {
          if (existsSync(dirname(statePath(name)))) {
            owned(name, projectId, featureId);
            guardedRemove(stateRoot, dirname(statePath(name)));
          }
          return undefined;
        }
        const data = owned(name, projectId, featureId);
        const instances = mode === 'cleanup' ? data.instances ?? [] : (data.instances ?? []).filter((id) => id !== instanceId);
        if (mode === 'destroy') writeState(name, { ...data, instances, phase: 'retained' });
        // Cleanup only removes a feature whose recipe owner has been released.
        if (instances.length) return undefined;
        const list = run('sbx', ['exec', name, 'git', '-C', REMOTE_PROJECT, 'worktree', 'list', '--porcelain']);
        const worktrees = list.split(/\r?\n/).filter((line) => line.startsWith('worktree '));
        // A failed or empty inventory is never permission to delete a feature.
        if (!worktrees.some((line) => line === `worktree ${REMOTE_PROJECT}`)) throw new Error('Cannot verify project worktrees; sandbox retained');
        if (worktrees.length > 1) return undefined;
        run('sbx', ['rm', '--force', name], { progress: true });
        guardedRemove(stateRoot, dirname(statePath(name)));
        return undefined;
      }
      if (mode === 'resume') {
        if (owned(name, projectId, featureId).connectionMode !== 'orcad') throw new Error('Existing SSH sandbox is unchanged; create a new feature with the daemon recipe');
        if (!exists(name)) throw new Error(`Sandbox ${name} no longer exists; create a new workspace`);
        acquireLease();
        prepare(name, projectId, featureId);
        run('sbx', ['exec', name, 'git', '-C', REMOTE_PROJECT, 'rev-parse', '--show-toplevel']);
        return connectionResult(name, projectId, featureId, start(name, run));
      }
      if (exists(name)) {
        if (owned(name, projectId, featureId).connectionMode !== 'orcad') throw new Error('Existing SSH sandbox is unchanged; create a new feature with the daemon recipe');
      }
      else {
        // Fail before provisioning if the repository cannot be reached from the guest.
        validateCloneUrl(env.ORCA_REPO_URL?.trim() || run('git', ['-C', env.ORCA_REPO_PATH || process.cwd(), 'remote', 'get-url', 'origin']).trim());
        const cpus = Number(env.TECK_ORCA_CPUS ?? 4);
        const memory = env.TECK_ORCA_MEMORY ?? '8g';
        if (!Number.isInteger(cpus) || cpus < 1 || !/^\d+(?:m|g)$/i.test(memory)) throw new Error('Invalid sandbox CPU or memory setting');
        const publishedHostPort = await selectPort();
        writeState(name, { sandboxName: name, projectId, featureId, projectRoot: REMOTE_PROJECT, connectionMode: 'orcad', phase: 'creating', publishedHostPort });
        creating = true;
        const environment = Object.entries(runtimeEnvironment({ projectId, featureId, sandboxName: name })).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
        run('sbx', ['create', '--no-progress', '--name', name, '--cpus', String(cpus), '--memory', memory, '--skills', 'off', '--publish', `127.0.0.1:${publishedHostPort}:6768/tcp4`, ...environment,
          join(assetRoot, 'runtime', 'kits', 'workload'), '--kit', join(assetRoot, 'runtime', 'kits', 'omniroute'), '--kit', join(assetRoot, 'runtime', 'kits', 'mcphub'), '--kit', join(assetRoot, 'runtime', 'kits', 'orcad')], { progress: true });
      }
      acquireLease();
      prepare(name, projectId, featureId);
      let cloned = false;
      try { run('sbx', ['exec', name, 'git', '-C', REMOTE_PROJECT, 'rev-parse', '--show-toplevel']); cloned = true; } catch {}
      if (!cloned) {
        const url = validateCloneUrl(env.ORCA_REPO_URL?.trim() || run('git', ['-C', env.ORCA_REPO_PATH || process.cwd(), 'remote', 'get-url', 'origin']).trim());
        run('sbx', ['exec', name, 'git', 'clone', '--', url, REMOTE_PROJECT], { progress: true });
      }
      const result = connectionResult(name, projectId, featureId, start(name, run));
      writeState(name, { ...owned(name, projectId, featureId), phase: 'ready' });
      return result;
      } catch (error) {
        // Only roll back a VM provisioned by this invocation; never delete a reused project.
        if (creating) {
          try {
            owned(name, projectId, featureId);
            if (exists(name)) run('sbx', ['rm', '--force', name], { progress: true });
            guardedRemove(stateRoot, dirname(statePath(name)));
          } catch (cleanupError) {
            throw new Error(`${error.message}\nCleanup failed; inspect sandbox ${name}: ${cleanupError.message}`);
          }
        } else if (addedLease) {
          const data = owned(name, projectId, featureId);
          writeState(name, { ...data, instances: data.instances.filter((id) => id !== instanceId) });
        }
        throw error;
      }
    }, lockTimeout);
  };
}

export async function main(mode = process.argv[2]) {
  let payload = {};
  if (mode !== 'create') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    payload = JSON.parse(input);
  }
  const result = await createLifecycle()(mode, payload);
  if (result) process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`teck-orca: ${error.message}\n`); process.exitCode = 1; });
}
