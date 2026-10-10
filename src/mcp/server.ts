import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, type Db } from "@/db/client";
import { listVendorAliases, upsertVendorAlias } from "@/domain/aliases";
import { addCharge, CHANNELS, findPossibleDuplicates, listCharges, markRefunded, mergeCharges, updateCharge } from "@/domain/charges";
import { DomainError } from "@/domain/errors";
import { decodeCsvInput, importCsv } from "@/domain/importCsv";
import { attachInvoice } from "@/domain/invoices";
import { cancelSubscription, listSubscriptions, upsertSubscription } from "@/domain/subscriptions";
import { getMonthSummary, setMonthNote } from "@/domain/summary";
import { addUpcomingEvent, setUpcomingEventStatus, upcomingPayments } from "@/domain/upcoming";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM").describe("Calendar month in IST, YYYY-MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const money = z.union([z.number().positive(), z.string().regex(/^\d[\d,]*(\.\d+)?$/)]).describe("Positive amount; direction carries the sign");
const currency = z.string().regex(/^[A-Za-z]{3}$/).describe("ISO 4217 code such as INR or USD. No conversion is ever done.");
const uuid = z.string().uuid();
const channel = z.enum(CHANNELS);

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function ok(data: unknown): Result {
  const structured = (data && typeof data === "object" && !Array.isArray(data) ? data : { result: data }) as Record<string, unknown>;
  return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
}

function fail(e: unknown): Result {
  const err =
    e instanceof DomainError
      ? { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) }
      : { code: "internal_error", message: "Unexpected server error. The call was rolled back; it is safe to retry." };
  if (!(e instanceof DomainError)) console.error("[mcp] tool error", e);
  return { content: [{ type: "text", text: JSON.stringify({ error: err }, null, 2) }], isError: true };
}

/** Run each tool call in one transaction so multi-step writes (merge, plan change) are atomic. */
function handler<A>(fn: (db: Db, args: A) => Promise<unknown>) {
  return async (args: A): Promise<Result> => {
    try {
      return ok(await getDb().transaction((tx) => fn(tx, args)));
    } catch (e) {
      return fail(e);
    }
  };
}

const chargeFields = {
  vendor: z.string().nullish().describe("Canonical vendor name. Leave empty to resolve from payee_raw via vendor aliases."),
  hdfc_message_id: z.string().nullish().describe("Gmail message id of the HDFC alert. Makes the call idempotent."),
  receipt_message_id: z.string().nullish().describe("Gmail message id of the vendor receipt. Makes the call idempotent."),
  invoice_number: z.string().nullish(),
  pdf_url: z.string().url().nullish(),
  channel: channel.nullish(),
  payee_raw: z.string().nullish().describe("Raw payee text from the bank alert. Long digit runs are masked automatically."),
  card_last4: z.string().nullish().describe("Only the last four digits are kept. Never send a full card number."),
  reference: z.string().nullish().describe("UPI / transaction reference"),
  category: z.string().nullish(),
  notes: z.string().nullish(),
  subscription_id: uuid.nullish(),
};

