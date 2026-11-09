import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeUsage, ompMessageTokens } from '../runtime/omp/extensions/lib/office-usage.mjs';

const message = (responseId, tokens, extra = {}) => ({ role: 'assistant', provider: 'omniroute', model: 'teck-executor', responseId, timestamp: 1000, usage: { totalTokens: tokens }, ...extra });
function context(sessionId = 'session', agent = { kind: 'main', id: 'Main', name: 'main' }, entries = [], parentSession) {
  return { agent, sessionManager: { getSessionId: () => sessionId,
    getHeader: () => ({ id: sessionId, timestamp: '2026-11-09T00:00:00Z', parentSession }), getEntries: () => entries } };
}
const entry = (message, timestamp = '2026-11-09T00:00:01Z') => ({ type: 'message', timestamp, message });

test('normalized totals include cache and reasoning once and retain provider orchestration usage', () => {
  assert.equal(ompMessageTokens(message('a', 195, { usage: { input: 20, output: 30, cacheRead: 100, cacheWrite: 40, reasoningTokens: 12, totalTokens: 195 } })), 195);
  assert.equal(ompMessageTokens(message('a', undefined, { usage: { input: 20, output: 30, cacheRead: 100, cacheWrite: 40, reasoningTokens: 12, contextTokens: 9999, orchestration: { input: 2, cacheRead: 1, output: 2 } } })), 195);
  assert.equal(ompMessageTokens({ role: 'toolResult', get details() { throw Error('Do not inspect tool results'); } }), undefined);
  assert.equal(ompMessageTokens({ role: 'user', usage: { totalTokens: 300 } }), undefined);
  for (const invalid of [-1, 1.5, NaN, Infinity, '120', null, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(ompMessageTokens(message('a', invalid)), undefined);
});

test('repeated finalized messages and corrected snapshots do not count a response twice', () => {
  const usage = createOfficeUsage(), ctx = context();
  assert.equal(usage.observe(message('response-a', 120), ctx), 120);
  assert.equal(usage.observe(message('response-a', 120), ctx), 120);
  assert.equal(usage.observe(message('response-a', 140), ctx), 140);
  assert.equal(usage.observe(message('response-a', 100), ctx), 140);
  assert.equal(usage.observe(message('response-b', 80, { stopReason: 'error', retryRecovery: { status: 'recovered' } }), ctx), 220);
  assert.equal(usage.observe(message('response-c', 90), ctx), 310, 'a separate paid retry response is real usage');
  assert.equal(usage.observe({ role: 'toolResult', toolName: 'task', details: { usage: { totalTokens: 5000 } } }, ctx), 310);
});

test('restored totals exclude inherited fork history, helper aggregates and message content', () => {
  const own = message('own', 300);
  Object.defineProperty(own, 'content', { get() { throw Error('Private content must never be read'); } });
  Object.defineProperty(own, 'credentialId', { get() { throw Error('Credential context must never be read'); } });
  const entries = [entry(message('inherited', 9000), '2026-11-08T23:59:59Z'), entry(own),
    entry({ role: 'toolResult', toolName: 'task', details: { usage: { totalTokens: 10000 } } }),
    { type: 'model_usage', timestamp: '2026-11-09T00:00:02Z', usage: { totalTokens: 500 } }];
  const usage = createOfficeUsage(), ctx = context('fork', { kind: 'sub', id: '1-worker', name: 'task' }, entries, 'parent');
  assert.equal(usage.total(ctx), 300);
  assert.equal(usage.observe({ ...message('own', 300) }, ctx), 300, 'message_end may follow persistence of the same response');
  assert.equal(usage.observe(message('next', 75), ctx), 375);
  const restored = createOfficeUsage(); assert.equal(restored.total(ctx), 300, 'restoring does not replay earlier counters to the parent');
});

test('parent, native helper, advisor callbacks and switched sessions have independent ledgers', () => {
  const usage = createOfficeUsage(), parent = context('root', undefined, [entry(message('root', 600))]);
  const helper = context('helper', { kind: 'sub', id: '1-task', name: 'task', parentId: 'Main' }, [entry(message('helper', 150))], 'root');
  const advisor = { ...parent, agent: { kind: 'sub', id: 'advisor', name: 'advisor', parentId: 'Main' } };
  assert.equal(usage.total(parent), 600); assert.equal(usage.total(helper), 150); assert.equal(usage.total(advisor), 0);
  usage.observe(message('advice', 25), advisor);
  assert.equal(usage.total(advisor), 25); assert.equal(usage.total(parent), 600); assert.equal(usage.total(helper), 150);
  assert.equal(usage.observe(message('fresh', 30), context('other')), 30);
  assert.equal(usage.total(parent), 600);
});

test('messages without response IDs use required OMP timestamp identity and absent usage is not invented', () => {
  const usage = createOfficeUsage(), ctx = context();
  const first = message(undefined, 70);
  assert.equal(usage.observe(first, ctx), 70); assert.equal(usage.observe({ ...first }, ctx), 70);
  assert.equal(usage.observe({ ...first, timestamp: 2000 }, ctx), 140);
  assert.equal(usage.observe({ role: 'assistant', usage: { totalTokens: 500 } }, ctx), 140);
  assert.equal(usage.observe(message('unknown', undefined, { usage: undefined }), ctx), 140);
});

test('gateway placeholder response IDs do not collapse separate provider responses',()=>{
  const usage=createOfficeUsage(),ctx=context();
  assert.equal(usage.observe(message('gateway-reused-id',120,{timestamp:1000}),ctx),120);
  assert.equal(usage.observe(message('gateway-reused-id',180,{timestamp:2000}),ctx),300);
  assert.equal(usage.observe(message('gateway-reused-id',180,{timestamp:2000}),ctx),300);
});
