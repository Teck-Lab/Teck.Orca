import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeRecipe, runtimeFiles } from '../build.mjs';
import { recipeCommand, snapshot } from '../release.mjs';

test('main Run on recipe preserves native SSH identity and binds every command to its runtime', () => {
  const recipe = nativeRecipe();
  const { digest } = snapshot(runtimeFiles());
  assert.equal(recipe.id, 'teck-native-ssh-project');
  assert.equal(recipe.name, 'Teck OMP Project');
  assert.equal(recipe.destroy, 'none');
  assert.equal(recipe.checkoutMode, undefined);
  for (const mode of ['create', 'suspend', 'resume']) {
    assert.equal(recipe[mode], recipeCommand(digest, mode));
    assert.ok(Buffer.byteLength(recipe[mode]) < 8191);
  }
});
