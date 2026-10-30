import { cpSync, mkdtempSync, rmSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { quote } from './system.mjs';

// Orca owns every ORCA_* value and the CLI's PATH precedence in its terminals.
export function nativeEnvironment(project) {
  return {
    OMNIROUTE_API_KEY: 'proxy-managed', MCPHUB_API_KEY: 'proxy-managed',
    OMNIROUTE_BASE_URL: 'https://omniroute.tecklab.dk/v1', OMNIROUTE_MODEL: 'teck-orchestrator', OMNIROUTE_RESEARCH_ENABLED: '1',
    MNEMOPI_DATA_DIR: '/home/agent/.local/share/teck-orca/memory', OMP_SKIP_SETUP: '1', ONNXRUNTIME_NODE_INSTALL: 'skip',
    AGENT_BROWSER_EXECUTABLE_PATH: '/usr/local/bin/chromium', AGENT_BROWSER_ARGS: '--no-sandbox,--disable-dev-shm-usage',
    AGENT_BROWSER_CA_CERT: '/etc/ssl/certs/ca-certificates.crt', AGENT_BROWSER_IGNORE_HTTPS_ERRORS: 'false',
    AGENT_BROWSER_CONTENT_BOUNDARIES: 'true', NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/ca-certificates.crt',
    TECK_ORCA_PROJECT_ID: project.id,
    ...(project.name ? { TECK_ORCA_PROJECT_NAME: project.name } : {}),
  };
}

export const environmentScript = project => Object.entries(nativeEnvironment(project))
  .map(([key, value]) => `export ${key}=${quote(value)}`).join('\n') + '\n';

export function installationScript(staging, project = { id: 'preview' }) {
  if (!/^\/tmp\/teck-native-ssh-[A-Za-z0-9-]+$/.test(staging)) throw Error('Invalid guest staging path');
  const environment = environmentScript(project);
  const wrapper = '#!/bin/sh\n. /etc/teck-orca/environment.sh\nexec node /usr/local/lib/teck-orca/omp-launch.mjs "$@"\n';
  const recovery = '# Restore only the saved OMP owner of a cold-restored interactive Orca pane.\ncase $- in *i*)\n. /etc/teck-orca/environment.sh\nnode /usr/local/lib/teck-orca/project-name.mjs --pane\nnode /usr/local/lib/teck-orca/omp-launch.mjs --teck-restore-pane\n;; esac\n';
  return [
    'set -eu',
    'install -d -o agent -g agent -m 700 /home/agent/.omp /home/agent/.omp/run /home/agent/.omp/agent /home/agent/.local/share/teck-orca/memory /home/agent/.local/state/teck-orca',
    'install -d -o agent -g agent -m 755 /home/agent/.bun/install/cache',
    // This initializer only runs before the new sandbox is ready for registration.
    `cp -R ${quote(staging)}/omp/. /home/agent/.omp/agent/`,
    'chown -R agent:agent /home/agent/.omp /home/agent/.bun/install/cache',
    'find /home/agent/.omp/agent -type d -exec chmod 700 {} +',
    'find /home/agent/.omp/agent -type f -exec chmod 600 {} +',
    'find /home/agent/.omp/agent/scripts -type f -exec chmod 700 {} +',
    'install -d -m 755 /etc/teck-orca /usr/local/lib/teck-orca',
    `cp ${quote(staging)}/project-name.mjs ${quote(staging)}/omp-*.mjs ${quote(staging)}/omp-session-extension.ts /usr/local/lib/teck-orca/`,
    `printf '%s' ${quote(environment)} > /etc/teck-orca/environment.sh`,
    `printf '%s' ${quote(wrapper)} > /usr/local/lib/teck-orca/omp`,
    'chmod 755 /usr/local/lib/teck-orca/omp',
    'ln -sfn /usr/local/lib/teck-orca/omp /usr/local/bin/omp',
    `printf '%s' ${quote(recovery)} > /etc/teck-orca/omp-recovery.sh`,
    `grep -qF '/etc/teck-orca/omp-recovery.sh' /home/agent/.bashrc || printf '%s\n' '. /etc/teck-orca/omp-recovery.sh' >> /home/agent/.bashrc`,
    `grep -qF '/etc/teck-orca/environment.sh' /etc/sandbox-persistent.sh || printf '%s\n' '. /etc/teck-orca/environment.sh' >> /etc/sandbox-persistent.sh`,
    'chown agent:agent /home/agent/.bashrc',
    'chmod 644 /etc/teck-orca/environment.sh /etc/teck-orca/omp-recovery.sh',
    `rm -rf -- ${quote(staging)}`,
  ].join('\n') + '\n';
}
export async function configureSandbox({ name, project, assetRoot, run }) {
  const staging = mkdtempSync(join(tmpdir(), 'teck-native-ssh-'));
  try {
    cpSync(join(assetRoot, 'assets/omp'), join(staging, 'omp'), { recursive: true });
    for (const file of ['project-name.mjs', 'omp-launch.mjs', 'omp-launch-policy.mjs', 'omp-session.mjs', 'omp-session-extension.ts']) cpSync(join(assetRoot, 'assets', file), join(staging, file));
    await run('sbx', ['cp', staging, `${name}:/tmp/`]);
    const script = installationScript(`/tmp/${basename(staging)}`, project);
    await run('sbx', ['exec', '-u', 'root', name, 'sh', '-s'], { input: script });
    // Orca's project preflight requires a Git identity. A fresh VM uses an
    // explicit local agent identity; never import the human's host identity.
    await run('sbx', ['exec', '-u', 'agent', name, 'sh', '-c',
      "set -eu; git config --global --get user.name >/dev/null || git config --global user.name 'Teck OMP'; git config --global --get user.email >/dev/null || git config --global user.email 'teck-omp@agents.invalid'"]);
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

// Upgrade the earlier preview without recopying the user's OMP profile or
// replacing its launch/session settings. Fresh 0.1.2 installs already have it.
export async function ensureNamingHook({ name, project, assetRoot, run }) {
  const present = await run('sbx', ['exec', '-u', 'agent', name, 'sh', '-c',
    'if test -f /usr/local/lib/teck-orca/project-name.mjs; then printf present; fi']);
  if (present.trim() === 'present') return false;
  const staging = mkdtempSync(join(tmpdir(), 'teck-native-ssh-'));
  try {
    cpSync(join(assetRoot, 'assets/project-name.mjs'), join(staging, 'project-name.mjs'));
    const remote = `/tmp/${basename(staging)}`;
    await run('sbx', ['cp', staging, `${name}:/tmp/`]);
    const hook = `case $- in *i*)\nexport TECK_ORCA_PROJECT_NAME=${quote(project.name)}\nnode /usr/local/lib/teck-orca/project-name.mjs --pane\n;; esac\n`;
    const install = [
      'set -eu',
      'install -d -m 755 /etc/teck-orca /usr/local/lib/teck-orca',
      `cp ${quote(remote)}/project-name.mjs /usr/local/lib/teck-orca/project-name.mjs`,
      `printf '%s' ${quote(hook)} > /etc/teck-orca/project-name-startup.sh`,
      'chmod 644 /usr/local/lib/teck-orca/project-name.mjs /etc/teck-orca/project-name-startup.sh',
      `grep -qF '/etc/teck-orca/project-name-startup.sh' /home/agent/.bashrc || printf '%s\n' '. /etc/teck-orca/project-name-startup.sh' >> /home/agent/.bashrc`,
      'chown agent:agent /home/agent/.bashrc',
      `rm -rf -- ${quote(remote)}`,
    ].join('\n') + '\n';
    await run('sbx', ['exec', '-u', 'root', name, 'sh', '-s'], { input: install });
    return true;
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

// Explicit plugin policy update on normal recipe reuse, not on agent startup.
// Copy only Teck-maintained workflow assets; preserve models, user config,
// credentials, sessions, unrelated extensions and project files.
export async function ensureWorkflowPolicy({ name, assetRoot, run }) {
  const roots = ['extensions/orca-orchestration.mjs', 'extensions/lib/orca-policy.mjs', 'extensions/lib/github-plan-scope.mjs', 'orchestration.yml', 'RULES.md',
    'agents/technical-planner.md',
    'skills/orca-feature-workflow', 'skills/orca-workers', 'skills/github-execution-planning', 'skills/github-publication'];
  const files = [];
  const walk = (path, relative) => {
    const children = readdirSync(path, { withFileTypes: true });
    for (const child of children) {
      if (child.isSymbolicLink()) throw Error('Workflow asset symlink refused');
      if (child.isDirectory()) walk(join(path, child.name), `${relative}/${child.name}`);
      else files.push([`${relative}/${child.name}`, readFileSync(join(path, child.name))]);
    }
  };
  for (const relative of roots) {
    const path = join(assetRoot, 'assets/omp', relative);
    if (relative.endsWith('.mjs') || relative.endsWith('.yml') || relative.endsWith('.md')) files.push([relative, readFileSync(path)]);
    else walk(path, relative);
  }
  for (const file of ['omp-launch.mjs', 'omp-launch-policy.mjs']) files.push([`runtime/${file}`, readFileSync(join(assetRoot, 'assets', file))]);
  const digest = createHash('sha256').update(Buffer.concat(files.flatMap(([path, bytes]) => [Buffer.from(path), bytes]))).digest('hex');
  const present = await run('sbx', ['exec', '-u', 'agent', name, 'sh', '-c', 'cat /home/agent/.omp/agent/teck-workflow.sha256 2>/dev/null || true']);
  if (present.trim() === digest) return false;
  const staging = mkdtempSync(join(tmpdir(), 'teck-native-ssh-'));
  try {
    for (const [relative, bytes] of files) {
      const destination = join(staging, relative); mkdirSync(join(destination, '..'), { recursive: true });
      writeFileSync(destination, bytes);
    }
    await run('sbx', ['cp', staging, `${name}:/tmp/`]);
    const remote = `/tmp/${basename(staging)}`;
    const copy = files.map(([relative]) => relative.startsWith('runtime/') ?
      `cp ${quote(`${remote}/${relative}`)} ${quote(`/usr/local/lib/teck-orca/${relative.slice(8)}`)}` :
      `install -D -o agent -g agent -m 600 ${quote(`${remote}/${relative}`)} ${quote(`/home/agent/.omp/agent/${relative}`)}`);
    // Merge the additional MCP binding without replacing existing servers/settings.
    const merge = `const fs=require('node:fs');const p='/home/agent/.omp/agent/mcp.json';const c=JSON.parse(fs.readFileSync(p));c.mcpServers??={};c.mcpServers['github-projects']??={type:'http',url:'https://mcp.tecklab.dk/mcp/github-projects',headers:{Authorization:'Bearer '+String.fromCharCode(36)+'{MCPHUB_API_KEY}'},timeout:120000};fs.writeFileSync(p,JSON.stringify(c,null,2)+'\\n');`;
    await run('sbx', ['exec', '-i', '-u', 'root', name, 'sh', '-s'], { input: [
      'set -eu', ...copy, `node -e ${quote(merge)}`, 'chown agent:agent /home/agent/.omp/agent/mcp.json',
      `printf '%s' ${quote(digest)} > /home/agent/.omp/agent/teck-workflow.sha256`,
      'chown agent:agent /home/agent/.omp/agent/teck-workflow.sha256', `rm -rf -- ${quote(remote)}`,
    ].join('\n') + '\n' });
    return true;
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
