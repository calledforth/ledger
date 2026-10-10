import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { POST } from "../app/mcp/route";

const TOKEN = process.env.MCP_TOKEN!;
const URL_ = "http://localhost/mcp";

/**
 * In-process: the SDK client talks to the real route handler through a fetch shim (no server needed).
 * Set MCP_TEST_URL (e.g. http://localhost:3000/mcp) to run the same checks against a running dev server.
 */
const target = process.env.MCP_TEST_URL;
const routeFetch: typeof fetch = async (input, init) => {
  if (target) return fetch(input, init);
  const req = new Request(input instanceof Request ? input : String(input), init);
  return POST(req);
};

const initBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};
const post = (headers: Record<string, string>) =>
  routeFetch(target ?? URL_, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(initBody),
  });

async function connect(token = TOKEN) {
  const client = new Client({ name: "ledger-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(target ?? URL_), {
    fetch: routeFetch,
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

describe("MCP auth", () => {
  it("no token gives 401 with WWW-Authenticate", async () => {
    const res = await post({});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer /);
  });
  it("wrong token gives 401", async () => {
    const res = await post({ authorization: "Bearer nope-nope-nope-nope" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/invalid_token/);
  });
  it("correct token lists the tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    for (const t of [
      "add_charge", "update_charge", "merge_charges", "list_charges", "mark_refunded", "upsert_subscription", "list_subscriptions",
      "upcoming_payments", "cancel_subscription", "attach_invoice", "get_month_summary", "find_possible_duplicates",
      "upsert_vendor_alias", "list_vendor_aliases", "import_csv",
    ])
      expect(names).toContain(t);
    for (const t of tools) expect(t.description!.length).toBeGreaterThan(30);
    await client.close();
  });
});

describe("MCP tools end to end", () => {
  it("add_charge then list_charges, idempotent on retry, with actionable errors", async () => {
    const client = await connect();
    const args = { amount: 649, currency: "INR", charged_at: "2026-10-05T08:00:00", source: "hdfc_alert", hdfc_message_id: "mcp-1", payee_raw: "NETFLIX COM", vendor: "Netflix" };
    const a = await client.callTool({ name: "add_charge", arguments: args });
    expect((a.structuredContent as { status: string }).status).toBe("created");
    const b = await client.callTool({ name: "add_charge", arguments: args });
    expect((b.structuredContent as { status: string }).status).toBe("existing");
    expect(JSON.parse((b.content as { text: string }[])[0].text).status).toBe("existing");

    const list = await client.callTool({ name: "list_charges", arguments: { month: "2026-10" } });
    const rows = (list.structuredContent as { charges: { vendor: string; amount: string }[] }).charges;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ vendor: "Netflix", amount: "649.00" });

    const bad = await client.callTool({ name: "update_charge", arguments: { id: "00000000-0000-4000-8000-000000000000", vendor: "X" } });
    expect(bad.isError).toBe(true);
    expect(JSON.parse((bad.content as { text: string }[])[0].text).error.code).toBe("not_found");
    await client.close();
  });
});
