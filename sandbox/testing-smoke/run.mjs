import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Invoked only in a uniquely owned /tmp directory by smoke-dotnet-tests.mjs.
const root = dirname(fileURLToPath(import.meta.url));
assert.match(root, /^\/tmp\/teck-dotnet-smoke-[A-Za-z0-9]+\/testing-smoke$/);
assert.notEqual(process.getuid(), 0, 'Run as the sandbox agent');
const runId = process.env.TECK_SMOKE_RUN_ID;
assert.match(runId ?? '', /^[a-f0-9-]{36}$/);
const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', TESTINGPLATFORM_TELEMETRY_OPTOUT: '1' };
const run = (program, args, options = {}) => execFileSync(program, args,
  { cwd: root, env, encoding: 'utf8', timeout: 300_000, ...options });
const ownedContainers = () => run('docker', ['ps', '--all', '--quiet', '--filter', `label=teck.orca.testing-smoke=${runId}`]).trim().split(/\s+/).filter(Boolean);
const report = { uid: process.getuid(), runId, ok: false, phases: [], cleanedUp: false };

function phase(name, expectedTotal, expectedFailed, fault = false) {
  const results = join(root, name);
  const args = ['test', '--project', 'Probe.csproj', '--report-xunit-xml', '--report-xunit-xml-filename', 'results.xml', '--results-directory', results];
  if (fault) args.push('--no-build', '--no-restore', '--filter-class', 'IntegrationTests');
  console.log(`Running ${name}: dotnet ${args.join(' ')}`);
  let exitCode = 0;
  try { run('dotnet', args, { stdio: 'inherit', env: { ...env, TECK_SMOKE_FORCE_FAILURE: fault ? '1' : '0' } }); }
  catch (error) { if (error.status == null) throw error; exitCode = error.status; }
  const xml = readFileSync(join(results, 'results.xml'), 'utf8');
  const assembly = xml.match(/<assembly\s[^>]*>/)?.[0];
  assert.ok(assembly, 'No xUnit assembly report was emitted');
  const number = name => Number(assembly.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1]);
  const result = { name, exitCode, total: number('total'), passed: number('passed'), failed: number('failed'), skipped: number('skipped') };
  report.phases.push(result);
  assert.equal(result.total, expectedTotal, 'Expected tests must actually execute');
  assert.equal(result.failed, expectedFailed);
  assert.equal(result.passed, expectedTotal - expectedFailed);
  assert.equal(result.skipped, 0);
  assert.equal(exitCode, fault ? 2 : 0, 'Only the deliberately failing phase may fail');
  assert.deepEqual(ownedContainers(), [], `${name} leaked its PostgreSQL container`);
}

try {
  report.dotnet = run('dotnet', ['--version']).trim();
  report.docker = run('docker', ['version', '--format', '{{.Server.Version}}']).trim();
  assert.deepEqual(ownedContainers(), []);
  phase('passing', 4, 0);
  phase('expected-failure', 1, 1, true);
  report.ok = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  try {
    const leaked = ownedContainers();
    if (leaked.length) {
      assert.ok(leaked.every(id => /^[a-f0-9]{12,64}$/.test(id)));
      // Only containers with this invocation's exact unique label are ours.
      run('docker', ['rm', '--force', '--volumes', ...leaked]);
      report.forcedCleanup = leaked.length;
    }
    assert.deepEqual(ownedContainers(), []);
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(root, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
