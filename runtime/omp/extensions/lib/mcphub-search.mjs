import { callMCPHubTool } from './mcphub-client.mjs';

export async function searchThroughMCPHub(params, options = {}) {
  const requested = params.num_search_results ?? params.limit ?? 10;
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(20, Math.trunc(requested))) : 10;
  const result = await callMCPHubTool({ service: 'searxng', tool: 'searxng_web_search', arguments: {
    query: params.query, num_results: limit, response_format: 'text',
    ...(params.recency ? { time_range: params.recency } : {}),
  } }, options);
  const text = (result?.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n').trim();
  if (!text) throw new Error('MCPHub SearXNG search returned no content');
  return { text, provider: 'mcphub/searxng' };
}
