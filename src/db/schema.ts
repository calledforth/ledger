import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const chargeSource = pgEnum("charge_source", ["hdfc_alert", "vendor_receipt", "manual"]);
export const chargeChannel = pgEnum("charge_channel", ["UPI", "card", "NEFT", "IMPS", "auto-debit", "other"]);
export const chargeDirection = pgEnum("charge_direction", ["debit", "credit"]);
export const subscriptionCycle = pgEnum("subscription_cycle", ["monthly", "yearly", "one-off"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "cancelled", "paused"]);
export const upcomingKind = pgEnum("upcoming_kind", ["mandate_upcoming", "manual"]);
export const upcomingStatus = pgEnum("upcoming_status", ["pending", "paid", "declined", "cancelled"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export type MandateEvent = {
  type: "registered" | "upcoming" | "declined" | "cancelled";
  date: string;
  amount?: string;
  message_id?: string | null;
  note?: string | null;
};

export type MandateInfo = {
  max_amount?: number | string;
  currency?: string;
  mandate_ref?: string | null;
  bank?: string;
  events?: MandateEvent[];
  [key: string]: unknown;
};

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendor: text("vendor").notNull(),
    plan: text("plan").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    cycle: subscriptionCycle("cycle").notNull(),
    nextChargeDate: date("next_charge_date"),
    billingUrl: text("billing_url"),
    status: subscriptionStatus("status").notNull().default("active"),
    startedAt: date("started_at").notNull(),
    // When access ended / will end. On an active row it is a planned end date.
    endedAt: date("ended_at"),
    // The day the owner cancelled it (may differ from ended_at, e.g. cancel now, access until month end).
    cancelledOn: date("cancelled_on"),
    mandateInfo: jsonb("mandate_info").$type<MandateInfo>(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("subscriptions_one_active_per_vendor_plan")
      .on(sql`lower(${t.vendor})`, sql`lower(${t.plan})`)
      .where(sql`${t.status} = 'active'`),
    index("subscriptions_vendor_idx").on(t.vendor),
    index("subscriptions_next_charge_idx").on(t.nextChargeDate),
    check("subscriptions_amount_nonnegative", sql`${t.amount} >= 0`),
    check("subscriptions_currency_iso", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendor: text("vendor"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    chargedAt: timestamp("charged_at", { withTimezone: true }).notNull(),
    source: chargeSource("source").notNull(),
    hdfcMessageId: text("hdfc_message_id"),
    receiptMessageId: text("receipt_message_id"),
    invoiceNumber: text("invoice_number"),
    pdfUrl: text("pdf_url"),
    channel: chargeChannel("channel"),
    payeeRaw: text("payee_raw"),
    cardLast4: char("card_last4", { length: 4 }),
    reference: text("reference"),
    category: text("category"),
    direction: chargeDirection("direction").notNull().default("debit"),
    isRefunded: boolean("is_refunded").notNull().default(false),
    refundOfChargeId: uuid("refund_of_charge_id").references((): AnyPgColumn => charges.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    needsReview: boolean("needs_review").notNull().default(false),
    // Why the row needs review: unknown_vendor | possible_duplicate | flagged (free text allowed).
    reviewReason: text("review_reason"),
    notes: text("notes"),
    // Audit trail of rows folded into this one by merge_charges / auto-merge.
    mergedFrom: jsonb("merged_from").$type<{ id: string; hdfc_message_id: string | null; receipt_message_id: string | null; merged_at: string }[]>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("charges_hdfc_message_id_key").on(t.hdfcMessageId).where(sql`${t.hdfcMessageId} IS NOT NULL`),
    uniqueIndex("charges_receipt_message_id_key").on(t.receiptMessageId).where(sql`${t.receiptMessageId} IS NOT NULL`),
    index("charges_charged_at_idx").on(t.chargedAt),
    index("charges_vendor_idx").on(t.vendor),
    index("charges_needs_review_idx").on(t.needsReview).where(sql`${t.needsReview}`),
    index("charges_dedup_idx").on(t.amount, t.currency, t.chargedAt),
    index("charges_refund_of_idx").on(t.refundOfChargeId),
    index("charges_subscription_idx").on(t.subscriptionId),
    check("charges_amount_positive", sql`${t.amount} > 0`),
    check("charges_currency_iso", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("charges_card_last4_digits", sql`${t.cardLast4} IS NULL OR ${t.cardLast4} ~ '^[0-9]{4}$'`),
    check("charges_refund_not_self", sql`${t.refundOfChargeId} IS NULL OR ${t.refundOfChargeId} <> ${t.id}`),
  ],
);

export const vendorAliases = pgTable(
  "vendor_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Case-insensitive substring of payee_raw. The longest matching pattern wins.
    rawPattern: text("raw_pattern").notNull(),
    canonicalVendor: text("canonical_vendor").notNull(),
    category: text("category"),
    ...timestamps,
  },
  (t) => [uniqueIndex("vendor_aliases_pattern_key").on(sql`lower(${t.rawPattern})`)],
);

export const upcomingEvents = pgTable(
  "upcoming_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    vendor: text("vendor").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    expectedDate: date("expected_date").notNull(),
    kind: upcomingKind("kind").notNull(),
    sourceMessageId: text("source_message_id"),
    status: upcomingStatus("status").notNull().default("pending"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("upcoming_events_source_message_id_key")
      .on(t.sourceMessageId)
      .where(sql`${t.sourceMessageId} IS NOT NULL`),
    index("upcoming_events_expected_date_idx").on(t.expectedDate),
    check("upcoming_events_amount_nonnegative", sql`${t.amount} >= 0`),
    check("upcoming_events_currency_iso", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

// One short, assistant-written note per month shown above the dashboard charts.
export const monthNotes = pgTable("month_notes", {
  month: text("month").primaryKey(), // YYYY-MM
  note: text("note").notNull(),
  ...timestamps,
}, (t) => [check("month_notes_month_format", sql`${t.month} ~ '^[0-9]{4}-[0-9]{2}$'`)]);

export type Charge = typeof charges.$inferSelect;
export type NewCharge = typeof charges.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type VendorAlias = typeof vendorAliases.$inferSelect;
export type UpcomingEvent = typeof upcomingEvents.$inferSelect;