export function createMcpServer() {
  const server = new McpServer(
    { name: "ledger", version: "1.0.0" },
    {
      instructions:
        "Personal expense and subscription tracker for one person (Cletus). Amounts are always per currency; nothing is ever converted. " +
        "Times without an offset are IST (Asia/Kolkata). Writes carrying hdfc_message_id / receipt_message_id are idempotent, so retries are safe. " +
        "Nothing here ever contacts a vendor or a bank.",
    },
  );

  server.registerTool(
    "add_charge",
    {
      title: "Add a charge or credit",
      description:
        "Record one payment (debit) or incoming money (credit). Idempotent on hdfc_message_id and receipt_message_id: calling again with the same id " +
        "returns the existing row (status 'existing') and only fills empty columns unless overwrite is true. " +
        "Resolves vendor from payee_raw via vendor aliases. Merges an HDFC alert with the matching vendor receipt (same currency, amount within 1.00, " +
        "within ±2 days) into one row (status 'merged'). If several rows could match it does NOT merge: it inserts with needs_review=true and returns " +
        "'candidates' so you can call merge_charges. Unknown vendors get needs_review=true: ask the owner what it was, then call update_charge or " +
        "upsert_vendor_alias. Debits matching an active subscription are linked and its next_charge_date advanced. " +
        "Returns { status: created | existing | merged | created_needs_review, charge, candidates? }.",
      inputSchema: {
        amount: money,
        currency,
        charged_at: z.string().describe("ISO timestamp. Without an offset it is read as IST, e.g. 2026-10-05T14:30:00"),
        source: z.enum(["hdfc_alert", "vendor_receipt", "manual"]),
        direction: z.enum(["debit", "credit"]).default("debit").describe("credit = money received (e.g. Wise payouts). Credits never count as spending."),
        ...chargeFields,
        needs_review: z.boolean().optional().describe("Force review even when the vendor is known"),
        overwrite: z.boolean().optional().describe("On a retry, overwrite non-null columns too. Default false."),
      },
    },
    handler((db, a) => addCharge(db, a)),
  );

  server.registerTool(
    "update_charge",
    {
      title: "Edit a charge",
      description:
        "Patch editable fields of one charge by id: vendor, category, notes, needs_review, subscription_id, invoice_number, channel, reference, direction, " +
        "amount, currency, charged_at. Setting a vendor on a row waiting for an unknown-vendor review clears needs_review. Pass null to clear a field.",
      inputSchema: {
        id: uuid,
        vendor: z.string().nullish(),
        category: z.string().nullish(),
        notes: z.string().nullish(),
        needs_review: z.boolean().optional(),
        subscription_id: uuid.nullish(),
        invoice_number: z.string().nullish(),
        channel: channel.nullish(),
        reference: z.string().nullish(),
        direction: z.enum(["debit", "credit"]).optional(),
        amount: money.optional(),
        currency: currency.optional(),
        charged_at: z.string().optional(),
      },
    },
    handler((db, a) => updateCharge(db, a)),
  );

  server.registerTool(
    "merge_charges",
    {
      title: "Merge two charges",
      description:
        "Merge merge_id into keep_id when they are the same real payment (e.g. after add_charge returned candidates). Keeps both message ids, takes " +
        "bank-side fields from the HDFC alert and receipt-side fields from the receipt, re-points refund links and deletes merge_id. Idempotent: " +
        "repeating it returns status 'already_merged'. Refuses to merge two different HDFC alerts or two different receipts.",
      inputSchema: { keep_id: uuid, merge_id: uuid },
    },
    handler((db, a) => mergeCharges(db, a)),
  );

  server.registerTool(
    "list_charges",
    {
      title: "List charges",
      description: "List charges and credits for one IST month (default: current month), newest first. Filters are optional. Use next_cursor to page.",
      inputSchema: {
        month: month.optional(),
        vendor: z.string().optional(),
        needs_review: z.boolean().optional(),
        direction: z.enum(["debit", "credit"]).optional(),
        currency: currency.optional(),
        limit: z.number().int().min(1).max(500).optional(),
        cursor: z.string().optional(),
      },
    },
    handler((db, a) => listCharges(db, a)),
  );

  server.registerTool(
    "mark_refunded",
    {
      title: "Mark a charge refunded",
      description:
        "Mark a debit as refunded. It stays listed (struck through) but is excluded from spending. Optionally link an existing credit row " +
        "(refund_charge_id) or create the refund credit (create_refund_credit / refund). The linked refund credit is excluded from credit totals so it is " +
        "not counted twice. Idempotent: repeat calls return 'already_refunded' and never create a second refund row.",
      inputSchema: {
        charge_id: uuid,
        refund_charge_id: uuid.optional(),
        create_refund_credit: z.boolean().optional(),
        refund: z
          .object({
            amount: money.optional().describe("Defaults to the original amount"),
            charged_at: z.string().optional(),
            hdfc_message_id: z.string().optional(),
            reference: z.string().optional(),
            channel: channel.optional(),
            notes: z.string().optional(),
          })
          .optional(),
      },
    },
    handler((db, a) => markRefunded(db, a)),
  );

  server.registerTool(
    "upsert_subscription",
    {
      title: "Create or update a subscription",
      description:
        "Create or update a recurring subscription. If the vendor already has an active row with the same plan, amount, cycle and currency, that row is " +
        "updated in place. If plan/amount/cycle/currency differ it is a plan change: the old row is closed (status cancelled, ended_at = started_at of the " +
        "new one) and a new active row is opened; both are returned. Set keep_other_active to add a second concurrent plan from the same vendor instead. " +
        "ended_at on an active row is a planned end date. Never contacts the vendor.",
      inputSchema: {
        id: uuid.optional().describe("Update this exact row"),
        vendor: z.string().min(1),
        plan: z.string().min(1).describe('e.g. "Pro", "Max"'),
        amount: money,
        currency,
        cycle: z.enum(["monthly", "yearly", "one-off"]),
        next_charge_date: date.nullish(),
        billing_url: z.string().url().nullish(),
        started_at: date.nullish().describe("Defaults to today (IST)"),
        ended_at: date.nullish(),
        status: z.enum(["active", "paused"]).optional(),
        mandate_info: z
          .object({
            max_amount: z.union([z.number(), z.string()]).optional(),
            currency: z.string().optional(),
            mandate_ref: z.string().nullish(),
            bank: z.string().optional(),
          })
          .passthrough()
          .nullish(),
        notes: z.string().nullish(),
        keep_other_active: z.boolean().optional(),
      },
    },
    handler((db, a) => upsertSubscription(db, a)),
  );

  server.registerTool(
    "list_subscriptions",
    {
      title: "List subscriptions",
      description: "List subscriptions, optionally filtered by status and vendor. Includes closed rows, so plan history is visible.",
      inputSchema: { status: z.enum(["active", "cancelled", "paused"]).optional(), vendor: z.string().optional() },
    },
    handler((db, a) => listSubscriptions(db, a)),
  );

  server.registerTool(
    "upcoming_payments",
    {
      title: "Upcoming payments",
      description:
        "Expected payments for the next N days (default 30) from today in IST, or for an explicit from/to range: active subscriptions projected from " +
        "next_charge_date by cycle (stopping at ended_at) plus pending mandate/manual events. Grouped by ISO week with per-currency totals per week.",
      inputSchema: { days: z.number().int().min(1).max(366).optional(), from: date.optional(), to: date.optional() },
    },
    handler((db, a) => upcomingPayments(db, a)),
  );

  server.registerTool(
    "cancel_subscription",
    {
      title: "Cancel a subscription (locally)",
      description:
        "Mark a subscription cancelled in the tracker only: status=cancelled, cancelled_on (default today IST) and ended_at (default = cancelled_on, " +
        "use a later date if access continues). Pending expected payments after ended_at are cancelled. NEVER contacts or cancels at the vendor and makes " +
        "no outbound request; it returns billing_url so the owner can cancel there. Idempotent.",
      inputSchema: { id: uuid, cancelled_on: date.optional(), ended_at: date.optional() },
    },
    handler((db, a) => cancelSubscription(db, a)),
  );

  server.registerTool(
    "add_upcoming_event",
    {
      title: "Add an expected payment",
      description:
        "Record a one-off expected payment or a mandate pre-debit notice so it shows in upcoming_payments. Idempotent on source_message_id. " +
        "When it belongs to a subscription, pass subscription_id; the projected charge for that date is then replaced by this event.",
      inputSchema: {
        vendor: z.string().min(1),
        amount: money,
        currency,
        expected_date: date,
        kind: z.enum(["mandate_upcoming", "manual"]).optional(),
        subscription_id: uuid.nullish(),
        source_message_id: z.string().nullish(),
        notes: z.string().nullish(),
      },
    },
    handler((db, a) => addUpcomingEvent(db, a)),
  );

  server.registerTool(
    "set_upcoming_event_status",
    {
      title: "Update an expected payment",
      description: "Set an upcoming event to pending, paid, declined or cancelled.",
      inputSchema: { id: uuid, status: z.enum(["pending", "paid", "declined", "cancelled"]) },
    },
    handler((db, a) => setUpcomingEventStatus(db, a)),
  );

  server.registerTool(
    "attach_invoice",
    {
      title: "Attach an invoice PDF",
      description:
        "Attach a PDF to a charge, stored in Vercel Blob at an unguessable path. Give exactly one of pdf_base64 (+ optional filename) or upload_url " +
        "(https only, max 10 MB, must be a PDF). Idempotent per charge + invoice_number: if the charge already has that invoice, nothing is re-uploaded. " +
        "Replacing a different invoice needs overwrite: true.",
      inputSchema: {
        charge_id: uuid,
        invoice_number: z.string().nullish(),
        pdf_base64: z.string().optional(),
        filename: z.string().optional(),
        upload_url: z.string().url().optional(),
        overwrite: z.boolean().optional(),
      },
    },
    handler((db, a) => attachInvoice(db, a)),
  );

  server.registerTool(
    "get_month_summary",
    {
      title: "Month summary",
      description:
        "Summary for an IST month (default current): per-currency spending (refunded charges excluded), split into subscriptions vs one-time, " +
        "per-currency credits (refund credits excluded) with where they came from, counts, needs_review and refunded counts, top vendors and categories " +
        "per currency, and the month note. Currencies are never combined.",
      inputSchema: { month: month.optional() },
    },
    handler((db, a) => getMonthSummary(db, a)),
  );

  server.registerTool(
    "set_month_note",
    {
      title: "Set the month note",
      description:
        "Write the short note shown above the dashboard charts for a month (max 500 characters), e.g. a one-line takeaway about the month's spending. " +
        "An empty note clears it. Overwrites the previous note for that month.",
      inputSchema: { month, note: z.string().max(500) },
    },
    handler((db, a) => setMonthNote(db, a)),
  );

  server.registerTool(
    "find_possible_duplicates",
    {
      title: "Find possible duplicates",
      description:
        "Groups of debits that may be the same payment: same currency, amounts within 1.00, within 2 days, and not two distinct HDFC alerts or two " +
        "distinct receipts. Read-only: confirm with the owner, then call merge_charges.",
      inputSchema: { month: month.optional().describe("Limit to one month; omit to scan everything") },
    },
    handler((db, a) => findPossibleDuplicates(db, a)),
  );

  server.registerTool(
    "upsert_vendor_alias",
    {
      title: "Create or update a vendor alias",
      description:
        "Map raw payee text to a canonical vendor (and optional category). raw_pattern is a case-insensitive substring of payee_raw; the longest " +
        "matching pattern wins. With apply_to_existing: true, existing rows whose payee_raw matches get the vendor (where blank or awaiting an " +
        "unknown-vendor review) and category (where blank), and their needs_review is cleared.",
      inputSchema: {
        raw_pattern: z.string().min(2),
        canonical_vendor: z.string().min(1),
        category: z.string().nullish(),
        apply_to_existing: z.boolean().optional(),
      },
    },
    handler((db, a) => upsertVendorAlias(db, a)),
  );

  server.registerTool(
    "list_vendor_aliases",
    { title: "List vendor aliases", description: "All vendor aliases, sorted by vendor.", inputSchema: {} },
    handler(async (db) => ({ aliases: await listVendorAliases(db) })),
  );

  server.registerTool(
    "import_csv",
    {
      title: "Import the backfill CSV",
      description:
        "One-time backfill from CSV text or base64 with columns date,time,direction,amount,currency,channel,vendor_raw,card_last4,reference," +
        "gmail_message_id,flag_unknown_vendor,note. date+time are IST. gmail_message_id becomes hdfc_message_id, so re-running creates nothing new. " +
        "Mandate rows (direction mandate_*, or a mandate mentioned in the note) update subscriptions and upcoming events and never create charges. " +
        "Runs in one transaction; dry_run: true rolls back and only returns the report.",
      inputSchema: {
        csv_text: z.string().optional(),
        csv_base64: z.string().optional(),
        dry_run: z.boolean().optional(),
      },
    },
    async (a) => {
      // import_csv manages its own transaction (and dry-run rollback).
      try {
        return ok(await importCsv(getDb(), decodeCsvInput(a), { dry_run: a.dry_run }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}
