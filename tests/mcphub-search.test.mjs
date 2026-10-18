import assert from "node:assert/strict";
import test from "node:test";
import { searchThroughMCPHub } from "../runtime/omp/extensions/lib/mcphub-search.mjs";

function fixture(overrides = {}) {
  const requests = [];
  const response = (message, sse = false) =>
    new Response(
      sse
        ? `: heartbeat\r\n\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress" })}\r\n\r\ndata: ${JSON.stringify(message)}\r\n\r\n`
        : JSON.stringify(message),
      {
        headers: {
          "Content-Type": sse ? "text/event-stream" : "application/json",
          "Mcp-Session-Id": "session-test",
        },
      },
    );
  const fetch = async (url, init) => {
    const request = {
      url,
      ...init,
      message: init.body ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    const { id, method } = request.message;
    if (overrides[method]) return overrides[method](request, response);
    if (method === "notifications/initialized")
      return new Response(null, { status: 202 });
    const result =
      method === "initialize"
        ? { protocolVersion: "2025-11-25" }
        : method === "tools/list"
          ? { tools: [{ name: "searxng-searxng_web_search" }] }
          : {
              content: [
                { type: "text", text: "Search result: https://example.com" },
              ],
            };
    return response({ jsonrpc: "2.0", id, result }, method === "tools/call");
  };
  return {
    requests,
    options: { fetch, environment: { MCPHUB_API_KEY: "proxy-managed" } },
  };
}

test("search negotiates MCP, sends the proxy sentinel and filters, reads SSE and closes the session", async () => {
  const f = fixture();
  const result = await searchThroughMCPHub(
    { query: "documentation", recency: "week", limit: 100 },
    f.options,
  );
  assert.equal(result.provider, "mcphub/searxng");
  assert.match(result.text, /https:\/\/example.com/);
  assert.deepEqual(
    f.requests.map((r) => r.message?.method ?? r.method),
    [
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
      "DELETE",
    ],
  );
  for (const request of f.requests) {
    assert.equal(request.url, "https://mcp.tecklab.dk/mcp/searxng");
    assert.equal(request.headers.Authorization, "Bearer proxy-managed");
    assert.equal(request.redirect, "error");
  }
  const called = f.requests.find((r) => r.message?.method === "tools/call");
  assert.equal(called.headers["MCP-Protocol-Version"], "2025-11-25");
  assert.equal(called.headers["Mcp-Session-Id"], "session-test");
  assert.deepEqual(called.message.params.arguments, {
    query: "documentation",
    num_results: 20,
    response_format: "text",
    time_range: "week",
  });
});

test("missing MCPHub credentials never use OmniRoute or make a request", async () => {
  const f = fixture();
  f.options.environment = { OMNIROUTE_API_KEY: "model-key" };
  await assert.rejects(
    searchThroughMCPHub({ query: "test" }, f.options),
    /MCPHUB_API_KEY/,
  );
  assert.equal(f.requests.length, 0);
});

test("authorization failure is surfaced without forwarding the key elsewhere", async () => {
  const f = fixture({
    initialize: () => new Response("denied", { status: 401 }),
  });
  await assert.rejects(
    searchThroughMCPHub({ query: "test" }, f.options),
    /HTTP 401/,
  );
  assert.equal(f.requests.length, 1);
});

test("tool errors are surfaced and their sessions are closed", async () => {
  const f = fixture({
    "tools/call": (r, response) =>
      response({
        id: r.message.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "Search Degraded" }],
        },
      }),
  });
  await assert.rejects(
    searchThroughMCPHub({ query: "test" }, f.options),
    /Search Degraded/,
  );
  assert.equal(f.requests.at(-1).method, "DELETE");
});

test("a cancelled call never starts a search", async () => {
  const f = fixture();
  f.options.signal = AbortSignal.abort();
  await assert.rejects(searchThroughMCPHub({ query: "test" }, f.options), {
    name: "AbortError",
  });
  assert.equal(f.requests.length, 0);
});
