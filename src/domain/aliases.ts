import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { charges, vendorAliases } from "@/db/schema";
import { DomainError } from "./errors";
import { aliasJson, chargeJson } from "./serialize";

/**
 * Alias rule: raw_pattern is a case-insensitive SUBSTRING of payee_raw. When several patterns match,
 * the longest pattern wins (ties broken by oldest alias). No wildcards or regex.
 */
export async function resolveVendor(
  db: Db,
  payeeRaw: string | null | undefined,
): Promise<{ vendor: string; category: string | null } | null> {
  if (!payeeRaw) return null;
  const rows = await db
    .select({ vendor: vendorAliases.canonicalVendor, category: vendorAliases.category })
    .from(vendorAliases)
    .where(sql`position(lower(${vendorAliases.rawPattern}) in lower(${payeeRaw})) > 0`)
    .orderBy(sql`length(${vendorAliases.rawPattern}) desc`, asc(vendorAliases.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export type UpsertAliasInput = {
  raw_pattern: string;
  canonical_vendor: string;
  category?: string | null;
  apply_to_existing?: boolean;
};

export async function upsertVendorAlias(db: Db, input: UpsertAliasInput) {
  const pattern = input.raw_pattern.trim();
  const vendor = input.canonical_vendor.trim();
  if (pattern.length < 2) throw new DomainError("invalid_input", "raw_pattern must be at least 2 characters");
  if (!vendor) throw new DomainError("invalid_input", "canonical_vendor must not be empty");

  const existing = await db
    .select()
    .from(vendorAliases)
    .where(sql`lower(${vendorAliases.rawPattern}) = lower(${pattern})`)
    .limit(1);
  let alias;
  let status: "created" | "updated";
  if (existing[0]) {
    [alias] = await db
      .update(vendorAliases)
      .set({ canonicalVendor: vendor, category: input.category ?? existing[0].category })
      .where(eq(vendorAliases.id, existing[0].id))
      .returning();
    status = "updated";
  } else {
    [alias] = await db
      .insert(vendorAliases)
      .values({ rawPattern: pattern, canonicalVendor: vendor, category: input.category ?? null })
      .returning();
    status = "created";
  }

  let applied: ReturnType<typeof chargeJson>[] = [];
  if (input.apply_to_existing) applied = await reapplyAliases(db, pattern);
  return { status, alias: aliasJson(alias), applied_count: applied.length, applied };
}

/**
 * Re-resolve rows whose payee_raw contains the pattern. A row's vendor is (re)set when it is blank or the row is
 * waiting on review for an unknown vendor; category is only filled when blank. needs_review is cleared on rows
 * whose review reason was the unknown vendor.
 */
export async function reapplyAliases(db: Db, pattern: string) {
  const rows = await db
    .select()
    .from(charges)
    .where(sql`${charges.payeeRaw} IS NOT NULL AND position(lower(${pattern}) in lower(${charges.payeeRaw})) > 0`);
  const updated = [];
  for (const row of rows) {
    const hit = await resolveVendor(db, row.payeeRaw);
    if (!hit) continue;
    const unknownReview = row.needsReview && (row.reviewReason === "unknown_vendor" || row.reviewReason === "flagged");
    if (row.vendor && !unknownReview && (row.category || !hit.category)) continue;
    const [u] = await db
      .update(charges)
      .set({
        vendor: row.vendor && !unknownReview ? row.vendor : hit.vendor,
        category: row.category ?? hit.category,
        ...(unknownReview ? { needsReview: false, reviewReason: null } : {}),
      })
      .where(eq(charges.id, row.id))
      .returning();
    updated.push(chargeJson(u));
  }
  return updated;
}

export async function listVendorAliases(db: Db) {
  const rows = await db.select().from(vendorAliases).orderBy(asc(vendorAliases.canonicalVendor), asc(vendorAliases.rawPattern));
  return rows.map(aliasJson);
}

export async function deleteVendorAlias(db: Db, id: string) {
  const [row] = await db.delete(vendorAliases).where(eq(vendorAliases.id, id)).returning();
  if (!row) throw new DomainError("not_found", `Alias ${id} does not exist`);
  return { status: "deleted", alias: aliasJson(row) };
}
