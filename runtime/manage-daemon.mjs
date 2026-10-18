// Executed as agent inside this feature's sandbox. Stdout is recipe JSON only.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const directory = '/home/agent/.local/state/teck-orca';
const metadataPath = `${directory}/daemon.json`;
const readinessPath = `${directory}/ready.json`;
const logPath = `${directory}/daemon.log`;
const version = JSON.parse(readFileSync('/opt/teck-orcad/server/out/package.json', 'utf8')).version;
const endpoint = process.argv[2];
const bind = process.argv[3] === 'ssh' ? '127.0.0.1' : '0.0.0.0';
if (!/^ws:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Expected a loopback pairing endpoint');
mkdirSync(directory, { recursive: true, mode: 0o700 });
function readReady() {
  if (!existsSync(readinessPath)) return;
  for (const line of readFileSync(readinessPath, 'utf8').split('\n')) {
    try {
      const value = JSON.parse(line);
      if (value.schemaVersion === 1 && value.projectRoot === '/home/agent/project' && typeof value.pairingCode === 'string') return value;
    } catch {}
  }
}
function ownsProcess(pid) {
  try {
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    const environment = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0');
    return argv.includes('/opt/teck-orcad/server/orcad.js') && environment.includes('ORCA_USER_DATA=/home/agent/.local/share/teck-orca/orca');
  } catch { return false; }
}
let metadata;
try { metadata = JSON.parse(readFileSync(metadataPath, 'utf8')); } catch {}
if (metadata && ownsProcess(metadata.pid)) {
  if (metadata.endpoint !== endpoint || (metadata.bind ?? '0.0.0.0') !== bind) throw new Error('Live runtime has a different connection; retained without restarting its workers');
} else {
  const stdout = openSync(readinessPath, 'w', 0o600);
  const stderr = openSync(logPath, 'a', 0o600);
  const child = spawn('/opt/teck-orcad/node', ['/opt/teck-orcad/server/orcad.js', '--port', '6768', '--bind', bind, '--project-root', '/home/agent/project', '--pairing-address', endpoint, '--recipe-json'], {
    detached: true, stdio: ['ignore', stdout, stderr],
    env: { ...process.env, ORCA_VERSION: version, ORCA_APP_VERSION: version,
      ORCA_USER_DATA: '/home/agent/.local/share/teck-orca/orca', ORCA_USER_DATA_PATH: '/home/agent/.local/share/teck-orca/orca' },
  });
  closeSync(stdout); closeSync(stderr);
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  metadata = { pid: child.pid, endpoint, bind };
  writeFileSync(metadataPath, JSON.stringify(metadata) + '\n', { mode: 0o600 });
  child.unref();
}
const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  if (!ownsProcess(metadata.pid)) {
    const detail = readFileSync(logPath, 'utf8').slice(-6000).replace(/orca:\/\/pair\?[^\s"']+/g, '[pairing URL redacted]');
    throw new Error(`Feature Orca daemon exited before readiness: ${detail}`);
  }
  const ready = readReady();
  if (ready) { process.stdout.write(JSON.stringify(ready) + '\n'); process.exit(0); }
  await delay(200);
}
throw new Error('Feature Orca daemon did not become ready within 120 seconds; inspect its private daemon.log');
