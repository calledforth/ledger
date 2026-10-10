import { parse } from "csv-parse/sync";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { charges, subscriptions, upcomingEvents, type MandateEvent, type Subscription } from "@/db/schema";
import { blankToNull, maskLongNumbers, normalizeAmount, normalizeCardLast4, normalizeCurrency } from "@/lib/sanitize";
import { addMonths, diffDays, istDate, parseIstTimestamp } from "@/lib/time";
import { resolveVendor } from "./aliases";
import { addCharge, markRefunded, type Channel } from "./charges";
import { DomainError } from "./errors";
import { addUpcomingEvent } from "./upcoming";
import { advanceByCycle, cancelSubscription, findActiveSubscriptionForVendor, upsertSubscription } from "./subscriptions";

export const CSV_COLUMNS = [
  "date",
  "time",
  "direction",
  "amount",
  "currency",
  "channel",
  "vendor_raw",
  "card_last4",
  "reference",
  "gmail_message_id",
  "flag_unknown_vendor",
  "note",
] as const;

/** Alternative headers accepted too (e.g. Ma boi's export): datetime_ist, event_type, account_or_card_last4, flag_personal_payee. */
type Row = Partial<Record<(typeof CSV_COLUMNS)[number] | "datetime_ist" | "event_type" | "account_or_card_last4" | "flag_personal_payee" | "subject", string>>;
export type MandateType = "registered" | "upcoming" | "declined" | "cancelled";

export type ImportReport = {
  dry_run: boolean;
  rows_read: number;
  transaction_rows: number;
  mandate_rows: number;
  charges: { created: number; existing: number; merged: number; created_needs_review: number };
  credits: number;
  refunds_linked: number;
  mandate_events_applied: Record<MandateType, number>;
  mandate_events_skipped_existing: number;
  flagged_for_review: number;
  rejected: { line: number; reason: string }[];
  warnings: { line: number; message: string }[];
  count_warning?: string;
};

const TRUTHY = new Set(["true", "yes", "y", "1", "t"]);

// ---- field parsing --------------------------------------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n: number | string) => String(n).padStart(2, "0");

/** Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD/MM/YY and "12 Oct 2026". */
export function parseCsvDate(raw: string): string {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${p2(m[2])}-${p2(m[1])}`;
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s-,]+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${p2(MONTHS[m[2].toLowerCase()])}-${p2(m[1])}`;
  throw new Error(`unrecognised date "${raw}"`);
}

/** Accepts HH:MM, HH:MM:SS and 12-hour forms like "9:05 PM". Blank means 00:00. */
export function parseCsvTime(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "00:00:00";
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) throw new Error(`unrecognised time "${raw}"`);
  let h = Number(m[1]);
  if (m[4]) {
    const pm = m[4].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || Number(m[2]) > 59) throw new Error(`unrecognised time "${raw}"`);
  return `${p2(h)}:${m[2]}:${m[3] ?? "00"}`;
}

export function parseChannel(raw: string | undefined): Channel | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!s) return null;
  if (s.includes("upi")) return "UPI";
  if (s.includes("neft")) return "NEFT";
  if (s.includes("imps")) return "IMPS";
  if (/auto|nach|mandate|standing|^si$|ecs/.test(s)) return "auto-debit";
  if (/card|pos|visa|master|rupay|amex/.test(s)) return "card";
  return "other";
}

const TYPE_PATTERNS: [MandateType, RegExp][] = [
  ["declined", /declin|fail|reject|insufficient|bounce|unsuccessful/i],
  ["cancelled", /cancel|revok|terminat|stopped|deactivat/i],
  ["upcoming", /upcoming|will be debited|due|scheduled|remind|pre-?debit|notif|intimation/i],
  ["registered", /regist|creat|set ?up|activat|success|approved|mandate/i],
];
const MANDATE_WORDS = /\bmandate|e-?mandate|standing instruction|\bsi\b|autopay/i;
const MANDATE_TAG = /\bmandate[_ -](registered|upcoming|declined|cancelled|canceled)\b/i;

