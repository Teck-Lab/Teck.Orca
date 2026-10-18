#!/usr/bin/env node

const serverUrl = process.env.MCP_SERVER_URL?.trim() || "https://mcp.tecklab.dk/mcp/github";
const apiKey = process.env.MCPHUB_API_KEY?.trim();
if (!apiKey) throw new Error("MCPHUB_API_KEY sentinel is unavailable");

const decodeResponse = async (response, expectedId) => {
  if (!response.ok) {
    throw new Error(`MCPHub GitHub server returned HTTP ${response.status}`);
  }
  if (response.status === 202 || response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    for (const line of (await response.text()).split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const message = JSON.parse(line.slice(5).trim());
      if (expectedId === undefined || message.id === expectedId) return message;
    }
    throw new Error(`MCPHub GitHub server returned no response for request ${expectedId}`);
  }
  return await response.json();
};

const post = async (message, sessionId, protocolVersion) => {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    Authorization: apiKey,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  const response = await fetch(serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(30_000),
  });
  return {
    message: await decodeResponse(response, message.id),
    sessionId: response.headers.get("Mcp-Session-Id") ?? sessionId,
  };
};

const protocolVersion = "2025-06-18";
const initialized = await post({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "teck-sandbox-readiness", version: "1" },
  },
});
if (initialized.message?.error) {
  throw new Error(initialized.message.error.message ?? "MCP initialize failed");
}
if (!initialized.sessionId) throw new Error("MCPHub GitHub server returned no session ID");

await post(
  { jsonrpc: "2.0", method: "notifications/initialized" },
  initialized.sessionId,
  protocolVersion,
);
const tools = await post(
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  initialized.sessionId,
  protocolVersion,
);
if (tools.message?.error) throw new Error(tools.message.error.message ?? "MCP tools/list failed");
const names = new Set((tools.message?.result?.tools ?? []).map((tool) => tool.name));
const toolNames = [...names].sort();
const requiredToolAliases = [
  ["issue_read"],
  ["sub_issue_write", "add_sub_issue"],
];

  for (const aliases of requiredToolAliases) {
    if (!aliases.some((alias) => toolNames.some((name) => name.includes(alias)))) {
      throw new Error(
        `GitHub MCP does not expose any of ${aliases.join(" or ")}; available tools: ${toolNames.join(", ")}`
      );
    }
  }
process.stdout.write(`${JSON.stringify({
  baselineReady: true,
  dependencyTools: {
    read: toolNames.some((name) => name.includes("issue_dependency_read")),
    write: toolNames.some((name) => name.includes("issue_dependency_write")),
  },
})}\n`);

