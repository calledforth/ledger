/** npm run import:csv -- path/to/file.csv [--dry-run] */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { closeDb, getDb } from "@/db/client";
import { importCsv, type ImportReport } from "@/domain/importCsv";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run import:csv -- path/to/file.csv [--dry-run]");
  process.exit(1);
}

function print(r: ImportReport) {
  const line = (k: string, v: unknown) => console.log(`  ${k.padEnd(30)} ${v}`);
  console.log(`\nImport report${r.dry_run ? " (DRY RUN, nothing written)" : ""}`);
  line("rows read", r.rows_read);
  line("transaction rows", r.transaction_rows);
  line("mandate rows", r.mandate_rows);
  line("charges created", r.charges.created);
  line("charges created (needs review)", r.charges.created_needs_review);
  line("charges existing", r.charges.existing);
  line("charges merged", r.charges.merged);
  line("credits", r.credits);
  line("refunds linked", r.refunds_linked);
  line("mandate events applied", Object.entries(r.mandate_events_applied).map(([k, v]) => `${k} ${v}`).join(", "));
  line("mandate events already applied", r.mandate_events_skipped_existing);
  line("rows flagged for review", r.flagged_for_review);
  line("rows rejected", r.rejected.length);
  for (const x of r.rejected) console.log(`    line ${x.line}: ${x.reason}`);
  if (r.warnings.length) console.log(`  warnings`);
  for (const w of r.warnings) console.log(`    line ${w.line}: ${w.message}`);
  if (r.count_warning) console.warn(`\nWARNING: ${r.count_warning}`);
}

try {
  const report = await importCsv(getDb(), readFileSync(file, "utf8"), { dry_run: args.includes("--dry-run") });
  print(report);
} finally {
  await closeDb();
}
