// Own-agent usage only. Never use OMP session stats here: those also include
// task-result aggregate usage, which would charge native helpers twice.
const valid = value => Number.isSafeInteger(value) && value >= 0;
const add = (left, right) => Math.min(Number.MAX_SAFE_INTEGER, left + right);

export function ompMessageTokens(message) {
  if (message?.role !== 'assistant' || !message.usage || typeof message.usage !== 'object') return undefined;
  const usage = message.usage;
  // OMP's normalized total already includes cache buckets, reasoning (inside
  // output), and any provider-side orchestration usage. Do not add them again.
  if (usage.totalTokens !== undefined) return valid(usage.totalTokens) ? usage.totalTokens : undefined;
  let total = 0, present = false;
  for (const value of [usage.input, usage.output, usage.cacheRead, usage.cacheWrite,
    usage.orchestration?.input, usage.orchestration?.output, usage.orchestration?.cacheRead]) {
    if (value === undefined) continue;
    if (!valid(value)) return undefined;
    total = add(total, value); present = true;
  }
  return present ? total : undefined;
}

function messageKey(message) {
  const provider = typeof message.provider === 'string' ? message.provider : '';
  const model = typeof message.model === 'string' ? message.model : '';
  const responseId = typeof message.responseId === 'string' ? message.responseId : '';
  // AssistantMessage.timestamp is required by OMP's documented shape. Some
  // gateways reuse a placeholder responseId, so that ID alone is insufficient.
  if (valid(message.timestamp)) return JSON.stringify([provider, model, message.timestamp, responseId]);
  return undefined;
}

export function createOfficeUsage() {
  const sessions = new Map();
  function observeInto(ledger, message) {
    const tokens = ompMessageTokens(message);
    if (tokens === undefined) return;
    const key = messageKey(message);
    if (key === undefined) return;
    const previous = ledger.messages.get(key) ?? 0;
    if (tokens <= previous) return;
    ledger.messages.set(key, tokens);
    ledger.total = add(ledger.total, tokens - previous);
  }
  function ledgerFor(ctx) {
    const manager = ctx?.sessionManager, sessionId = manager?.getSessionId?.();
    if (typeof sessionId !== 'string' || !sessionId) return { total: 0, messages: new Map() };
    const agent = ctx.agent ?? { kind: 'main', id: 'Main' };
    const key = JSON.stringify([sessionId, agent.id]);
    let ledger = sessions.get(key);
    if (ledger) return ledger;
    ledger = { total: 0, messages: new Map() };
    sessions.set(key, ledger);
    const header = manager.getHeader?.();
    const started = Date.parse(header?.timestamp);
    // Advisors can issue callbacks through their parent's runner/session. That
    // history is not the advisor's own provider usage. Helpers with their own
    // session header can restore their own post-creation messages normally.
    if (header?.id !== sessionId || !Number.isFinite(started) ||
        agent.kind === 'sub' && (agent.id === 'advisor' || agent.name === 'advisor' || !header.parentSession)) return ledger;
    for (const entry of manager.getEntries?.() ?? manager.getBranch?.() ?? []) {
      if (entry.type !== 'message' || entry.message?.role !== 'assistant') continue;
      const at = Date.parse(entry.timestamp);
      // Forked/seance sessions may include parent messages. Entry timestamps
      // precede the new header, so inherited conversation is never billed here.
      if (!Number.isFinite(at) || at < started) continue;
      observeInto(ledger, entry.message);
    }
    return ledger;
  }
  return {
    total(ctx) { return ledgerFor(ctx).total; },
    observe(message, ctx) { const ledger = ledgerFor(ctx); observeInto(ledger, message); return ledger.total; },
  };
}
