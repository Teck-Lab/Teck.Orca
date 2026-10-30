import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureSandbox, ensureNamingHook, ensureWorkflowPolicy, environmentScript, installationScript } from '../src/configuration.mjs';
import { runtimeFiles } from '../build.mjs';
import { ensureKitBuilder } from '../src/provider.mjs';

test('workflow upgrade preserves existing models, config and unrelated tools; installs a versioned policy once', async t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-workflow-upgrade-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries(runtimeFiles())) {
    const target = join(root, name); mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, bytes);
  }
  const calls = []; let installed = '';
  const run = async (program, args, options) => {
    calls.push({ program, args, options });
    if (args.at(-1)?.includes('cat /home/agent/.omp/agent/teck-workflow')) return installed;
    if (options?.input) installed = /printf '%s' '([a-f0-9]{64})'/.exec(options.input)?.[1] ?? '';
    return '';
  };
  assert.equal(await ensureWorkflowPolicy({ name: 'owned-test-vm', assetRoot: root, run }), true);
  const script = calls.find(c => c.options?.input).options.input;
  assert.ok(!script.includes('models.yml'));
  assert.ok(!script.includes('/agent/config.yml'));
  assert.match(script, /mcpServers.*github-projects.*\?\?=/);
  assert.match(script, /orca-orchestration.mjs/);
  assert.match(script, /omp-launch-policy.mjs/);
  assert.match(script, /agents\/technical-planner\.md/);
  assert.match(script, /extensions\/lib\/github-plan-scope\.mjs/);
  const syntax = spawnSync(bash, ['-n'], { input: script, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.equal(await ensureWorkflowPolicy({ name: 'owned-test-vm', assetRoot: root, run }), false);
  assert.equal(calls.filter(c => c.options?.input).length, 1);
});

test('native configuration stages the bundled policy and launchers, never a daemon', async t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-native-config-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'assets/omp'), { recursive: true });
  writeFileSync(join(root, 'assets/omp/config.yml'), 'modelRoles: {}\n');
  for (const name of ['project-name.mjs', 'omp-launch.mjs', 'omp-launch-policy.mjs', 'omp-session.mjs', 'omp-session-extension.ts']) writeFileSync(join(root, 'assets', name), '// fixture');
  const calls = [];
  await configureSandbox({ name: 'preview-vm', project: { id: "github:example/o'reilly" }, assetRoot: root,
    run: async (program, args, options) => calls.push({ program, args, options }) });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].args[0], 'cp');
  assert.equal(existsSync(calls[0].args[1]), false, 'host staging is cleaned after the provider copy');
  assert.equal(calls[1].args.at(-1), '-s');
  assert.match(calls[1].options.input, /TECK_ORCA_PROJECT_ID=/);
  assert.ok(!/ORCA_USER_DATA|teck-orcad|manage-daemon/.test(calls[1].options.input));
  assert.equal(calls[2].args[2], 'agent');
  assert.match(calls[2].args.at(-1), /Teck OMP/);
  assert.match(calls[2].args.at(-1), /agents\.invalid/);
});

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
test('guest scripts parse in a real shell and preserve an Orca terminal routing environment', { skip: !existsSync(bash) }, () => {
  const project = { id: "github:example/o'reilly" };
  const syntax = spawnSync(bash, ['-n'], { input: installationScript('/tmp/teck-native-ssh-check', project), encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const script = environmentScript(project) + 'printf "%s\\n" "$ORCA_USER_DATA_PATH" "$ORCA_CLI_COMMAND" "$PATH" "$TECK_ORCA_PROJECT_ID"';
  const result = spawnSync(bash, ['--noprofile', '--norc', '-c', script], { encoding: 'utf8',
    env: { ...process.env, ORCA_USER_DATA_PATH: '/managed/orca/profile', ORCA_CLI_COMMAND: '/managed/orca/bin/orca' } });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines[0], '/managed/orca/profile');
  assert.equal(lines[1], '/managed/orca/bin/orca');
  assert.equal(lines[3], project.id);
  // Shell startup can translate a Windows PATH; compare against the same shell's unmodified value.
  const original = spawnSync(bash, ['--noprofile', '--norc', '-c', 'printf "%s" "$PATH"'], { encoding: 'utf8' });
  assert.equal(lines[2], original.stdout);
});

test('an undersized or full kit builder fails before a workload is created or cache deleted', async t => {
  const lockRoot = mkdtempSync(join(tmpdir(), 'teck-native-builder-test-'));
  t.after(() => rmSync(lockRoot, { recursive: true, force: true }));
  for (const disk of ['Size Avail\n10737418240 9000000000\n', 'Size Avail\n42949672960 1000000000\n', 'unreadable']) {
    const calls = [];
    const row = { name: 'sbx-kit-builder', id: 'builder-id', agent: 'sbx-kit-builder', detached: true };
    await assert.rejects(ensureKitBuilder({ lockRoot, run: async (program, args) => {
      calls.push(args);
      if (args[0] === 'ls') return JSON.stringify([row]);
      if (args.includes('df')) return disk;
      return '';
    } }), /builder needs/);
    assert.ok(!calls.some(args => ['create', 'rm', 'stop'].includes(args[0]) || args.includes('prune')));
  }
});

test('a sufficiently sized detached builder is reused with its original identity', async t => {
  const lockRoot = mkdtempSync(join(tmpdir(), 'teck-native-builder-test-'));
  t.after(() => rmSync(lockRoot, { recursive: true, force: true }));
  const row = { name: 'sbx-kit-builder', id: 'builder-id', agent: 'sbx-kit-builder', detached: true };
  await ensureKitBuilder({ lockRoot, run: async (program, args) => {
    if (args[0] === 'ls') return JSON.stringify([row]);
    if (args.includes('df')) return 'Size Avail\n42949672960 25000000000\n';
    return '';
  } });
});

test('an older ready preview gains only the naming hook while its OMP profile stays untouched', async t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-name-upgrade-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'assets/project-name.mjs'), '// helper');
  const calls = [];
  const options = { name: 'preview', project: { name: 'Teck.Monorepo' }, assetRoot: root,
    run: async (program, args, options) => { calls.push({ args, options }); return ''; } };
  assert.equal(await ensureNamingHook(options), true);
  assert.equal(calls.length, 3);
  assert.match(calls[2].options.input, /project-name-startup\.sh/);
  assert.ok(!calls[2].options.input.includes('/.omp/'));
  calls.length = 0;
  assert.equal(await ensureNamingHook({ ...options, run: async (program, args) => { calls.push(args); return 'present'; } }), false);
  assert.equal(calls.length, 1);
});
