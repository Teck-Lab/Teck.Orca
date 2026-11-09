import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Make a small real POSIX tar stream, including its checksum and padding.
function archive(entries) {
  const buffers = [];
  for (const { name, content = '', type = '0', target = '' } of entries) {
    const data = Buffer.from(content), header = Buffer.alloc(512);
    header.write(name, 0, 100);
    for (const [offset, size, value] of [[100, 8, 0o644], [108, 8, 1000], [116, 8, 1000], [124, 12, data.length], [136, 12, 0]]) {
      header.write(value.toString(8).padStart(size - 1, '0') + '\0', offset, size);
    }
    header.fill(32, 148, 156);
    header.write(type, 156, 1); header.write(target, 157, 100);
    header.write('ustar\0', 257, 6); header.write('00', 263, 2);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8);
    buffers.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return Buffer.concat([...buffers, Buffer.alloc(1024)]);
}

function inventory(entries, action) {
  const dir = mkdtempSync(join(tmpdir(), 'teck-release-inventory-'));
  try {
    const output = join(dir, 'inventory.json');
    const result = spawnSync(process.platform === 'win32' ? 'py' : 'python3', ['scripts/kit-release-files.py', '--name', 'workflow', '--platform', 'linux/amd64', '--digest', 'sha256:' + 'a'.repeat(64), '--out', output], { input: archive(entries), encoding: 'utf8' });
    if (result.error) throw result.error;
    action(result, () => JSON.parse(readFileSync(output, 'utf8')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('streaming inventory hashes bytes and preserves ownership and link identity without extracting files', () => {
  inventory([{ name: './opt/', type: '5' }, { name: 'opt/tool', content: 'actual image bytes\n' }, { name: 'opt/link', type: '2', target: '/opt/tool' }, { name: 'etc/hosts', content: 'genuine image content\n' }, { name: 'usr/lib/systemd/system/system-systemd\\x2dmute.slice', content: 'unit' }], (result, read) => {
    assert.equal(result.status, 0, result.stderr);
    const value = read();
    assert.equal(value.platform, 'linux/amd64');
    assert.equal(value.entries.opt.type, 'directory');
    assert.deepEqual(value.entries['opt/tool'], { type: 'file', mode: 0o644, uid: 1000, gid: 1000, digest: 'sha256:' + createHash('sha256').update('actual image bytes\n').digest('hex') });
    assert.equal(value.entries['opt/link'].target, '/opt/tool');
    assert.equal(value.entries['etc/hosts'].digest,'sha256:'+createHash('sha256').update('genuine image content\n').digest('hex'));
    assert.equal(value.entries['usr/lib/systemd/system/system-systemd\\x2dmute.slice'].type,'file');
  });
});

test('streaming inventory rejects traversal, duplicates and special filesystem entries', () => {
  for (const entries of [[{ name: '../escape' }], [{ name: '/absolute' }], [{ name: 'opt/../../escape' }], [{ name: 'same' }, { name: './same' }], [{ name: 'device', type: '3' }]]) {
    inventory(entries, result => { assert.notEqual(result.status, 0); assert.match(result.stderr, /Unsafe image archive path|Duplicate image archive path|Unsupported special image entry/); });
  }
});
