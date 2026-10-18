// Runs only in a newly created terminal on a disposable test runtime.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const output = '/tmp/teck-orca-coordinator-result.json';
const report = { ok: false };
function cli(args) {
  const process = spawnSync('/usr/local/bin/orca-ide', [...args, '--json'], { encoding: 'utf8', timeout: 120_000 });
  if (process.error) throw process.error;
  const response = JSON.parse(process.stdout);
  if (process.status !== 0 || response.ok !== true) {
    const error = new Error(JSON.stringify(response.error ?? response.result));
    error.receipt = response.result;
    throw error;
  }
  return response.result;
}
try {
  report.current = cli(['worktree', 'current']);
  report.run = cli(['orchestration', 'run-create', '--objective', 'Disposable daemon worker launch validation']);
  report.worker = cli(['orchestration', 'worker-start', '--spec', 'This is a read-only disposable integration test. Read the first heading in README.md. Do not edit files or contact GitHub. Report that heading using the injected worker_done command, then idle.',
    '--worktree', 'new-child', '--agent', 'omp', '--model', 'omniroute/teck-executor', '--name', 'daemon-smoke-dispatch', '--display-name', 'Daemon smoke worker', '--setup', 'skip', '--timeout-ms', '90000']);
  // The CLI exits zero only for a ready worker; preserve its full receipt.
  report.ok = true;
} catch (error) { report.error = error.message; report.failedReceipt = error.receipt; }
writeFileSync(output, JSON.stringify(report) + '\n', { mode: 0o600 });
// The whole disposable runtime is removed by the host test; keep this genuine
// coordinator terminal alive so it retains ownership while receipts are checked.
setInterval(() => {}, 1000);
