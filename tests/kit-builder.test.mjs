import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureKitBuilder } from '../runtime/kit-builder.mjs';

function fixture(t) {
  const stateRoot = mkdtempSync(join(tmpdir(), 'teck-builder-test-'));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const calls = [], rows = [];
  let disk = `${40 * 1024 ** 3} ${30 * 1024 ** 3}\n`;
  const run = (program, args) => {
    calls.push(args);
    if (args[0] === 'ls') return JSON.stringify(rows);
    if (args[0] === 'create') { rows.push({ name: 'sbx-kit-builder', id: 'builder-id', agent: 'sbx-kit-builder' }); return ''; }
    if (args[0] === 'run') { rows[0].detached = true; return rows[0].id; }
    if (args.includes('df')) return `1B-blocks Avail\n${disk}`;
    throw Error('Unexpected builder command');
  };
  return { stateRoot, run, calls, rows, disk: value => { disk = value; } };
}

test('concurrent first-use checks create only the shared builder with a 40g volume', async t => {
  const f = fixture(t);
  const results = await Promise.all([ensureKitBuilder(f), ensureKitBuilder(f)]);
  const creation = f.calls.filter(args => args[0] === 'create');
  assert.equal(creation.length, 1);
  assert.ok(creation[0].includes('volumeSize=40g'));
  assert.ok(creation[0].includes('docker.io/docker/sbx-kit-builder:1'));
  assert.deepEqual(results.map(row => row.created).sort(), [false, true]);
  assert.equal(results[0].total, 40 * 1024 ** 3);
  assert.equal(f.rows[0].detached, true);
  assert.ok(f.calls.some(args => args[0] === 'run' && args.includes('--detach')));
});

test('existing undersized or full builders are retained and rejected before a workload build', async t => {
  const f = fixture(t);
  f.rows.push({ name: 'sbx-kit-builder', id: 'existing', agent: 'sbx-kit-builder' });
  f.disk(`${10 * 1024 ** 3} ${8 * 1024 ** 3}\n`);
  await assert.rejects(ensureKitBuilder(f), /too small.*volumeSize=40g/);
  f.disk(`${40 * 1024 ** 3} ${2 * 1024 ** 3}\n`);
  await assert.rejects(ensureKitBuilder(f), /build headroom/);
  assert.equal(f.calls.some(args => ['create', 'rm', 'prune'].includes(args[0])), false);
  assert.equal(f.rows[0].id, 'existing');
});

test('unverifiable inventory, capacity or builder identity never triggers cache removal', async t => {
  const f = fixture(t);
  await assert.rejects(ensureKitBuilder({ ...f, run: () => '{}' }), /inventory/);
  f.rows.push({ name: 'sbx-kit-builder', id: 'foreign', agent: 'another-workload' });
  await assert.rejects(ensureKitBuilder(f), /verify.*builder/);
  f.rows[0].agent = 'sbx-kit-builder';
  f.disk('unreadable\n');
  await assert.rejects(ensureKitBuilder(f), /disk capacity/);
  assert.equal(f.calls.some(args => ['create', 'rm', 'prune'].includes(args[0])), false);
});

test('builder readiness refuses an unconfirmed detach or a changed provider identity', async t => {
  const f = fixture(t);
  f.rows.push({ name: 'sbx-kit-builder', id: 'original', agent: 'sbx-kit-builder' });
  await assert.rejects(ensureKitBuilder({ ...f, run: (program, args) => args[0] === 'run' ? '' : f.run(program, args) }), /detached.*ownership/);
  await assert.rejects(ensureKitBuilder({ ...f, run: (program, args) => {
    const result = f.run(program, args);
    if (args[0] === 'run') f.rows[0].id = 'replacement';
    return result;
  } }), /detached.*ownership/);
  assert.equal(f.calls.some(args => ['create', 'rm', 'prune'].includes(args[0])), false);
});
