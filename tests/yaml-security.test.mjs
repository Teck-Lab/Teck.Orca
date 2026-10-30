import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import YAML from '../runtime/kubernetes/vendor/yaml/dist/index.js';

const fixture = fileURLToPath(new URL('./fixtures/yaml-adversarial.mjs', import.meta.url));
for (const scenario of ['first-line', 'subsequent-line', 'block-end', 'indented-folds']) {
  test(`vendored YAML finishes ${scenario} adversarial input with correct round-trip behavior`, () => {
    for (const engine of ['legacy', 'native']) {
      // A child timeout bounds an actual synchronous parser/stringifier stall;
      // test-runner timers alone cannot interrupt a backtracking regex.
      const result = spawnSync(process.execPath, [fixture, scenario, engine], {
        encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true,
      });
      assert.equal(result.status, 0, `${scenario}/${engine}: ${result.error?.code ?? result.stderr}`);
      assert.equal(result.stdout.trim(), 'OK');
    }
  });
}

test('scalar hardening preserves official YAML formatting for multiline and indented values', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/yaml-scalars.json', import.meta.url)));
  for (const { value, options, output } of cases) {
    assert.equal(YAML.stringify({ value }, options), output, JSON.stringify({ value, options }));
    assert.deepEqual(YAML.parse(output), { value });
  }
});
