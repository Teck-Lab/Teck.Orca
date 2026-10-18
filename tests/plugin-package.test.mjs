import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlugin } from '../scripts/plugin-package.mjs';

test('installable plugin excludes large runtime assets and binds to the same recipe', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'teck-plugin-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'), destination = join(root, 'plugin');
  mkdirSync(join(source, 'runtime'), { recursive: true });
  mkdirSync(join(source, 'recipes'));
  const recipe = JSON.stringify({ schemaVersion: 1, id: 'feature', name: 'Feature', create: 'node example' });
  writeFileSync(join(source, 'recipes/feature.json'), recipe);
  writeFileSync(join(source, 'orca-plugin.json'), JSON.stringify({ contributes: { vmRecipes: [{ path: 'recipes/feature.json' }] } }));
  writeFileSync(join(source, 'LICENSE'), 'MIT');
  writeFileSync(join(source, 'runtime/large-archive'), Buffer.alloc(51 * 1024 * 1024));
  const result = buildPlugin({ source, destination });
  assert.equal(result.fileCount, 3);
  assert.ok(result.totalBytes < 1024);
  assert.equal(readFileSync(join(destination, 'recipes/feature.json'), 'utf8'), recipe);
  buildPlugin({ source, destination, check: true });
  writeFileSync(join(destination, 'unrelated.log'), 'not plugin content');
  assert.throws(() => buildPlugin({ source, destination, check: true }), /unexpected files/);
});
