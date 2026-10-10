import "dotenv/config";

/** Real Postgres for tests: a local Docker/compose Postgres or a Neon branch. Never the production database. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://ledger:ledger@localhost:5432/ledger_test";
