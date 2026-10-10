import { afterAll, beforeEach } from "vitest";
import { TEST_DATABASE_URL } from "./db-url";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MCP_TOKEN ??= "test-token-0123456789abcdef";
process.env.SESSION_SECRET ??= "test-session-secret-that-is-long-enough-0123456789";

const { getDb, closeDb } = await import("@/db/client");
const { sql } = await import("drizzle-orm");

beforeEach(async () => {
  await getDb().execute(sql`TRUNCATE charges, subscriptions, vendor_aliases, upcoming_events, month_notes RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await closeDb();
});