/**
 * Mandate-row rule (first match wins):
 *  1. event_type (or direction) names a mandate: mandate_registered, mandate-upcoming, upcoming_mandate,
 *     autopay_declined, "mandate", ... The other word gives the type; if there is none, the type comes from the note.
 *  2. direction is not debit/credit (blank or anything else) and the note mentions a mandate ("mandate",
 *     "e-mandate", "standing instruction", "SI", "autopay"). Type from the note.
 *  3. the note contains an explicit tag like "mandate_upcoming", whatever the direction says.
 * Type from text, checked in this order: declined, cancelled, upcoming, registered (so "registration failed" is a
 * decline). Rows that look like mandates but match no type are rejected.
 */
export function classifyRow(direction: string | undefined, note: string | undefined): { kind: "debit" | "credit" } | { kind: "mandate"; type: MandateType } | { kind: "invalid"; reason: string } {
  const d = (direction ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const n = note ?? "";
  const typeFrom = (text: string): MandateType | null => {
    for (const [t, re] of TYPE_PATTERNS) if (re.test(text)) return t;
    return null;
  };
  if (/^(e_)?mandate|_mandate$|^autopay|^si$|^si_|^standing_instruction/.test(d)) {
    const suffix = d.replace(/(e_)?mandate|autopay|standing_instruction|^si/g, "").replace(/^_+|_+$/g, "").replace("canceled", "cancelled");
    const t = (["registered", "upcoming", "declined", "cancelled"] as const).find((x) => x === suffix) ?? (suffix ? typeFrom(suffix) : null) ?? typeFrom(n);
    return t ? { kind: "mandate", type: t } : { kind: "invalid", reason: `mandate row with unknown event type (direction "${direction}")` };
  }
  const tag = n.match(MANDATE_TAG);
  if (tag) return { kind: "mandate", type: tag[1].toLowerCase().replace("canceled", "cancelled") as MandateType };
  if (["debit", "dr", "d", "withdrawal", "spent"].includes(d)) return { kind: "debit" };
  if (["credit", "cr", "c", "deposit", "received"].includes(d)) return { kind: "credit" };
  if (MANDATE_WORDS.test(n)) {
    const t = typeFrom(n);
    return t ? { kind: "mandate", type: t } : { kind: "invalid", reason: "mandate row with unknown event type" };
  }
  return { kind: "invalid", reason: `unknown direction "${direction ?? ""}" (expected debit, credit or a mandate event)` };
}

function findDateInText(text: string): string | null {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dmy = text.match(/\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/);
  if (dmy) return parseCsvDate(dmy[1]);
  const named = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (named && MONTHS[named[2].slice(0, 3).toLowerCase()]) return `${named[3]}-${p2(MONTHS[named[2].slice(0, 3).toLowerCase()])}-${p2(named[1])}`;
  return null;
}

// ---- import -----------------------------------------------------------------------------------------------------

class DryRunRollback extends Error {}

/** Map alternative headers onto the documented ones (in place). */
function normalizeRecord(r: Row) {
  if (r.datetime_ist && !r.date) {
    const m = r.datetime_ist.replace(/\(.*?\)/g, "").trim().match(/^(\S+)(?:[ T]+(.+))?$/);
    if (m) {
      r.date = m[1];
      r.time = m[2]?.trim() ?? "";
    }
  }
  if (r.account_or_card_last4 && r.card_last4 === undefined) {
    // An account's last four is not a card; keep it only on card payments.
    const ch = r.channel ?? "";
    r.card_last4 = /card|pos|visa|master|rupay/i.test(ch) && !/refund|reversal/i.test(ch) ? r.account_or_card_last4 : "";
  }
}

const titleCase = (s: string) =>
  /[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** "MERCHANT NAME | vpa@bank" -> "Merchant Name" (UPI alerts carry the payee name before the VPA). */
export function upiPayeeName(raw: string | undefined): string | null {
  if (!raw || !raw.includes("|")) return null;
  const name = raw.split("|")[0].trim();
  if (!name || name.includes("@") || /^\d+$/.test(name)) return null;
  return titleCase(name).slice(0, 80);
}

export type ImportOptions = {
  dry_run?: boolean;
  /** Counts the file is expected to contain; a mismatch is reported as a warning only. */
  expected?: { transactions: number; mandate: number };
};

export function decodeCsvInput(input: { csv_text?: string; csv_base64?: string }): string {
  if (input.csv_text && input.csv_base64) throw new DomainError("invalid_input", "Provide csv_text or csv_base64, not both");
  if (input.csv_text) return input.csv_text;
  if (input.csv_base64) return Buffer.from(input.csv_base64, "base64").toString("utf8");
  throw new DomainError("invalid_input", "Provide csv_text or csv_base64");
}

/**
 * One-time backfill. Runs the whole file in one transaction (rolled back for dry runs). Each row runs in its own
 * savepoint so a bad row is reported and skipped without aborting the rest. Idempotent: transaction rows are keyed
 * by gmail_message_id (stored as hdfc_message_id) and mandate events by the same id.
 */
export async function importCsv(db: Db, csvText: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const expected = opts.expected ?? { transactions: 52, mandate: 11 };
  const report: ImportReport = {
    dry_run: !!opts.dry_run,
    rows_read: 0,
    transaction_rows: 0,
    mandate_rows: 0,
    charges: { created: 0, existing: 0, merged: 0, created_needs_review: 0 },
    credits: 0,
    refunds_linked: 0,
    mandate_events_applied: { registered: 0, upcoming: 0, declined: 0, cancelled: 0 },
    mandate_events_skipped_existing: 0,
    flagged_for_review: 0,
    rejected: [],
    warnings: [],
  };

  let records: { record: Row; info: { lines: number } }[];
  try {
    records = parse(csvText, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_")),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      info: true,
      relax_column_count: true,
    }) as { record: Row; info: { lines: number } }[];
  } catch (e) {
    throw new DomainError("invalid_input", `CSV could not be parsed: ${(e as Error).message}`);
  }
  for (const r of records) normalizeRecord(r.record);
  if (records.length) {
    const missing = ["date", "amount", "currency"].filter((c) => !(c in records[0].record));
    if (!("direction" in records[0].record) && !("event_type" in records[0].record)) missing.push("direction");
    if (missing.length) throw new DomainError("invalid_input", `CSV is missing required columns: ${missing.join(", ")}. Expected: ${CSV_COLUMNS.join(", ")}`);
  }

  type Prepared = { line: number; row: Row; at: Date; cls: ReturnType<typeof classifyRow> };
  const prepared: Prepared[] = [];
  for (const { record, info } of records) {
    report.rows_read++;
    const line = info.lines;
    const eventType = (record.event_type ?? "").trim();
    const cls = eventType && !/^trans/i.test(eventType) ? classifyRow(eventType, record.note) : classifyRow(record.direction, record.note);
    if (cls.kind === "invalid") {
      report.rejected.push({ line, reason: cls.reason });
      continue;
    }
    if (cls.kind === "mandate") report.mandate_rows++;
    else report.transaction_rows++;
    try {
      const at = parseIstTimestamp(`${parseCsvDate(record.date ?? "")}T${parseCsvTime(record.time)}`);
      prepared.push({ line, row: record, at, cls });
    } catch (e) {
      report.rejected.push({ line, reason: (e as Error).message });
    }
  }
  // Chronological order so mandate notices, debits and subscription advances happen in the order they occurred.
  prepared.sort((a, b) => a.at.getTime() - b.at.getTime() || a.line - b.line);

  const run = async (tx: Db) => {
    for (const p of prepared) {
      try {
        await tx.transaction(async (sp) => {
          if (p.cls.kind === "mandate") await applyMandate(sp, p.row, p.at, p.cls.type, p.line, report);
          else if (p.cls.kind !== "invalid") await applyTransaction(sp, p.row, p.at, p.cls.kind, p.line, report);
        });
      } catch (e) {
        report.rejected.push({ line: p.line, reason: e instanceof DomainError ? e.message : `database error: ${(e as Error).message}` });
      }
    }
    if (opts.dry_run) throw new DryRunRollback();
  };

  try {
    await db.transaction(run);
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }

  if (report.transaction_rows !== expected.transactions || report.mandate_rows !== expected.mandate) {
    report.count_warning = `Expected ${expected.transactions} transaction rows and ${expected.mandate} mandate rows, found ${report.transaction_rows} and ${report.mandate_rows}.`;
  }
  report.rejected.sort((a, b) => a.line - b.line);
  return report;
}

async function applyTransaction(db: Db, row: Row, at: Date, direction: "debit" | "credit", line: number, report: ImportReport) {
  const last4 = normalizeCardLast4(row.card_last4);
  if (last4.warning) report.warnings.push({ line, message: last4.warning });
  const flagged = TRUTHY.has((row.flag_unknown_vendor ?? "").trim().toLowerCase());
  let amount: string, currency: string;
  try {
    amount = normalizeAmount(row.amount ?? "");
    currency = normalizeCurrency(row.currency || "INR");
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  const personal = TRUTHY.has((row.flag_personal_payee ?? "").trim().toLowerCase());
  // Vendor: an alias wins; otherwise the payee name a UPI alert carries (unless the row is flagged unknown).
  const alias = await resolveVendor(db, maskLongNumbers(row.vendor_raw ?? null));
  const vendor = alias ? null : flagged ? null : upiPayeeName(row.vendor_raw);
  const res = await addCharge(db, {
    amount,
    currency,
    charged_at: at.toISOString(),
    source: "hdfc_alert",
    direction,
    vendor,
    hdfc_message_id: blankToNull(row.gmail_message_id),
    channel: parseChannel(row.channel),
    payee_raw: row.vendor_raw,
    card_last4: last4.value,
    reference: row.reference,
    category: !alias?.category && personal ? "people" : undefined,
    notes: row.note,
    needs_review: flagged || undefined,
    review_reason: flagged ? "unknown_vendor" : undefined,
  });
  for (const w of res.warnings ?? []) report.warnings.push({ line, message: w });
  report.charges[res.status]++;
  if (direction === "credit") report.credits++;
  if (res.charge.needs_review && res.status !== "existing") report.flagged_for_review++;

  // Card reversals ("CRV POS ...", channel "card refund"): link to the charge they refund when exactly one fits.
  const isRefund = direction === "credit" && (/refund|reversal/i.test(row.channel ?? "") || /^CRV\s/i.test(row.vendor_raw ?? ""));
  if (isRefund && res.status !== "existing" && res.charge.vendor && !res.charge.refund_of_charge_id) {
    const candidates = await db
      .select({ id: charges.id })
      .from(charges)
      .where(
        and(
          eq(charges.direction, "debit"),
          eq(charges.isRefunded, false),
          eq(charges.currency, currency),
          sql`lower(${charges.vendor}) = lower(${res.charge.vendor})`,
          sql`${charges.chargedAt} between ${at.toISOString()}::timestamptz - interval '30 days' and ${at.toISOString()}::timestamptz`,
          sql`abs(${charges.amount} - ${amount}::numeric) <= greatest(${amount}::numeric * 0.02, 1)`,
        ),
      );
    if (candidates.length === 1) {
      await markRefunded(db, { charge_id: candidates[0].id, refund_charge_id: res.charge.id });
      report.refunds_linked++;
    } else {
      report.warnings.push({ line, message: `refund credit not linked: ${candidates.length} matching charges` });
    }
  }
}

async function applyMandate(db: Db, row: Row, at: Date, type: MandateType, line: number, report: ImportReport) {
  const raw = blankToNull(maskLongNumbers(row.vendor_raw ?? null));
  if (!raw) throw new DomainError("invalid_input", "mandate row has no vendor_raw");
  const alias = await resolveVendor(db, raw);
  const vendor = alias?.vendor ?? raw;
  const messageId = blankToNull(row.gmail_message_id);
  const date = istDate(at);
  const note = row.note ?? "";
  const ref = blankToNull(row.reference);
  // HDFC SI notices: "Max USD 23.60, frequency monthly, start 24/09/2026, end 24/09/2046".
  const maxMatch = note.match(/\bmax\.?\s*([A-Z]{3})?\s*([\d,]+(?:\.\d+)?)/i);
  const currency = normalizeCurrency(maxMatch?.[1] || row.currency || "INR");
  let rowAmount: string | null = null;
  if (row.amount && Number(row.amount.replace(/,/g, "")) !== 0) {
    try {
      rowAmount = normalizeAmount(row.amount);
    } catch {
      report.warnings.push({ line, message: `ignored unparseable amount "${row.amount}"` });
    }
  }
  const maxAmount = maxMatch && Number(maxMatch[2].replace(/,/g, "")) > 0 ? normalizeAmount(maxMatch[2]) : null;
  // Registrations record the mandate max as the subscription amount; notices use the amount in the row.
  const amount = type === "registered" ? (maxAmount ?? rowAmount) : (rowAmount ?? maxAmount);
  const event: MandateEvent = { type, date, amount: amount ?? undefined, message_id: messageId, note: maskLongNumbers(note) };
  // "As Presented" (variable amount, billed when the vendor charges) is treated as monthly.
  const cycle = /year|annual/i.test(note) ? "yearly" : "monthly";
  const startMatch = note.match(/\bstart\s+(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2})/i);
  const start = startMatch ? parseCsvDate(startMatch[1]) : date;

  // A cancellation names a specific mandate: only touch the subscription carrying that mandate ref.
  let sub: Subscription | null = type === "cancelled" && ref ? await findActiveSubscriptionByMandateRef(db, vendor, ref) : await findActiveSubscriptionForVendor(db, vendor, ref);
  // Events never apply to a subscription that started after them (keeps re-imports order-independent).
  if (sub && type !== "registered" && sub.startedAt > date) sub = null;
  if (messageId) {
    // Already applied (to any subscription, including one cancelled since)?
    const [seen] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(sql`${subscriptions.mandateInfo}->'events' @> ${JSON.stringify([{ message_id: messageId }])}::jsonb`)
      .limit(1);
    if (seen) {
      report.mandate_events_skipped_existing++;
      return;
    }
  }

  const appendEvent = async (s: Subscription, extra: Partial<Subscription> = {}) => {
    const info = s.mandateInfo ?? {};
    await db
      .update(subscriptions)
      .set({ mandateInfo: { ...info, events: [...(info.events ?? []), event] }, ...extra })
      .where(eq(subscriptions.id, s.id));
  };

  const ensureSub = async (): Promise<Subscription> => {
    if (sub) return sub;
    if (!amount) throw new DomainError("invalid_input", "mandate registration needs an amount (the mandate max)");
    const res = await upsertSubscription(db, {
      vendor,
      plan: "Auto-debit",
      amount,
      currency,
      cycle,
      started_at: start,
      keep_other_active: true,
      mandate_info: { max_amount: maxAmount ?? amount, currency, mandate_ref: ref, bank: "HDFC", events: [] },
    });
    const [created] = await db.select().from(subscriptions).where(eq(subscriptions.id, res.subscription.id));
    sub = created;
    return created;
  };

  switch (type) {
    case "registered": {
      const existed = !!sub;
      const s = await ensureSub();
      const info = s.mandateInfo ?? {};
      // The first payment usually goes through right before the mandate is set up (and, for older plans, earlier
      // cycles too). Link those debits to the subscription.
      const linked = await linkPastDebits(db, s, start, cycle);
      const next = s.nextChargeDate ?? (linked.firstPaid ? advanceByCycle(start, cycle) : start);
      await appendEvent(s, {
        nextChargeDate: next,
        ...(existed && amount
          ? { mandateInfo: { ...info, max_amount: maxAmount ?? amount, currency, mandate_ref: ref ?? info.mandate_ref ?? null, bank: "HDFC", events: [...(info.events ?? []), event] } }
          : {}),
      });
      break;
    }
    case "upcoming": {
      const s = await ensureSub();
      const expectedDate = findDateInText(note) ?? date;
      await addUpcomingEvent(db, {
        vendor,
        amount: amount ?? s.amount,
        currency,
        expected_date: expectedDate,
        kind: "mandate_upcoming",
        subscription_id: s.id,
        source_message_id: messageId,
        notes: maskLongNumbers(note) || null,
      });
      const refresh = !s.nextChargeDate || diffDays(expectedDate, s.nextChargeDate) >= -7;
      await appendEvent(s, refresh ? { nextChargeDate: expectedDate } : {});
      break;
    }
    case "declined": {
      const s = sub;
      if (!s) {
        report.warnings.push({ line, message: `declined auto-debit for "${vendor}" but no subscription exists yet; recorded nothing` });
        return;
      }
      const pending = await db
        .select()
        .from(upcomingEvents)
        .where(and(eq(upcomingEvents.subscriptionId, s.id), eq(upcomingEvents.status, "pending")));
      const nearest = pending.sort((a, b) => Math.abs(diffDays(a.expectedDate, date)) - Math.abs(diffDays(b.expectedDate, date)))[0];
      if (nearest && Math.abs(diffDays(nearest.expectedDate, date)) <= 7)
        await db.update(upcomingEvents).set({ status: "declined" }).where(eq(upcomingEvents.id, nearest.id));
      await appendEvent(s);
      break;
    }
    case "cancelled": {
      if (!sub) {
        report.warnings.push({ line, message: `cancelled mandate for "${vendor}" but no active subscription; recorded nothing` });
        return;
      }
      const s = sub;
      await appendEvent(s);
      await cancelSubscription(db, { id: s.id, cancelled_on: date, ended_at: date });
      break;
    }
  }
  report.mandate_events_applied[type]++;
}

/** Link unlinked debits of the same vendor that fall within ±3 days of the mandate start or earlier cycles. */
async function linkPastDebits(db: Db, sub: Subscription, start: string, cycle: "monthly" | "yearly") {
  const anchors = (cycle === "yearly" ? [0, 12] : [0, 1, 2, 3]).map((k) => addMonths(start, -k));
  let firstPaid = false;
  for (const [i, anchor] of anchors.entries()) {
    const rows = await db
      .update(charges)
      .set({ subscriptionId: sub.id })
      .where(
        and(
          eq(charges.direction, "debit"),
          sql`${charges.subscriptionId} is null`,
          sql`lower(${charges.vendor}) = lower(${sub.vendor})`,
          sql`abs((${charges.chargedAt} at time zone 'Asia/Kolkata')::date - ${anchor}::date) <= 3`,
        ),
      )
      .returning({ id: charges.id });
    if (i === 0 && rows.length) firstPaid = true;
  }
  return { firstPaid };
}

async function findActiveSubscriptionByMandateRef(db: Db, vendor: string, ref: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        sql`lower(${subscriptions.vendor}) = lower(${vendor})`,
        sql`${subscriptions.mandateInfo}->>'mandate_ref' = ${ref}`,
      ),
    )
    .limit(1);
  return row ?? null;
}
