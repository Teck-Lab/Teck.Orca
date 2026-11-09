import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

import { searchThroughMCPHub } from "./lib/mcphub-search.mjs";
import { fetchThroughMCPHub } from "./lib/mcphub-firecrawl.mjs";

interface FetchResponse {
  provider?: string;
  url?: string;
  content?: string;
  metadata?: {
    title?: string | null;
    description?: string | null;
  } | null;
}

function isBareWebUrl(path: string): boolean {
  if (!/^https?:\/\//i.test(path)) return false;
  return !/:(?:raw|\d+(?:-\d+)?|-\d+)$/i.test(path);
}

async function invokeNativeRead(
  context: ExtensionContext,
  path: string,
  signal?: AbortSignal,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
  isError?: boolean;
}> {
  if (!context.invokeTool) {
    return {
      content: [{ type: "text", text: "Native read delegation is unavailable" }],
      isError: true,
    };
  }
  return await context.invokeTool({ path }, { signal });
}

export default function omniRouteResearchExtension(pi: ExtensionAPI): void {
  const z = pi.zod;

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search current web content through the MCPHub SearXNG server.",
    approval: "read",
    strict: true,
    parameters: z.object({
      query: z.string(),
      recency: z.enum(["day", "week", "month", "year"]).optional(),
      limit: z.number().optional(),
      max_tokens: z.number().optional(),
      temperature: z.number().optional(),
      num_search_results: z.number().optional(),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        const result = await searchThroughMCPHub(params, { signal });
        return {
          content: [{ type: "text", text: result.text }],
          details: { provider: result.provider },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "read",
    label: "Read",
    description:
      "Read local files and internal resources with native OMP behavior. Bare HTTP(S) URLs are fetched as Markdown through self-hosted Firecrawl on MCPHub.",
    approval: "read",
    strict: true,
    parameters: z.object({
      path: z.string(),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, context) {
      if (!isBareWebUrl(params.path)) return await invokeNativeRead(context, params.path, signal);
      try {
        const result: FetchResponse = await fetchThroughMCPHub(params.path, { signal });
        if (!result.content?.trim()) throw new Error("MCPHub Firecrawl returned no content");
        const notes = [
          `URL: ${result.url ?? params.path}`,
          `Reader: ${result.provider ?? 'mcphub/firecrawl'}`,
        ];
        if (result.metadata?.title) notes.push(`Title: ${result.metadata.title}`);
        return {
          content: [{ type: "text", text: `${notes.join("\n")}\n\n${result.content}` }],
          details: { kind: "url", provider: result.provider ?? 'mcphub/firecrawl' },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    },
  });
}


