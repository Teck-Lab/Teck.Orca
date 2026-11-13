import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { workflowFiles } from '../runtime/workflow-assets.mjs';
import { updatePayload } from '../runtime/sandbox-update.mjs';
import { validatePayload, validManagedPath } from '../runtime/sandbox-update-guest.mjs';

const root = 'runtime/omp';
test('official Aspire snapshot has complete pinned provenance and unchanged bytes', () => {
  const snapshot = JSON.parse(readFileSync(join(root, 'aspire-skills.json'), 'utf8'));
  assert.equal(snapshot.repository, 'microsoft/aspire-skills');
  assert.match(snapshot.commit, /^[a-f0-9]{40}$/);
  const unique = new Set();
  for (const file of snapshot.files) {
    assert.ok(!unique.has(file.path)); unique.add(file.path);
    assert.equal(createHash('sha256').update(readFileSync(join(root, file.path))).digest('hex'), file.sha256, file.path);
  }
  assert.ok(unique.has('aspire-skills.LICENSE'));
  const names = readdirSync(join(root,'skills')).filter(name => name.startsWith('aspire'));
  assert.equal(names.length, 8);
  for (const name of names) assert.ok(unique.has(`skills/${name}/SKILL.md`));
});

test('managed updates include official references, licence and layered testing skills without granting arbitrary paths', () => {
  const payload = updatePayload();
  assert.equal(validatePayload(payload), payload);
  const delivered = new Map(workflowFiles(root, 'runtime'));
  const snapshot = JSON.parse(readFileSync(join(root, 'aspire-skills.json'), 'utf8'));
  for (const file of snapshot.files) assert.deepEqual(delivered.get(file.path), readFileSync(join(root,file.path)), file.path);
  for (const name of ['dotnet-unit-testing','dotnet-integration-testing','dotnet-test-execution','dotnet-test-quality','browser-end-to-end-testing','nx-run-tasks','nx-workspace']) {
    assert.ok(delivered.has(`skills/${name}/SKILL.md`));
  }
  assert.ok(delivered.has('skills/dotnet-integration-testing/references/aspire-testing.md'));
  assert.ok(delivered.has('skills/dotnet-integration-testing/references/aspire-kind-testing.md'));
  assert.ok(delivered.has('skills/browser-end-to-end-testing/references/nx-bun-aspire.md'));
  for (const path of ['skills/my-personal-skill/SKILL.md','skills/nx-unknown/SKILL.md','skills/aspire/../../config.yml','aspire-skills.env','config.yml','mcp.json']) {
    assert.equal(validManagedPath(path), false, path);
  }
});
