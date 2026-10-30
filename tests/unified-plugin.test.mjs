import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repositoryRoot } from '../scripts/release.mjs';
import { buildPlugin } from '../scripts/plugin-package.mjs';
import { sandboxName, stateDirectory } from '../native-ssh/src/provider.mjs';

test('one main plugin offers native SSH and retains the existing preview VM identity', () => {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'plugin/orca-plugin.json')));
  assert.equal(manifest.id, 'teck-sbx-recipes');
  assert.equal(manifest.publisher, 'teck-lab');
  assert.deepEqual(manifest.contributes.vmRecipes, [{ path: 'recipes/native-ssh-project.json' }]);
  assert.deepEqual(manifest.contributes.commands.map(c => c.id), ['teck.reconnectSandboxes']);
  const recipe = JSON.parse(readFileSync(join(repositoryRoot, 'plugin/recipes/native-ssh-project.json')));
  assert.equal(recipe.id, 'teck-native-ssh-project');
  assert.equal(recipe.name, 'Teck OMP Project');
  assert.equal(recipe.destroy, 'none');
  assert.equal(recipe.checkoutMode, undefined);
  assert.match(sandboxName('github:teck-lab/teck.monorepo'), /^teck-orca-ssh-/);
  assert.match(stateDirectory().replaceAll('\\', '/'), /\/\.teck-orca-native-ssh$/);
  assert.equal(existsSync(join(repositoryRoot, 'native-ssh/plugin/orca-plugin.json')), false);
  assert.equal(existsSync(join(repositoryRoot, 'native-ssh/package.json')), false);
  const mirror = JSON.parse(readFileSync(join(repositoryRoot, 'orca.yaml')));
  assert.deepEqual(mirror.environmentRecipes.map(r => r.id), ['teck-native-ssh-project']);
});

test('refreshing the main package removes its obsolete recipe and retains recovery', t => {
  const destination = mkdtempSync(join(tmpdir(), 'teck-unified-package-'));
  t.after(() => rmSync(destination, { recursive: true, force: true }));
  mkdirSync(join(destination, 'recipes'));
  writeFileSync(join(destination, 'orca-plugin.json'), JSON.stringify({
    id: 'teck-sbx-recipes', contributes: { vmRecipes: [{ path: 'recipes/sbx-project-sandbox.json' }] },
  }));
  writeFileSync(join(destination, 'recipes/sbx-project-sandbox.json'), '{}');
  const result = buildPlugin({ destination });
  assert.equal(existsSync(join(destination, 'recipes/sbx-project-sandbox.json')), false);
  assert.equal(existsSync(join(destination, 'recipes/native-ssh-project.json')), true);
  assert.equal(existsSync(join(destination, 'reconnect.mjs')), true);
  assert.ok(result.totalBytes < 50 * 1024 ** 2);
  buildPlugin({ destination, check: true });
});

test('root setup installs both approved runtimes and its native recipe runs without provisioning', async t => {
  const { installPluginRuntimes } = await import('../scripts/setup-runtime.mjs');
  const root = mkdtempSync(join(tmpdir(), 'teck-unified-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const installed = installPluginRuntimes({ recoveryReleasesRoot: join(root, 'recovery'), sshReleasesRoot: join(root, 'ssh') });
  assert.equal(existsSync(join(installed.ssh.destination, 'src/recipe.mjs')), true);
  assert.equal(existsSync(join(installed.recovery.destination, 'runtime/plugin-entry.mjs')), true);
  const recipe = JSON.parse(readFileSync(join(repositoryRoot, 'plugin/recipes/native-ssh-project.json')));
  const projectId = 'test-unified-install', instanceId = 'workspace';
  const input = JSON.stringify({ recipeResult: { userData: { version: 1, projectId, instanceId,
    sandboxName: sandboxName(projectId), sandboxId: 'retained-vm', connectionMode: 'native-ssh' } } });
  const result = spawnSync(recipe.suspend, { shell: true, encoding: 'utf8', input, timeout: 30_000, windowsHide: true,
    env: { ...process.env, TECK_ORCA_NATIVE_SSH_RELEASES_DIR: join(root, 'ssh'),
      ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: instanceId } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
