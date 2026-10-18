import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { bootId, identity, recordPath, readRecord, writeRecord, recoveryMode,
  interactiveLaunch, explicitSession, reusableArgs, resumeArgs, claimPane } from './omp-session.mjs';

const recoveryOnly = process.argv[2] === '--teck-restore-pane';
let args = process.argv.slice(recoveryOnly ? 3 : 2);
const owner = identity();
const path = owner ? recordPath(owner) : null;
const saved = path ? readRecord(path) : null;
const currentBoot = bootId();
const recovery = owner ? recoveryMode(saved, owner, currentBoot) : null;
if (recoveryOnly && (!process.stdin.isTTY || process.env.ORCA_AGENT_LAUNCH_TOKEN ||
    process.env.ORCA_SEQUENCED_STARTUP_COMMAND || process.env.ORCA_SEQUENCED_STARTUP_SCRIPT ||
    !owner || !recovery)) process.exit(0);

// Scope recording to real interactive OMP panes, including direct CLI-created workers.
const tracked = owner && process.stdin.isTTY && interactiveLaunch(args);
if (tracked && !explicitSession(args) && recovery) {
  args = resumeArgs(saved, recovery);
  process.stderr.write(recovery === 'fresh' ? 'Teck: reopening this terminal\'s unused OMP session.\n' :
    'Teck: restoring this terminal\'s saved OMP session.\n');
}
let lock;
let token;
if (tracked) {
  try { ({ lock, token } = claimPane(path, currentBoot)); }
  catch (error) { process.stderr.write(`Teck: ${error.message}; a second launch was refused.\n`); process.exit(1); }
  writeRecord(path, { version: 1, owner, token, bootId: currentBoot, active: true,
    args: reusableArgs(args), sessionFile: null });
  // Explicit loading still works when ambient extension discovery is disabled.
  args.push('--extension', '/usr/local/lib/teck-orca/omp-session-extension.ts');
}
const child = spawn('/opt/paseo-omp/bin/omp', args, { stdio: 'inherit', env: {
  ...process.env, ...(tracked ? { TECK_ORCA_OMP_RECORD: path, TECK_ORCA_OMP_TOKEN: token } : {}),
} });
// Ctrl-C from the terminal already reaches the child process group. Do not
// deliver it twice (OMP uses it to interrupt a turn without closing the TUI).
process.on('SIGINT', () => {});
for (const signal of ['SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
function finish(code) {
  if (tracked) {
    const record = readRecord(path);
    if (record?.token === token) writeRecord(path, { ...record, active: false });
    if (readRecord(`${lock}/owner.json`)?.token === token) rmSync(lock, { recursive: true, force: true });
  }
  process.exitCode = code;
}
child.once('error', error => { process.stderr.write(`OMP launch failed: ${error.message}\n`); finish(1); });
child.once('exit', (code, signal) => finish(code ?? (signal === 'SIGINT' ? 130 : 1)));
