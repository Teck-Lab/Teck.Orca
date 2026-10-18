// A short-lived Streamable HTTP session uses the existing Docker-managed MCPHub
// binding. The host proxy injects the real credential; only its sentinel is here.
async function decodeResponse(response, expectedId) {
  if (!response.ok)
    throw new Error(`MCPHub search returned HTTP ${response.status}`);
  if (expectedId === undefined) {
    await response.body?.cancel();
    return;
  }
  if (
    !(response.headers.get("content-type") ?? "").includes("text/event-stream")
  ) {
    const message = await response.json();
    if (message.id !== expectedId)
      throw new Error("MCPHub search returned a mismatched response ID");
    return message;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024)
        throw new Error("MCPHub search response is too large");
      pending += decoder.decode(value, { stream: true });
      let end;
      while ((end = /\r?\n\r?\n/.exec(pending))) {
        const event = pending.slice(0, end.index);
        pending = pending.slice(end.index + end[0].length);
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const message = JSON.parse(data);
        if (message.id === expectedId) return message;
      }
    }
    throw new Error("MCPHub search stream ended without a response");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function searchThroughMCPHub(params, options = {}) {
  const environment = options.environment ?? process.env;
  const apiKey = environment.MCPHUB_API_KEY?.trim();
  if (!apiKey)
    throw new Error(
      "MCPHub search requires MCPHUB_API_KEY with access to searxng",
    );
  const url =
    environment.MCPHUB_SEARCH_URL?.trim() ||
    "https://mcp.tecklab.dk/mcp/searxng";
  const authorization = /^Bearer\s/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  const fetchImpl = options.fetch ?? fetch;
  const deadline = AbortSignal.timeout(60_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline])
    : deadline;
  let sessionId;
  let protocolVersion;
  let nextId = 1;
  const headers = () => ({
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    Authorization: authorization,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {}),
  });
  const post = async (method, parameters, notification = false) => {
    signal.throwIfAborted();
    const id = notification ? undefined : nextId++;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: headers(),
      redirect: "error",
      signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(id === undefined ? {} : { id }),
        method,
        ...(parameters === undefined ? {} : { params: parameters }),
      }),
    });
    sessionId = response.headers.get("Mcp-Session-Id") ?? sessionId;
    const message = await decodeResponse(response, id);
    if (message?.error)
      throw new Error(
        `MCPHub search ${method} failed: ${message.error.message ?? "protocol error"}`,
      );
    return message?.result;
  };

  try {
    const initialized = await post("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "teck-web-search", version: "1.0.0" },
    });
    protocolVersion = initialized?.protocolVersion;
    if (!protocolVersion)
      throw new Error("MCPHub search did not negotiate a protocol version");
    await post("notifications/initialized", undefined, true);
    let tool;
    let cursor;
    do {
      const listed = await post("tools/list", cursor ? { cursor } : {});
      tool = listed?.tools?.find(
        (candidate) =>
          candidate.name === "searxng_web_search" ||
          candidate.name.endsWith("-searxng_web_search") ||
          candidate.name.endsWith("__searxng_web_search"),
      );
      cursor = listed?.nextCursor;
    } while (!tool && cursor);
    if (!tool)
      throw new Error(
        "MCPHub searxng server does not expose searxng_web_search",
      );
    const requested = params.num_search_results ?? params.limit ?? 10;
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(20, Math.trunc(requested)))
      : 10;
    const result = await post("tools/call", {
      name: tool.name,
      arguments: {
        query: params.query,
        num_results: limit,
        response_format: "text",
        ...(params.recency ? { time_range: params.recency } : {}),
      },
    });
    const text = (result?.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (result?.isError)
      throw new Error(text || "MCPHub SearXNG search failed");
    if (!text) throw new Error("MCPHub SearXNG search returned no content");
    return { text, provider: "mcphub/searxng" };
  } finally {
    if (sessionId) {
      // Cleanup gets its own bounded deadline even after caller cancellation.
      try {
        const response = await fetchImpl(url, {
          method: "DELETE",
          headers: headers(),
          redirect: "error",
          signal: AbortSignal.timeout(5_000),
        });
        await response.body?.cancel();
      } catch {
        /* Cleanup must not replace a search result or its error. */
      }
    }
  }
}
