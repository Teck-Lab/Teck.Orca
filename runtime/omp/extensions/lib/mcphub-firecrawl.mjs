import { callMCPHubTool } from './mcphub-client.mjs';

export async function fetchThroughMCPHub(url, options = {}) {
  const target = new URL(url);
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error('Expected a credential-free HTTP(S) page URL');
  const result = await callMCPHubTool({ service: 'firecrawl', tool: 'firecrawl_scrape', arguments: {
    url, formats: ['markdown'], onlyMainContent: true,
  } }, options);
  const text = (result?.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n').trim();
  let parsed = result?.structuredContent;
  if (!parsed && text) {
    try { parsed = JSON.parse(text); }
    catch { parsed = { markdown: text }; }
  }
  const data = parsed?.data ?? parsed;
  if (data?.success === false || parsed?.success === false) throw new Error('MCPHub Firecrawl scrape failed');
  const content = data?.markdown;
  if (typeof content !== 'string' || !content.trim()) throw new Error('MCPHub Firecrawl returned no Markdown');
  return { url, provider: 'mcphub/firecrawl', content, metadata: data.metadata ?? null };
}
