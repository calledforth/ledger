import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

// node-postgres parses NUMERIC as string already; keep DATE as plain 'YYYY-MM-DD' strings.
pg.types.setTypeParser(1082, (v) => v);

/** Either the root database or a transaction. Every domain function takes one of these. */
export type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __ledgerPool?: pg.Pool; __ledgerDb?: NodePgDatabase<typeof schema> };

export function getPool(): pg.Pool {
  if (!globalForDb.__ledgerPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // Small pool: on Vercel each function instance holds a few connections to Neon's pooler (PgBouncer).
    globalForDb.__ledgerPool = new pg.Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForDb.__ledgerPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb.__ledgerDb) globalForDb.__ledgerDb = drizzle(getPool(), { schema });
  return globalForDb.__ledgerDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__ledgerPool?.end();
  globalForDb.__ledgerPool = undefined;
  globalForDb.__ledgerDb = undefined;
}

export { schema };
