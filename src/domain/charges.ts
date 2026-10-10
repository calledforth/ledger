import { and, desc, eq, gte, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { charges, type Charge, type NewCharge } from "@/db/schema";
import { blankToNull, maskLongNumbers, normalizeAmount, normalizeCardLast4, normalizeCurrency } from "@/lib/sanitize";
import { currentMonthIst, monthRangeIst, parseIstTimestamp } from "@/lib/time";
import { resolveVendor } from "./aliases";
import { DomainError, notFound } from "./errors";
import { chargeJson } from "./serialize";
import { linkChargeToSubscription } from "./subscriptions";

/**
 * Dedup tolerance: an HDFC alert and a vendor receipt are the same payment when their amounts differ by at most
 * this much (in the charge's own currency unit). Covers receipts that round tax differently from the bank.
 */
export const AMOUNT_TOLERANCE = "1.00";
/** Merge window either side of charged_at. */
export const DEDUP_WINDOW_DAYS = 2;

export const CHANNELS = ["UPI", "card", "NEFT", "IMPS", "auto-debit", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export type AddChargeInput = {
  amount: string | number;
  currency: string;
  charged_at: string;
  source: "hdfc_alert" | "vendor_receipt" | "manual";
  direction?: "debit" | "credit";
  vendor?: string | null;
  hdfc_message_id?: string | null;
  receipt_message_id?: string | null;
  invoice_number?: string | null;
  pdf_url?: string | null;
  channel?: Channel | null;
  payee_raw?: string | null;
  card_last4?: string | null;
  reference?: string | null;
  category?: string | null;
  notes?: string | null;
  subscription_id?: string | null;
  refund_of_charge_id?: string | null;
  needs_review?: boolean;
  review_reason?: string | null;
  /** Allow a retry to overwrite non-null columns on the existing row. */
  overwrite?: boolean;
};

export type AddChargeResult = {
  status: "created" | "existing" | "merged" | "created_needs_review";
  charge: ReturnType<typeof chargeJson>;
  candidates?: ReturnType<typeof chargeJson>[];
  updated_fields?: string[];
  linked_subscription_id?: string;
  warnings?: string[];
};

type Normalized = Omit<NewCharge, "id" | "createdAt" | "updatedAt">;

function normalize(input: AddChargeInput, warnings: string[]): Normalized {
  let chargedAt: Date;
  try {
    chargedAt = parseIstTimestamp(input.charged_at);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  let amount: string;
  let currency: string;
  try {
    amount = normalizeAmount(input.amount);
    currency = normalizeCurrency(input.currency);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  const last4 = normalizeCardLast4(input.card_last4);
  if (last4.warning) warnings.push(last4.warning);
  return {
    amount,
    currency,
    chargedAt,
    source: input.source,
    direction: input.direction ?? "debit",
    vendor: blankToNull(input.vendor),
    hdfcMessageId: blankToNull(input.hdfc_message_id),
    receiptMessageId: blankToNull(input.receipt_message_id),
    invoiceNumber: blankToNull(input.invoice_number),
    pdfUrl: blankToNull(input.pdf_url),
    channel: input.channel ?? null,
    payeeRaw: maskLongNumbers(blankToNull(input.payee_raw)),
    cardLast4: last4.value,
    reference: blankToNull(input.reference),
    category: blankToNull(input.category),
    notes: maskLongNumbers(blankToNull(input.notes)),
    subscriptionId: input.subscription_id ?? null,
    refundOfChargeId: input.refund_of_charge_id ?? null,
    needsReview: input.needs_review ?? false,
    reviewReason: input.needs_review ? (blankToNull(input.review_reason) ?? "flagged") : null,
  };
}

const FILLABLE: (keyof Normalized)[] = [
  "vendor",
  "hdfcMessageId",
  "receiptMessageId",
  "invoiceNumber",
  "pdfUrl",
  "channel",
  "payeeRaw",
  "cardLast4",
  "reference",
  "category",
  "notes",
  "subscriptionId",
  "refundOfChargeId",
];
const OVERWRITABLE: (keyof Normalized)[] = [...FILLABLE, "amount", "currency", "chargedAt", "direction"];

const BANK_FIELDS = ["channel", "payeeRaw", "cardLast4", "reference", "chargedAt", "amount"] as const;
const RECEIPT_FIELDS = ["vendor", "invoiceNumber", "pdfUrl"] as const;

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

async function findByMessageIds(db: Db, hdfc: string | null | undefined, receipt: string | null | undefined) {
  const conds: SQL[] = [];
  if (hdfc) conds.push(eq(charges.hdfcMessageId, hdfc));
  if (receipt) conds.push(eq(charges.receiptMessageId, receipt));
  if (conds.length === 0) return [];
  return db.select().from(charges).where(or(...conds));
}

/** A retry: fill blanks (or overwrite when asked). Never creates a new row. */
async function applyRetry(db: Db, existing: Charge, n: Normalized, overwrite: boolean) {
  const patch: Partial<Normalized> = {};
  for (const key of overwrite ? OVERWRITABLE : FILLABLE) {
    const incoming = n[key];
    if (incoming == null) continue;
    const current = existing[key as keyof Charge];
    const same = current instanceof Date && incoming instanceof Date ? current.getTime() === incoming.getTime() : current === incoming;
    if (same) continue;
    if (current == null || overwrite) (patch as Record<string, unknown>)[key] = incoming;
  }
  if (patch.vendor && existing.needsReview && existing.reviewReason === "unknown_vendor") {
    patch.needsReview = false;
    patch.reviewReason = null;
  }
  if (Object.keys(patch).length === 0) return { charge: existing, updated: [] as string[] };
  const [row] = await db.update(charges).set(patch).where(eq(charges.id, existing.id)).returning();
  return { charge: row, updated: Object.keys(patch).map(snake) };
}

/** Debit rows that look like the same real payment from the other side (bank vs receipt). */
async function findMergeCandidates(db: Db, n: Normalized, excludeId?: string) {
  const conds: SQL[] = [
    eq(charges.direction, "debit"),
    eq(charges.currency, n.currency),
    sql`abs(${charges.amount} - ${n.amount}::numeric) <= ${AMOUNT_TOLERANCE}::numeric`,
    sql`${charges.chargedAt} between ${n.chargedAt!.toISOString()}::timestamptz - interval '${sql.raw(String(DEDUP_WINDOW_DAYS))} days' and ${n.chargedAt!.toISOString()}::timestamptz + interval '${sql.raw(String(DEDUP_WINDOW_DAYS))} days'`,
  ];
  if (n.hdfcMessageId) conds.push(isNull(charges.hdfcMessageId));
  if (n.receiptMessageId) conds.push(isNull(charges.receiptMessageId));
  if (excludeId) conds.push(sql`${charges.id} <> ${excludeId}`);
  return db
    .select()
    .from(charges)
    .where(and(...conds))
    .orderBy(sql`abs(extract(epoch from ${charges.chargedAt} - ${n.chargedAt!.toISOString()}::timestamptz))`);
}

/**
 * Combine two rows describing one payment. Bank-side fields come from whichever row carries the HDFC alert;
 * receipt-side fields from whichever carries the receipt; anything else keeps the first non-null value.
 */
function combineRows(primary: Partial<Normalized>, other: Partial<Normalized>): Partial<Normalized> {
  const bank = primary.hdfcMessageId ? primary : other.hdfcMessageId ? other : null;
  const receipt = primary.receiptMessageId ? primary : other.receiptMessageId ? other : null;
  const out: Partial<Normalized> = {};
  for (const key of OVERWRITABLE) {
    const a = primary[key];
    const b = other[key];
    (out as Record<string, unknown>)[key] = a ?? b ?? null;
  }
  if (bank) for (const key of BANK_FIELDS) (out as Record<string, unknown>)[key] = bank[key] ?? out[key] ?? null;
  if (receipt) for (const key of RECEIPT_FIELDS) (out as Record<string, unknown>)[key] = receipt[key] ?? out[key] ?? null;
  out.hdfcMessageId = primary.hdfcMessageId ?? other.hdfcMessageId ?? null;
  out.receiptMessageId = primary.receiptMessageId ?? other.receiptMessageId ?? null;
  return out;
}

/**
 * Insert a charge with idempotency, alias resolution and the HDFC/receipt merge rule.
 * See AddChargeResult for the possible outcomes.
 */
export async function addCharge(db: Db, input: AddChargeInput): Promise<AddChargeResult> {
  const warnings: string[] = [];
  const n = normalize(input, warnings);

  // 1. Idempotency on message ids.
  const existing = await findByMessageIds(db, n.hdfcMessageId, n.receiptMessageId);
  if (existing.length > 1) {
    throw new DomainError(
      "conflict",
      "hdfc_message_id and receipt_message_id belong to two different charges. Call merge_charges with these ids if they are the same payment.",
      { charge_ids: existing.map((c) => c.id) },
    );
  }
  if (existing[0]) {
    const { charge, updated } = await applyRetry(db, existing[0], n, !!input.overwrite);
    return { status: "existing", charge: chargeJson(charge), updated_fields: updated, warnings: warnings.length ? warnings : undefined };
  }

  // 2. Alias resolution.
  if (!n.vendor && n.payeeRaw) {
    const hit = await resolveVendor(db, n.payeeRaw);
    if (hit) {
      n.vendor = hit.vendor;
      n.category = n.category ?? hit.category;
    }
  }

  // 3. Dedup / merge (debits that carry exactly one of the two message ids).
  let candidates: Charge[] = [];
  const oneSide = (n.hdfcMessageId ? 1 : 0) + (n.receiptMessageId ? 1 : 0) === 1;
  if (n.direction === "debit" && oneSide) {
    candidates = await findMergeCandidates(db, n);
    if (candidates.length === 1) {
      const target = candidates[0];
      const merged = combineRows(target, n);
      const stillUnknown = !merged.vendor;
      const reviewFromTarget = target.needsReview && !(target.reviewReason === "unknown_vendor" && !stillUnknown);
      const [row] = await db
        .update(charges)
        .set({
          ...merged,
          needsReview: reviewFromTarget || stillUnknown || n.needsReview,
          reviewReason: stillUnknown ? "unknown_vendor" : reviewFromTarget ? target.reviewReason : n.needsReview ? n.reviewReason : null,
          mergedFrom: [
            ...(target.mergedFrom ?? []),
            { id: "(incoming)", hdfc_message_id: n.hdfcMessageId ?? null, receipt_message_id: n.receiptMessageId ?? null, merged_at: new Date().toISOString() },
          ],
        })
        .where(eq(charges.id, target.id))
        .returning();
      const link = await maybeLinkSubscription(db, row);
      return {
        status: "merged",
        charge: chargeJson(link?.charge ?? row),
        linked_subscription_id: link?.subscriptionId,
        warnings: warnings.length ? warnings : undefined,
      };
    }
  }

  // 4. Insert.
  if (!n.vendor) {
    n.needsReview = true;
    n.reviewReason = n.reviewReason && n.reviewReason !== "flagged" ? n.reviewReason : "unknown_vendor";
  }
  if (candidates.length > 1) {
    n.needsReview = true;
    n.reviewReason = "possible_duplicate";
  }
  const inserted = await db.insert(charges).values(n).onConflictDoNothing().returning();
  if (!inserted[0]) {
    // Lost a race with a concurrent call carrying the same message id: return that row.
    const again = await findByMessageIds(db, n.hdfcMessageId, n.receiptMessageId);
    if (!again[0]) throw new DomainError("conflict", "Insert conflicted but no existing row was found; retry the call");
    const { charge, updated } = await applyRetry(db, again[0], n, !!input.overwrite);
    return { status: "existing", charge: chargeJson(charge), updated_fields: updated };
  }
  const row = inserted[0];
  const link = await maybeLinkSubscription(db, row);
  const final = link?.charge ?? row;
  return {
    status: candidates.length > 1 ? "created_needs_review" : final.needsReview ? "created_needs_review" : "created",
    charge: chargeJson(final),
    candidates: candidates.length > 1 ? candidates.map(chargeJson) : undefined,
    linked_subscription_id: link?.subscriptionId,
    warnings: warnings.length ? warnings : undefined,
  };
}

async function maybeLinkSubscription(db: Db, row: Charge) {
  if (row.direction !== "debit" || row.subscriptionId || !row.vendor || row.isRefunded) return null;
  return linkChargeToSubscription(db, row);
}

// ---------------------------------------------------------------------------------------------------------------

export type UpdateChargeInput = {
  id: string;
  vendor?: string | null;
  category?: string | null;
  notes?: string | null;
  needs_review?: boolean;
  subscription_id?: string | null;
  invoice_number?: string | null;
  channel?: Channel | null;
  reference?: string | null;
  direction?: "debit" | "credit";
  amount?: string | number;
  currency?: string;
  charged_at?: string;
};

export async function updateCharge(db: Db, input: UpdateChargeInput) {
  const [current] = await db.select().from(charges).where(eq(charges.id, input.id));
  if (!current) throw notFound("Charge", input.id);
  const patch: Partial<Normalized> = {};
  if (input.vendor !== undefined) patch.vendor = blankToNull(input.vendor);
  if (input.category !== undefined) patch.category = blankToNull(input.category);
  if (input.notes !== undefined) patch.notes = maskLongNumbers(blankToNull(input.notes));
  if (input.subscription_id !== undefined) patch.subscriptionId = input.subscription_id;
  if (input.invoice_number !== undefined) patch.invoiceNumber = blankToNull(input.invoice_number);
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.reference !== undefined) patch.reference = blankToNull(input.reference);
  if (input.direction !== undefined) patch.direction = input.direction;
  try {
    if (input.amount !== undefined) patch.amount = normalizeAmount(input.amount);
    if (input.currency !== undefined) patch.currency = normalizeCurrency(input.currency);
    if (input.charged_at !== undefined) patch.chargedAt = parseIstTimestamp(input.charged_at);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  if (input.needs_review !== undefined) {
    patch.needsReview = input.needs_review;
    patch.reviewReason = input.needs_review ? (current.reviewReason ?? "flagged") : null;
  } else if (patch.vendor && current.needsReview && (current.reviewReason === "unknown_vendor" || current.reviewReason === "flagged")) {
    // Naming the vendor resolves an unknown-vendor review.
    patch.needsReview = false;
    patch.reviewReason = null;
  }
  if (Object.keys(patch).length === 0) return { status: "unchanged", charge: chargeJson(current) };
  const [row] = await db.update(charges).set(patch).where(eq(charges.id, input.id)).returning();
  return { status: "updated", charge: chargeJson(row) };
}

// ---------------------------------------------------------------------------------------------------------------

export async function mergeCharges(db: Db, input: { keep_id: string; merge_id: string }) {
  if (input.keep_id === input.merge_id) throw new DomainError("invalid_input", "keep_id and merge_id must differ");
  const [keep] = await db.select().from(charges).where(eq(charges.id, input.keep_id));
  if (!keep) throw notFound("Charge", input.keep_id);
  const [other] = await db.select().from(charges).where(eq(charges.id, input.merge_id));
  if (!other) {
    if (keep.mergedFrom?.some((m) => m.id === input.merge_id)) return { status: "already_merged", charge: chargeJson(keep) };
    throw notFound("Charge", input.merge_id);
  }
  if (keep.hdfcMessageId && other.hdfcMessageId && keep.hdfcMessageId !== other.hdfcMessageId)
    throw new DomainError("not_allowed", "Both charges have different HDFC alerts, so they are two separate bank payments. Not merged.");
  if (keep.receiptMessageId && other.receiptMessageId && keep.receiptMessageId !== other.receiptMessageId)
    throw new DomainError("not_allowed", "Both charges have different vendor receipts, so they are two separate purchases. Not merged.");
  if (keep.currency !== other.currency)
    throw new DomainError("not_allowed", `Currencies differ (${keep.currency} vs ${other.currency}). Not merged.`);

  const combined = combineRows(keep, other);
  const vendor = combined.vendor;
  const [reviewKeep, reviewOther] = [keep, other].map((c) => c.needsReview && c.reviewReason !== "possible_duplicate" && c.reviewReason !== "unknown_vendor");
  const needsReview = !vendor || reviewKeep || reviewOther;

  // Re-point anything that referenced the absorbed row, then delete it before taking over its message ids.
  await db.update(charges).set({ refundOfChargeId: keep.id }).where(eq(charges.refundOfChargeId, other.id));
  await db.delete(charges).where(eq(charges.id, other.id));
  const [row] = await db
    .update(charges)
    .set({
      ...combined,
      source: keep.source,
      isRefunded: keep.isRefunded || other.isRefunded,
      needsReview,
      reviewReason: !vendor ? "unknown_vendor" : needsReview ? (reviewKeep ? keep.reviewReason : other.reviewReason) : null,
      mergedFrom: [
        ...(keep.mergedFrom ?? []),
        ...(other.mergedFrom ?? []),
        { id: other.id, hdfc_message_id: other.hdfcMessageId, receipt_message_id: other.receiptMessageId, merged_at: new Date().toISOString() },
      ],
    })
    .where(eq(charges.id, keep.id))
    .returning();
  const link = await maybeLinkSubscription(db, row);
  return { status: "merged", charge: chargeJson(link?.charge ?? row), deleted_id: other.id };
}

// ---------------------------------------------------------------------------------------------------------------

export type ListChargesInput = {
  month?: string;
  vendor?: string;
  needs_review?: boolean;
  direction?: "debit" | "credit";
  currency?: string;
  limit?: number;
  cursor?: string;
};

function encodeCursor(c: Charge) {
  return Buffer.from(`${c.chargedAt.toISOString()}|${c.id}`).toString("base64url");
}
function decodeCursor(cursor: string) {
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!at || !id || Number.isNaN(Date.parse(at))) throw new DomainError("invalid_input", "Invalid cursor");
  return { at: new Date(at), id };
}

export async function listCharges(db: Db, input: ListChargesInput = {}) {
  const month = input.month ?? currentMonthIst();
  let range;
  try {
    range = monthRangeIst(month);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const conds: SQL[] = [gte(charges.chargedAt, range.start), lt(charges.chargedAt, range.end)];
  if (input.vendor) conds.push(sql`lower(${charges.vendor}) = lower(${input.vendor})`);
  if (input.needs_review !== undefined) conds.push(eq(charges.needsReview, input.needs_review));
  if (input.direction) conds.push(eq(charges.direction, input.direction));
  if (input.currency) conds.push(eq(charges.currency, input.currency.toUpperCase()));
  if (input.cursor) {
    const { at, id } = decodeCursor(input.cursor);
    conds.push(sql`(${charges.chargedAt}, ${charges.id}) < (${at.toISOString()}::timestamptz, ${id}::uuid)`);
  }
  const rows = await db
    .select()
    .from(charges)
    .where(and(...conds))
    .orderBy(desc(charges.chargedAt), desc(charges.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    month,
    charges: page.map(chargeJson),
    next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function getCharge(db: Db, id: string) {
  const [row] = await db.select().from(charges).where(eq(charges.id, id));
  if (!row) throw notFound("Charge", id);
  return row;
}

// ---------------------------------------------------------------------------------------------------------------

export type MarkRefundedInput = {
  charge_id: string;
  /** Link an already-recorded credit row as the refund. */
  refund_charge_id?: string;
  /** Create (idempotently) the refund credit row. */
  create_refund_credit?: boolean;
  refund?: {
    amount?: string | number;
    charged_at?: string;
    hdfc_message_id?: string;
    reference?: string;
    channel?: Channel;
    notes?: string;
  };
};

export async function markRefunded(db: Db, input: MarkRefundedInput) {
  const original = await getCharge(db, input.charge_id);
  if (original.direction !== "debit") throw new DomainError("invalid_input", "Only debit charges can be marked refunded");
  const alreadyRefunded = original.isRefunded;

  let refundRow: Charge | null = null;
  if (input.refund_charge_id) {
    const credit = await getCharge(db, input.refund_charge_id);
    if (credit.direction !== "credit") throw new DomainError("invalid_input", "refund_charge_id must point at a credit row");
    if (credit.refundOfChargeId && credit.refundOfChargeId !== original.id)
      throw new DomainError("conflict", "That credit is already linked as the refund of a different charge", { refund_of_charge_id: credit.refundOfChargeId });
    [refundRow] = await db.update(charges).set({ refundOfChargeId: original.id }).where(eq(charges.id, credit.id)).returning();
  } else if (input.create_refund_credit || input.refund) {
    const [linked] = await db.select().from(charges).where(eq(charges.refundOfChargeId, original.id)).limit(1);
    if (linked) refundRow = linked;
    else {
      const res = await addCharge(db, {
        amount: input.refund?.amount ?? original.amount,
        currency: original.currency,
        charged_at: input.refund?.charged_at ?? new Date().toISOString(),
        source: input.refund?.hdfc_message_id ? "hdfc_alert" : "manual",
        direction: "credit",
        vendor: original.vendor,
        hdfc_message_id: input.refund?.hdfc_message_id,
        reference: input.refund?.reference,
        channel: input.refund?.channel ?? original.channel,
        category: "refund",
        notes: input.refund?.notes ?? `Refund of ${original.vendor ?? "charge"} ${original.id}`,
        refund_of_charge_id: original.id,
      });
      [refundRow] = await db.update(charges).set({ refundOfChargeId: original.id }).where(eq(charges.id, res.charge.id)).returning();
    }
  }

  const [updated] = alreadyRefunded
    ? [original]
    : await db.update(charges).set({ isRefunded: true }).where(eq(charges.id, original.id)).returning();
  return {
    status: alreadyRefunded ? "already_refunded" : "refunded",
    charge: chargeJson(updated),
    refund_credit: refundRow ? chargeJson(refundRow) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * Likely duplicates: debits with the same currency, amounts within AMOUNT_TOLERANCE, within 2 days of each other,
 * where the pair is not two distinct HDFC alerts or two distinct receipts (those are genuinely separate payments).
 */
export async function findPossibleDuplicates(db: Db, input: { month?: string } = {}) {
  const range = input.month ? monthRangeIst(input.month) : null;
  const rangeSql = range
    ? sql`and a.charged_at >= ${range.start.toISOString()}::timestamptz and a.charged_at < ${range.end.toISOString()}::timestamptz`
    : sql``;
  const pairs = await db.execute<{ a: string; b: string }>(sql`
    select a.id as a, b.id as b
    from charges a
    join charges b on a.id < b.id
      and a.direction = 'debit' and b.direction = 'debit'
      and a.currency = b.currency
      and abs(a.amount - b.amount) <= ${AMOUNT_TOLERANCE}::numeric
      and abs(extract(epoch from a.charged_at - b.charged_at)) <= ${DEDUP_WINDOW_DAYS * 86400}
      and not (a.hdfc_message_id is not null and b.hdfc_message_id is not null)
      and not (a.receipt_message_id is not null and b.receipt_message_id is not null)
      and (a.hdfc_message_id is null or a.receipt_message_id is null or b.hdfc_message_id is null or b.receipt_message_id is null)
    where true ${rangeSql}
  `);
  // Union-find into groups.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const { a, b } of pairs.rows) {
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const id of new Set(pairs.rows.flatMap((p) => [p.a, p.b]))) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  const ids = [...groups.values()].flat();
  if (ids.length === 0) return { groups: [] };
  const rows = await db.select().from(charges).where(sql`${charges.id} in ${ids}`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    groups: [...groups.values()].map((g) => ({
      charges: g.map((id) => chargeJson(byId.get(id)!)).sort((x, y) => x.charged_at.localeCompare(y.charged_at)),
    })),
  };
}
