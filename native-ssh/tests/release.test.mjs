import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installRelease, recipeCommand } from '../release.mjs';
import { runtimeFiles } from '../build.mjs';

test('approved launcher runs through the host shell, preserves UTF-8 stdin and rejects changed files', t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-native-launcher-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = { 'src/recipe.mjs': Buffer.from('export async function main(mode) {let input=""; for await(const c of process.stdin) input+=c; console.log(JSON.stringify({mode,payload:JSON.parse(input)}));}') };
  const first = installRelease(files, root), second = installRelease(files, root);
  assert.equal(first.digest, second.digest);
  const payload = { recipeResult: { userData: { displayName: 'æøå project' } } };
  const options = { encoding: 'utf8', input: JSON.stringify(payload), windowsHide: true, shell: true, timeout: 30_000,
    env: { ...process.env, TECK_ORCA_NATIVE_SSH_RELEASES_DIR: root } };
  const result = spawnSync(recipeCommand(first.digest, 'resume'), options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { mode: 'resume', payload });
  writeFileSync(join(first.destination, 'src/recipe.mjs'), 'throw Error("must not execute");');
  const tampered = spawnSync(recipeCommand(first.digest, 'resume'), options);
  assert.equal(tampered.status, 1);
  assert.equal(tampered.stdout, '');
  assert.match(tampered.stderr, /Preview release changed/);
  assert.throws(() => installRelease(files, root), /Preview release changed/);
});

test('the immutable runtime contains OMP and network policy with no bundled custom daemon', () => {
  const files = runtimeFiles();
  assert.match(files['assets/kits/workload/workload.yaml'].toString(), /\*\.quay\.io:443/);
  assert.match(files['assets/kits/workload/workload.yaml'].toString(), /18\.14\.0/);
  assert.match(files['assets/kits/workload/workload.yaml'].toString(), /1\.4\.4/);
  assert.ok(!Object.keys(files).some(name => /orcad|entry\.mjs|job\.mjs|manage-daemon/.test(name)));
  assert.ok(!files['assets/kits/workload/context.md'].toString().includes('bundled Orca daemon'));
});
