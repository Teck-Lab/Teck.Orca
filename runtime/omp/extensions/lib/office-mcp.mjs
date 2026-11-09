// Adapter around Agent Office's own MCP implementation. Identity/transport is
// supplied by the OMP observer; the five native handlers still own semantics,
// text scrubbing, mood parsing, cooldowns and the peer briefing.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMcpServer, OFFICE_VERSION } from './office-mcp-server.mjs';

export function readOfficeConfig() {
  const config = JSON.parse(readFileSync('/etc/teck-orca/office.json', 'utf8'));
  if (config.version !== 1 || !/^http:\/\/127\.0\.0\.1:\d+\/api\/ingest$/.test(config.url) ||
      !/^[a-f0-9]{64}$/.test(config.token) || !/^[a-f0-9-]{16,64}$/.test(config.sourceId)) throw Error('Office unavailable');
  return config;
}

export function createOfficeMcpBridge({ send, readConfig = readOfficeConfig, request = fetch, cooldown, cwd, now } = {}) {
  const calls = new AsyncLocalStorage();
  const server = createMcpServer({ version: OFFICE_VERSION, agentHint: 'omp', cooldown, cwd, now,
    findOffice: async () => { try { return Number(new URL(readConfig().url).port); } catch { return null; } },
    fetchSnapshot: async () => {
      try {
        const config = readConfig();
        const response = await request(config.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
          body: JSON.stringify({ version: 1, sourceId: config.sourceId, events: [], wantSnapshot: true }), signal: AbortSignal.timeout(1200) });
        if (response.status !== 202) { await response.body?.cancel(); return null; }
        const { snapshot } = await response.json();
        return snapshot?.version === 1 && Array.isArray(snapshot.workers) ? snapshot : null;
      } catch { return null; }
    },
    outbox: { file: 'observer://agentoffice', write(signal) {
      const call = calls.getStore();
      if (!call) return 'Missing request context';
      call.signal = { v: 1, kind: signal.kind, ...(signal.text ? { text: signal.text } : {}), ...(signal.mood ? { mood: signal.mood } : {}) };
      return null;
    } },
    send(line) {
      const message = JSON.parse(line), call = calls.getStore();
      if (call?.signal && message.id === call.id && message.result && !message.result.isError)
        message.result.structuredContent = { officeSignal: call.signal };
      if (call?.responses && message.id === call.id && !message.method) call.responses.push(message);
      else send(JSON.stringify(message));
    },
  });
  return { async handleLine(line) {
    // Preserve native validation/error behavior; associate each batch member
    // separately so concurrent helper calls cannot borrow one another's signal.
    let parsed;
    try { if (line.length > 4 * 1024 * 1024) return; parsed = JSON.parse(line); }
    catch { return server.handleLine(line); }
    if (!Array.isArray(parsed)) return calls.run({ id: parsed?.id }, () => server.handleLine(line));
    if (!parsed.length) return server.handleLine(line);
    const responses = [];
    await Promise.all(parsed.map(message => calls.run({ id: message?.id, responses }, () => server.handleLine(JSON.stringify(message)))));
    if (responses.length) send(JSON.stringify(responses));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const bridge = createOfficeMcpBridge({ send: line => process.stdout.write(line + '\n') });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => { void bridge.handleLine(line).catch(() => { process.stderr.write('Office MCP request failed\n'); }); });
}
