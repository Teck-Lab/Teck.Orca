import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopRpc, desktopProfile } from '../runtime/orca-desktop-rpc.mjs';

test('Windows plugin workers resolve the desktop profile when APPDATA is absent', () => {
  assert.equal(desktopProfile({}, 'win32'), join(homedir(), 'AppData', 'Roaming', 'orca'));
  assert.equal(desktopProfile({ APPDATA: 'custom-roaming' }, 'win32'), join('custom-roaming', 'orca'));
  assert.equal(desktopProfile({ ORCA_USER_DATA_PATH: 'custom-profile' }, 'win32'), 'custom-profile');
});

async function fixture(t, respond) {
  const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\teck-ssh-rpc-' + randomUUID() : join(tmpdir(), 'teck-ssh-' + randomUUID() + '.sock');
  const received = [];
  const server = createServer(socket => { let pending = ''; socket.on('error', () => {}); socket.setEncoding('utf8');
    socket.on('data', b => { pending += b; const n = pending.indexOf('\n'); if (n < 0) return;
      const request = JSON.parse(pending.slice(0, n)); pending = pending.slice(n + 1); received.push(request);
      respond(socket, request);
    }); });
  await new Promise(resolve => server.listen(endpoint, resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  return { received, rpc: createDesktopRpc({ readMetadata: () => ({ runtimeId: 'desktop-1', authToken: 'test-only-token', transports: [{ kind: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint }] }), timeout: 1000 }) };
}
test('desktop SSH bridge authenticates a bounded local request and handles split response frames', async t => {
  const f = await fixture(t, (s, r) => { const frame = JSON.stringify({ id: r.id, ok: true, _meta: { runtimeId: 'desktop-1' }, result: { targets: [] } }) + '\n';
    s.write(frame.slice(0, 12)); s.write(frame.slice(12)); });
  assert.deepEqual(await f.rpc('ssh.listEditableTargets'), { targets: [] });
  assert.equal(f.received[0].authToken, 'test-only-token');
  await assert.rejects(f.rpc('terminal.create'), /Unsupported/);
  assert.equal(f.received.length, 1);
});
test('changed desktop identity and RPC refusal cannot be mistaken for successful registration', async t => {
  let wrongIdentity = true;
  const f = await fixture(t, (s, r) => s.write(JSON.stringify({ id: r.id, ok: false,
    _meta: { runtimeId: wrongIdentity ? 'other-desktop' : 'desktop-1' }, error: { code: 'not_permitted' } }) + '\n'));
  await assert.rejects(f.rpc('ssh.listEditableTargets'), /identity changed/);
  wrongIdentity = false;
  await assert.rejects(f.rpc('ssh.addTarget', { target: {} }), /refused.*not_permitted/);
});
