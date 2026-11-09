import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeMcpBridge } from '../runtime/omp/extensions/lib/office-mcp.mjs';
import { officeSignalFromResult } from '../runtime/omp/extensions/lib/office-tools.mjs';
import { withOfficeMcp } from '../runtime/office-guest.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const config = { version: 1, sourceId: '00000000-0000-4000-8000-000000000001', token: 'a'.repeat(64), url: 'http://127.0.0.1:28765/api/ingest' };
const rpc = (id, name, args = {}) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
function bridge(options = {}) {
  const replies = [];
  const server = createOfficeMcpBridge({ readConfig: () => config, cooldown: { take: () => 0 }, cwd: '/isolated/project',
    ...options, send: line => replies.push(JSON.parse(line)) });
  return { replies, async call(line) { await server.handleLine(line); return replies.at(-1); } };
}

test('bundled native MCP provides its actual five tools and scrubbed, request-scoped signals', async () => {
  const b = bridge();
  await b.call(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'oh-my-pi', version: 'test' } } }));
  const list = await b.call(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
  assert.deepEqual(list.result.tools.map(t => t.name), ['office_status','office_peers','office_shout','office_celebrate','office_flip']);
  await Promise.all([b.call(rpc('status','office_status',{text:'Checking cache',mood:'debugging'})), b.call(rpc('flip','office_flip',{reason:'this cache is haunted'}))]);
  const status = b.replies.find(r => r.id === 'status'), flip = b.replies.find(r => r.id === 'flip');
  assert.equal(status.result.structuredContent.officeSignal.kind, 'status');
  assert.equal(status.result.structuredContent.officeSignal.text, 'Checking cache');
  assert.equal(flip.result.structuredContent.officeSignal.kind, 'flip');
  assert.equal(flip.result.structuredContent.officeSignal.text, 'this cache is haunted');
  const secret = 'ghp_' + 'a'.repeat(40);
  const sanitized = await b.call(rpc('secret','office_status',{text:'Fix '+secret}));
  assert.ok(!JSON.stringify(sanitized).includes(secret));
  assert.ok(!JSON.stringify(status.result.structuredContent).includes('/isolated/project'));
});

test('native MCP batch responses keep each signal with its request and respect native cooldown failures', async () => {
  const b = bridge();
  const batch = await b.call('[' + rpc(1,'office_status',{text:'Testing'}) + ',' + rpc(2,'office_celebrate',{reason:'Regression green'}) + ']');
  assert.equal(batch.find(r => r.id === 1).result.structuredContent.officeSignal.kind, 'status');
  assert.equal(batch.find(r => r.id === 2).result.structuredContent.officeSignal.kind, 'celebrate');
  const limited = bridge({ cooldown: { take: () => 30000 } });
  const response = await limited.call(rpc(3,'office_flip',{reason:'No repeat'}));
  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent, undefined);
});

test('native peers read the current authenticated snapshot through the existing loopback tunnel', async () => {
  let request;
  const b = bridge({ request: async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ snapshot: { version: 1, startedAt: new Date().toISOString(), demo: false, workers: [], recent: [] } }), { status: 202 }); } });
  const response = await b.call(rpc(1,'office_peers'));
  assert.equal(request.url, config.url); assert.equal(request.options.headers.Authorization, 'Bearer '+config.token);
  assert.equal(JSON.parse(request.options.body).wantSnapshot, true);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent, undefined);
  assert.ok(!JSON.stringify(response).includes(config.token));
  const offline = bridge({ readConfig: () => { throw Error('No office'); } });
  const absent = await offline.call(rpc(2,'office_peers'));
  assert.match(absent.result.content[0].text, /isn't open/);
});

test('only successful native Office structured signals are relayed, including mounted calls', () => {
  const result = { details: { structuredContent: { officeSignal: { v: 1, kind: 'status', text: 'Waiting', mood: '⏳', cwd: '/PRIVATE' } } } };
  assert.deepEqual(officeSignalFromResult('agentoffice-office_status', result), { kind: 'status', summary: 'Waiting', tool: '⏳' });
  assert.equal(officeSignalFromResult('agentoffice-office_flip', result), null);
  assert.equal(officeSignalFromResult('agentoffice-office_peers', result), null);
  assert.equal(officeSignalFromResult('other-office_status', result), null);
  assert.equal(officeSignalFromResult('agentoffice-office_status', { ...result, isError: true }), null);
  assert.equal(officeSignalFromResult('agentoffice-office_status', { content: [{ type: 'text', text: JSON.stringify(result) }] }), null);
  assert.deepEqual(officeSignalFromResult('agentoffice-office_status', { details: { xdev: { tool: 'agentoffice-office_status', inner: result.details } } }), { kind: 'status', summary: 'Waiting', tool: '⏳' });
});

test('Office MCP setup adds only a missing connection and preserves user MCP settings', () => {
  const current = { customSetting: true, mcpServers: { github: { type: 'http', url: 'https://example.invalid', headers: { Authorization: 'private-placeholder' } } } };
  const next = withOfficeMcp(current);
  assert.deepEqual(next.mcpServers.github, current.mcpServers.github); assert.equal(next.customSetting, true);
  assert.equal(current.mcpServers.agentoffice, undefined); assert.equal(next.mcpServers.agentoffice.type, 'stdio');
  assert.strictEqual(withOfficeMcp(next), next);
  const custom = { mcpServers: { 'agent-office': { command: 'custom-office' } } };
  assert.strictEqual(withOfficeMcp(custom), custom);
  for (const invalid of [null, [], { mcpServers: [] }, { mcpServers: null }]) assert.throws(() => withOfficeMcp(invalid));
});

test('the installed stdio entry answers real MCP frames without logging on stdout',()=>{
  const entry=fileURLToPath(new URL('../runtime/omp/extensions/lib/office-mcp.mjs',import.meta.url));
  const frames=[JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'oh-my-pi',version:'test'}}}),
    JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})];
  const child=spawnSync(process.execPath,[entry],{input:frames.join('\n')+'\n',encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(child.status,0,child.stderr);const replies=child.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert.equal(replies.find(r=>r.id===2).result.tools.length,5);
});
