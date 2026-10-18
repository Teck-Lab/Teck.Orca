import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installRelease, verifyRelease, recipeCommand, repositoryRoot } from '../scripts/release.mjs';
import { sandboxName, connectionResult } from '../scripts/lifecycle.mjs';

test('runtime installation is repeatable and changed files are rejected', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'teck orca release '));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(temp, 'source');
  mkdirSync(join(source, 'scripts'), { recursive: true });
  mkdirSync(join(source, 'runtime'), { recursive: true });
  writeFileSync(join(source, 'scripts', 'lifecycle.mjs'), 'export function main() {}');
  writeFileSync(join(source, 'runtime', 'settings.json'), '{}');
  const first = installRelease(source, join(temp, 'releases'));
  assert.deepEqual(installRelease(source, join(temp, 'releases')), first);
  verifyRelease(first.destination, first.digest);
  writeFileSync(join(first.destination, 'runtime', 'settings.json'), '{"modified":true}');
  assert.throws(() => verifyRelease(first.destination, first.digest), /changed/i);
});

test('generated recipe runs through the host shell, forwards JSON stdin and rejects changed runtime', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'teck orca dispatch '));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const release = installRelease(repositoryRoot, join(temp, 'releases'));
  const projectId = 'project-ü-json';
  const featureId = 'feature-UTF8-æ';
  const env = { ...process.env, TECK_ORCA_RELEASES_DIR: join(temp, 'releases'), TECK_ORCA_STATE_DIR: join(temp, 'state'), ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId };
  const cmd = recipeCommand(release.digest, 'suspend');
  assert.ok(cmd.length < 8191);
  assert.ok(cmd.startsWith('node -e '));
  const input = JSON.stringify({ recipeResult: connectionResult(sandboxName(projectId, featureId), projectId, featureId) });
  const result = spawnSync(cmd, { shell: true, env, input, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  const invalid = spawnSync(cmd, { shell: true, env, input: '{}', encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /another project/);
  assert.equal(invalid.stdout, '');
  writeFileSync(join(release.destination, 'scripts', 'lifecycle.mjs'), '// changed');
  const tampered = spawnSync(cmd, { shell: true, env, input, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /Changed release file/);
});

test('plugin recipes use pinned launchers and fit Orca and cmd limits', () => {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'orca-plugin.json')));
  assert.deepEqual(manifest.contributes.vmRecipes, [{ path: 'recipes/sbx-project-sandbox.json' }]);
  for (const item of [...manifest.contributes.vmRecipes, { path: 'recipes/sbx-feature-sandbox.json' }]) {
    const path = typeof item === 'string' ? item : item.path;
    const recipe = JSON.parse(readFileSync(join(repositoryRoot, path)));
    assert.equal(recipe.schemaVersion, 1);
    for (const mode of ['create', 'suspend', 'resume', 'destroy']) {
      if (mode === 'destroy' && recipe.id === 'teck-sbx-project') { assert.equal(recipe[mode], 'none'); continue; }
      assert.ok(recipe[mode].length < 8191);
      assert.ok(recipe[mode].startsWith('node -e '));
    }
  }
});

test('project launchers dispatch to the first-use lifecycle and reject unapproved entrypoints', t => {
  const temp = mkdtempSync(join(tmpdir(), 'teck-project-launcher-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(temp, 'source');
  mkdirSync(join(source, 'scripts'), { recursive: true }); mkdirSync(join(source, 'runtime'));
  writeFileSync(join(source, 'scripts/lifecycle.mjs'), 'export function main(){throw Error("Wrong legacy entrypoint");}');
  writeFileSync(join(source, 'runtime/project-recipe.mjs'), 'export function main(mode){process.stdout.write(JSON.stringify({entry:"project",mode}));}');
  const release = installRelease(source, join(temp, 'releases'));
  const result = spawnSync(recipeCommand(release.digest, 'create', 'runtime/project-recipe.mjs'), { shell: true,
    env: { ...process.env, TECK_ORCA_RELEASES_DIR: join(temp, 'releases') }, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { entry: 'project', mode: 'create' });
  assert.throws(() => recipeCommand(release.digest, 'create', '../untrusted.mjs'), /Invalid recipe identity/);
});
