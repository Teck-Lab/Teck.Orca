import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewLaunchArgs, orchestrationLaunchArgs } from '../runtime/omp-launch-policy.mjs';
import { resumeArgs } from '../runtime/omp-session.mjs';

const overlay = '/home/agent/.omp/agent/reviewer.yml';
test('coordination policy is explicit, session-local and survives disabled extension discovery and resume', () => {
  const args = ['--resume', '/sessions/worker.jsonl', '--model', 'omniroute/teck-executor', '--no-extensions', '--', 'Follow up'];
  const applied = orchestrationLaunchArgs(args);
  assert.ok(applied.includes('/home/agent/.omp/agent/orchestration.yml'));
  assert.ok(applied.includes('/home/agent/.omp/agent/extensions/orca-orchestration.mjs'));
  assert.deepEqual(applied.slice(-2), ['--', 'Follow up']);
  assert.deepEqual(orchestrationLaunchArgs(applied), applied);
  assert.deepEqual(orchestrationLaunchArgs(['--version']), ['--version']);
});
test('dedicated advisor sessions disable their background advisors without changing model or user overlays', () => {
  for (const selector of ['omniroute/teck-advisor', 'omniroute/teck-advisor:medium', 'omniroute/teck-advisor:high']) {
    const args = ['--config', '/user/custom.yml', '--model', selector, '--thinking', 'high'];
    assert.deepEqual(reviewLaunchArgs(args), [...args, '--config', overlay]);
    assert.deepEqual(args, ['--config', '/user/custom.yml', '--model', selector, '--thinking', 'high']);
  }
});
test('ordinary workers, explicit advisor requests and model-looking prompt text keep their launch behavior', () => {
  for (const args of [[], ['--model', 'omniroute/teck-executor'], ['--model=omniroute/teck-orchestrator'],
    ['--model', 'omniroute/teck-advisor', '--advisor'],
    ['--model', 'omniroute/teck-advisor', '--model', 'omniroute/teck-executor'],
    ['--', '--model', 'omniroute/teck-advisor']]) assert.deepEqual(reviewLaunchArgs(args), args);
});
test('review overlay handles equals syntax, option terminators and repeated application', () => {
  const args = ['--model=omniroute/teck-advisor:medium', '--', 'Review this diff'];
  const expected = [args[0], '--config', overlay, '--', 'Review this diff'];
  assert.deepEqual(reviewLaunchArgs(args), expected);
  assert.deepEqual(reviewLaunchArgs(expected), expected);
  assert.deepEqual(reviewLaunchArgs(['--model=omniroute/teck-advisor', `--config=${overlay}`]),
    ['--model=omniroute/teck-advisor', `--config=${overlay}`]);
});

test('cold-restored reviewer keeps its exact session, model and thinking while avoiding recursive advisors', () => {
  const args = resumeArgs({ args: ['--config', '/user/custom.yml'], sessionFile: '/saved/review.jsonl',
    model: 'omniroute/teck-advisor', thinking: 'medium' });
  assert.deepEqual(reviewLaunchArgs(args), [...args, '--config', overlay]);
});
