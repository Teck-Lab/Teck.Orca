import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../build.mjs';

test('preview contributes a Run on recipe with automatic SSH registration and no preparation command', t => {
  const destination = mkdtempSync(join(tmpdir(), 'teck-native-package-'));
  t.after(() => rmSync(destination, { recursive: true, force: true }));
  const result = build({ destination });
  const manifest = JSON.parse(readFileSync(join(destination, 'orca-plugin.json')));
  assert.equal(manifest.id, 'teck-native-ssh-preview');
  assert.deepEqual(manifest.contributes.vmRecipes, [{ path: 'recipes/native-ssh-project.json' }]);
  assert.equal(manifest.main, undefined);
  assert.equal(manifest.contributes.commands, undefined);
  assert.equal(result.files, 3);
  assert.equal(result.bytes < 50 * 1024 ** 2, true);
  assert.equal(result.files < 1500, true);
  const recipe = JSON.parse(readFileSync(join(destination, 'recipes/native-ssh-project.json')));
  assert.equal(recipe.name, 'Teck OMP SSH Project (Preview)');
  assert.equal(recipe.destroy, 'none');
  assert.equal(recipe.checkoutMode, undefined);
  for (const mode of ['create', 'suspend', 'resume']) {
    assert.ok(recipe[mode].startsWith('node -e '));
    assert.ok(Buffer.byteLength(recipe[mode]) < 8191);
  }
  build({ destination, check: true });
});
