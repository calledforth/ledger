import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { checkBearer, rateLimited, unauthorized } from "@/mcp/auth";
import { createMcpServer } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Remote MCP endpoint (Streamable HTTP, stateless). Each request gets a fresh server + transport, which is what the
 * SDK expects in stateless mode and what suits serverless functions. JSON responses instead of SSE streams.
 */
async function handle(req: Request): Promise<Response> {
  if (!process.env.MCP_TOKEN) return unauthorized("not_configured");
  const auth = req.headers.get("authorization");
  if (!auth) return unauthorized("missing");
  if (!checkBearer(auth)) return unauthorized("invalid");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited", error_description: "Too many requests; retry in a minute" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    });
  }

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // In JSON-response mode the body is fully built before handleRequest resolves.
    void transport.close();
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
