// Only the native Agent Office presentation/awareness API, never arbitrary MCP.
const names = new Set(['office_status','office_peers','office_shout','office_celebrate','office_flip','office_meeting']);
export function officeToolName(name) {
  if (typeof name !== 'string') return null;
  if (names.has(name)) return name;
  const match = /^(?:mcp__|mcp_)?(?:agentoffice|agent-office|agent_office)(?:__|\/|-|_)(office_(?:status|peers|shout|celebrate|flip|meeting))$/.exec(name);
  return match && names.has(match[1]) ? match[1] : null;
}
export const isOfficeTool = name => officeToolName(name) !== null;

// Native MCP sanitizes these intentional public strings before returning them.
// Inspect only its structured payload, never arbitrary tool arguments or text.
export function officeSignalFromResult(tool, result) {
  const name = officeToolName(tool);
  if (!name || name === 'office_peers' || result?.isError) return null;
  let details = result?.details;
  if (details?.xdev?.tool === tool) details = details.xdev.inner;
  if (details?.isError) return null;
  const signal = details?.structuredContent?.officeSignal;
  if (signal?.v !== 1 || signal.kind !== name.slice('office_'.length)) return null;
  if (signal.kind === 'meeting') {
    const m = signal.meeting;
    if (!m || !['start','join','update','leave','end'].includes(m.action) ||
        typeof m.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(m.id)) return null;
    for (const k of ['title','agenda','decision']) if (m[k] !== undefined && (typeof m[k] !== 'string' || m[k].length > 200)) return null;
    if (m.action === 'start' && !m.title?.trim()) return null;
    return { kind: 'meeting', meeting: { action: m.action, id: m.id,
      ...Object.fromEntries(['title','agenda','decision'].filter(k => m[k] !== undefined).map(k => [k,m[k]])) } };
  }
  if (signal.text !== undefined && (typeof signal.text !== 'string' || signal.text.length > 200)) return null;
  if (signal.mood !== undefined && (typeof signal.mood !== 'string' || signal.mood.length > 32)) return null;
  if (['status','shout'].includes(signal.kind) && !signal.text?.trim()) return null;
  return { kind: signal.kind, ...(signal.text ? { summary: signal.text } : {}), ...(signal.mood ? { tool: signal.mood } : {}) };
}
