// Runs only in a coordinator terminal on the generated disposable test runtime.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const reportPath = '/tmp/teck-orca-review-result.json';
const report = { ok: false, phase: 'starting', reviews: [] };
const save = () => writeFileSync(reportPath, JSON.stringify(report), { mode: 0o600 });
function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program}: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function cli(args) {
  const response = JSON.parse(run('/usr/local/bin/orca-ide', [...args, '--json']));
  if (response.ok !== true) throw new Error(JSON.stringify(response.error));
  return response.result;
}
const git = (cwd, ...args) => run('git', ['-C', cwd, ...args]).trim();
const worktreePath = (worktree) => worktree.path ?? worktree.id.split('::')[1];
function review(worktree, base, expected, evidence) {
  const cwd = worktreePath(worktree);
  const head = git(cwd, 'rev-parse', 'HEAD');
  const before = git(cwd, 'status', '--porcelain');
  const spec = `Perform a dedicated read-only code review in this existing checkout.
Read orca-feature-workflow/references/review-gates.md. This is a controlled
review-only test; do not create GitHub records, edit project files, run tests,
install anything, publish, merge, create worktrees or delegate this review.
Review the complete diff from base ${base} to head ${head} and surrounding code.
Acceptance criteria: clamp(value,min,max) must clamp values inclusively to the
range and reject inverted ranges with RangeError; tests must cover those cases.
Recorded test evidence from the coordinator: ${evidence}
Inspect the actual files and diff rather than relying on completion claims.
Return approve, request_changes or blocked with concrete findings and coverage
gaps. Include this exact plain-text prefix in your worker_done body:
REVIEW_RESULT verdict=<your verdict> head=${head}
Then provide evidence. Report using the live injected worker_done contract and
idle. A request_changes verdict completes the review successfully, not the code.
Do not inspect unrelated files, runtime credentials or provider settings.`;
  report.phase = `reviewing-${expected}`; save();
  const worker = cli(['orchestration', 'worker-start', '--spec', spec, '--task-title', 'Read-only completed change review',
    '--worktree', `id:${worktree.id}`, '--agent', 'omp', '--model', 'omniroute/teck-advisor:high', '--timeout-ms', '90000']);
  assert.equal(worker.launch.effective.model, 'omniroute/teck-advisor:high');
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    const delivery = cli(['orchestration', 'check', '--wait', '--types', 'worker_done,escalation,question', '--timeout-ms', '15000']);
    const content = JSON.stringify(delivery);
    const match = content.match(/REVIEW_RESULT verdict=(approve|request_changes|blocked) head=([a-f0-9]{40})/);
    const deliveryId = delivery.delivery?.id ?? delivery.deliveryId;
    if (match && content.includes(worker.dispatchId)) {
      assert.equal(match[1], expected, content);
      assert.equal(match[2], head);
      assert.equal(git(cwd, 'rev-parse', 'HEAD'), head, 'Review changed the head');
      assert.equal(git(cwd, 'status', '--porcelain'), before, 'Review changed project files');
      const released = cli(['orchestration', 'worker-release', '--dispatch', worker.dispatchId]);
      if (deliveryId) cli(['orchestration', 'check', '--ack', deliveryId]);
      report.reviews.push({ verdict: match[1], head, worktreeId: worktree.id, launch: worker.launch,
        dispatchId: worker.dispatchId, reviewDelivery: delivery, release: released });
      save();
      return;
    }
    if (deliveryId) cli(['orchestration', 'check', '--ack', deliveryId]);
  }
  throw new Error(`No valid ${expected} review before deadline`);
}
try {
  const parent = cli(['worktree', 'current']).worktree;
  report.parent = parent.id;
  const createdRun = cli(['orchestration', 'run-create', '--objective', 'Explicit child and final parent review regression']);
  report.run = createdRun.run ?? createdRun;
  const parentPath = worktreePath(parent);
  const base = git(parentPath, 'rev-parse', 'HEAD');
  const child = cli(['worktree', 'create', '--repo', `id:${parent.id.split('::')[0]}`, '--name', 'review-test-child',
    '--parent-worktree', `id:${parent.id}`, '--base-branch', parent.branch, '--setup', 'skip']).worktree;
  const childPath = worktreePath(child);
  report.child = child.id;
  const correct = `export function clamp(value, min, max) {\n  if (min > max) throw new RangeError('inverted range');\n  return Math.min(max, Math.max(min, value));\n}\n`;
  const broken = correct.replace('Math.min(max, Math.max(min, value))', 'Math.max(max, Math.min(min, value))');
  const tests = `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { clamp } from './clamp.mjs';\ntest('range handling', () => {\n  assert.throws(() => clamp(5, 10, 0), RangeError);\n  assert.equal(clamp(-1, 0, 10), 0);\n  assert.equal(clamp(5, 0, 10), 5);\n  assert.equal(clamp(11, 0, 10), 10);\n  assert.equal(clamp(3, 3, 3), 3);\n});\n`;
  writeFileSync(join(childPath, 'clamp.mjs'), broken);
  git(childPath, 'add', 'clamp.mjs'); git(childPath, 'commit', '-m', 'fix: reject inverted clamp ranges');
  // The regression must prevent accepting a plausible implementation with only
  // weak green tests; the reviewer is not told which verdict is expected.
  const weakTests = run('node', ['--test', 'clamp.test.mjs'], childPath);
  review(child, base, 'request_changes', weakTests);
  writeFileSync(join(childPath, 'clamp.mjs'), correct);
  writeFileSync(join(childPath, 'clamp.test.mjs'), tests);
  git(childPath, 'add', 'clamp.mjs', 'clamp.test.mjs'); git(childPath, 'commit', '-m', 'fix: clamp ranges and expand coverage');
  const childTests = run('node', ['--test', 'clamp.test.mjs'], childPath);
  review(child, base, 'approve', childTests);
  git(parentPath, 'merge', '--ff-only', child.branch);
  const combinedTests = run('node', ['--test', 'clamp.test.mjs'], parentPath);
  review(parent, base, 'approve', combinedTests);
  const workers = cli(['orchestration', 'worker-list', '--run', report.run.id ?? report.run.runId]);
  assert.equal(workers.workers.length, 3);
  assert.ok(workers.workers.every(worker => worker.terminalState === 'released'));
  assert.equal(cli(['orchestration', 'worker-list', '--run', report.run.id ?? report.run.runId, '--terminal-state', 'reclaimable']).workers.length, 0);
  assert.equal(cli(['worktree', 'show', '--worktree', `id:${child.id}`]).worktree.parentWorktreeId, parent.id);
  report.workers = workers;
  report.phase = 'completed'; report.ok = true;
} catch (error) { report.phase = 'failed'; report.error = error.message; }
save();
// Keep the test coordinator alive until the host collects receipts and removes
// this generated runtime; its authority must survive reviewer cleanup.
setInterval(() => {}, 1000);
