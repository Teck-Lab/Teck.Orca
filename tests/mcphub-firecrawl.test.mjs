import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchThroughMCPHub } from '../runtime/omp/extensions/lib/mcphub-firecrawl.mjs';

function fixture(result = { content: [{ type: 'text', text: JSON.stringify({ markdown: '# Self-hosted page', metadata: { title: 'Example' } }) }] }) {
  const requests = [];
  const fetch = async (url, init) => {
    const message = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, ...init, message });
    if (init.method === 'DELETE' || message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const response = message.method === 'initialize' ? { protocolVersion: '2025-06-18' }
      : message.method === 'tools/list' ? { tools: [{ name: 'firecrawl-firecrawl_scrape' }] } : result;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: response }), {
      headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'firecrawl-probe' },
    });
  };
  return { requests, options: { fetch, environment: { MCPHUB_API_KEY: 'proxy-managed', OMNIROUTE_API_KEY: 'model-only' } } };
}

test('URL reads use self-hosted Firecrawl through MCPHub, preserve Markdown and close the session', async () => {
  const f = fixture();
  assert.deepEqual(await fetchThroughMCPHub('https://example.com', f.options), {
    url: 'https://example.com', provider: 'mcphub/firecrawl', content: '# Self-hosted page', metadata: { title: 'Example' },
  });
  assert.ok(f.requests.every(r => r.url === 'https://mcp.tecklab.dk/mcp/firecrawl'));
  assert.ok(f.requests.every(r => r.headers.Authorization === 'Bearer proxy-managed' && r.redirect === 'error'));
  assert.deepEqual(f.requests.find(r => r.message?.method === 'tools/call').message.params, {
    name: 'firecrawl-firecrawl_scrape', arguments: { url: 'https://example.com', formats: ['markdown'], onlyMainContent: true },
  });
  assert.equal(f.requests.at(-1).method, 'DELETE');
});

test('structured Firecrawl responses and raw Markdown are both readable', async () => {
  for (const result of [{ structuredContent: { data: { markdown: '# Structured' } } }, { content: [{ type: 'text', text: '# Raw' }] }]) {
    const f = fixture(result);
    assert.match((await fetchThroughMCPHub('https://example.com', f.options)).content, /^# /);
  }
});

test('Firecrawl tool errors and empty results fail without a paid-service fallback', async () => {
  for (const result of [{ isError: true, content: [{ type: 'text', text: 'Scrape failed' }] }, { content: [{ type: 'text', text: '{}' }] }]) {
    const f = fixture(result);
    await assert.rejects(fetchThroughMCPHub('https://example.com', f.options), /Scrape failed|no Markdown/);
    assert.ok(f.requests.every(r => r.url === 'https://mcp.tecklab.dk/mcp/firecrawl'));
    assert.equal(f.requests.at(-1).method, 'DELETE');
  }
});

test('missing MCPHub auth never borrows the model credential', async () => {
  const f = fixture();
  f.options.environment = { OMNIROUTE_API_KEY: 'model-only' };
  await assert.rejects(fetchThroughMCPHub('https://example.com', f.options), /MCPHUB_API_KEY/);
  assert.equal(f.requests.length, 0);
});
