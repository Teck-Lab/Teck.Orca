// A short-lived Streamable HTTP session uses the existing Docker-managed MCPHub
// binding. The host proxy injects the real credential; only its sentinel is here.
async function decodeResponse(response, expectedId) {
  if (!response.ok)
    throw new Error(`MCPHub returned HTTP ${response.status}`);
  if (expectedId === undefined) {
    await response.body?.cancel();
    return;
  }
  if (
    !(response.headers.get("content-type") ?? "").includes("text/event-stream")
  ) {
    const message = await response.json();
    if (message.id !== expectedId)
      throw new Error("MCPHub returned a mismatched response ID");
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
        throw new Error("MCPHub response is too large");
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
    throw new Error("MCPHub stream ended without a response");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function callMCPHubTool({ service, tool: toolName, arguments: toolArguments }, options = {}) {
  if (!['searxng', 'firecrawl'].includes(service)) throw new Error('Unsupported MCPHub service');
  const environment = options.environment ?? process.env;
  const apiKey = environment.MCPHUB_API_KEY?.trim();
  if (!apiKey)
    throw new Error(
      `MCPHub requires MCPHUB_API_KEY with access to ${service}`,
    );
  const url =
    (service === 'searxng' ? environment.MCPHUB_SEARCH_URL?.trim() : environment.MCPHUB_FIRECRAWL_URL?.trim()) ||
    `https://mcp.tecklab.dk/mcp/${service}`;
  const authorization = /^Bearer\s/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  const fetchImpl = options.fetch ?? fetch;
  const deadline = AbortSignal.timeout(service === 'firecrawl' ? 120_000 : 60_000);
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
        `MCPHub ${service} ${method} failed: ${message.error.message ?? "protocol error"}`,
      );
    return message?.result;
  };

  try {
    const initialized = await post("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "teck-research", version: "1.0.0" },
    });
    protocolVersion = initialized?.protocolVersion;
    if (!protocolVersion)
      throw new Error("MCPHub did not negotiate a protocol version");
    await post("notifications/initialized", undefined, true);
    let tool;
    let cursor;
    const seenCursors = new Set();
    do {
      if (seenCursors.has(cursor) || seenCursors.size >= 100) throw new Error('MCPHub repeated or exceeded tool pagination');
      seenCursors.add(cursor);
      const listed = await post("tools/list", cursor ? { cursor } : {});
      tool = listed?.tools?.find(
        (candidate) =>
          candidate.name === toolName ||
          candidate.name.endsWith(`-${toolName}`) ||
          candidate.name.endsWith(`__${toolName}`),
      );
      cursor = listed?.nextCursor;
    } while (!tool && cursor);
    if (!tool)
      throw new Error(
        `MCPHub ${service} server does not expose ${toolName}`,
      );
    const result = await post("tools/call", {
      name: tool.name,
      arguments: toolArguments,
    });
    const text = (result?.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (result?.isError)
      throw new Error(text || `MCPHub ${service} tool failed`);
    return result;
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
