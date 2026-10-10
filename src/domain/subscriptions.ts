import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { charges, subscriptions, upcomingEvents, type Charge, type MandateInfo, type Subscription } from "@/db/schema";
import { blankToNull, normalizeAmount, normalizeCurrency } from "@/lib/sanitize";
import { addDays, addMonths, assertDate, diffDays, istDate, todayIst } from "@/lib/time";
import { DomainError, notFound } from "./errors";
import { subscriptionJson } from "./serialize";

/** A debit links to a subscription when it lands within this many days of next_charge_date. */
export const SUBSCRIPTION_MATCH_DAYS = 3;
const AMOUNT_TOLERANCE = 1;

export type Cycle = "monthly" | "yearly" | "one-off";

export function advanceByCycle(date: string, cycle: Cycle): string | null {
  if (cycle === "monthly") return addMonths(date, 1);
  if (cycle === "yearly") return addMonths(date, 12);
  return null;
}

function validDate(d: string | null | undefined, field: string): string | null {
  const v = blankToNull(d ?? null);
  if (v == null) return null;
  try {
    assertDate(v);
  } catch {
    throw new DomainError("invalid_input", `${field} must be YYYY-MM-DD, got "${v}"`);
  }
  return v;
}

export type UpsertSubscriptionInput = {
  id?: string;
  vendor: string;
  plan: string;
  amount: string | number;
  currency: string;
  cycle: Cycle;
  next_charge_date?: string | null;
  billing_url?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  status?: "active" | "paused";
  mandate_info?: MandateInfo | null;
  notes?: string | null;
  /** Keep the vendor's other active plans open instead of treating this as a plan change. */
  keep_other_active?: boolean;
};

function mergeMandate(a: MandateInfo | null | undefined, b: MandateInfo | null | undefined): MandateInfo | null {
  if (!a && !b) return null;
  const events = [...(a?.events ?? [])];
  for (const e of b?.events ?? []) {
    if (!events.some((x) => x.message_id && x.message_id === e.message_id)) events.push(e);
  }
  return { ...(a ?? {}), ...(b ?? {}), events };
}

/**
 * Create or update a subscription.
 * - Same vendor + plan + amount + cycle + currency as an active row: update that row in place (dates, url, mandate).
 * - Same vendor, but plan/amount/cycle/currency differ: plan change. The old row is closed (cancelled, ended_at set)
 *   and a new active row opened, unless keep_other_active is true.
 */
export async function upsertSubscription(db: Db, input: UpsertSubscriptionInput) {
  const vendor = input.vendor.trim();
  const plan = input.plan.trim();
  if (!vendor || !plan) throw new DomainError("invalid_input", "vendor and plan are required");
  let amount: string, currency: string;
  try {
    amount = normalizeAmount(input.amount);
    currency = normalizeCurrency(input.currency);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  const nextChargeDate = validDate(input.next_charge_date, "next_charge_date");
  const startedAt = validDate(input.started_at, "started_at") ?? todayIst();
  const endedAt = validDate(input.ended_at, "ended_at");

  const fields = {
    billingUrl: input.billing_url === undefined ? undefined : blankToNull(input.billing_url),
    notes: input.notes === undefined ? undefined : blankToNull(input.notes),
  };

  if (input.id) {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, input.id));
    if (!row) throw notFound("Subscription", input.id);
    const planChanged = row.plan !== plan || row.amount !== amount || row.cycle !== input.cycle || row.currency !== currency;
    if (planChanged && row.status === "active") return planChange(db, row, { ...input, vendor, plan, amount, currency, nextChargeDate, startedAt, endedAt });
    const [u] = await db
      .update(subscriptions)
      .set({
        vendor,
        plan,
        amount,
        currency,
        cycle: input.cycle,
        nextChargeDate: input.next_charge_date === undefined ? row.nextChargeDate : nextChargeDate,
        endedAt: input.ended_at === undefined ? row.endedAt : endedAt,
        status: input.status ?? row.status,
        mandateInfo: input.mandate_info === undefined ? row.mandateInfo : mergeMandate(row.mandateInfo, input.mandate_info),
        ...(fields.billingUrl !== undefined ? { billingUrl: fields.billingUrl } : {}),
        ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
      })
      .where(eq(subscriptions.id, row.id))
      .returning();
    return { status: "updated" as const, subscription: subscriptionJson(u) };
  }

  const active = await db
    .select()
    .from(subscriptions)
    .where(and(sql`lower(${subscriptions.vendor}) = lower(${vendor})`, eq(subscriptions.status, "active")))
    .orderBy(asc(subscriptions.startedAt));

  const same = active.find((s) => s.plan.toLowerCase() === plan.toLowerCase() && s.amount === amount && s.cycle === input.cycle && s.currency === currency);
  if (same) {
    const [u] = await db
      .update(subscriptions)
      .set({
        nextChargeDate: input.next_charge_date === undefined ? same.nextChargeDate : nextChargeDate,
        endedAt: input.ended_at === undefined ? same.endedAt : endedAt,
        mandateInfo: input.mandate_info === undefined ? same.mandateInfo : mergeMandate(same.mandateInfo, input.mandate_info),
        ...(fields.billingUrl !== undefined ? { billingUrl: fields.billingUrl } : {}),
        ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .where(eq(subscriptions.id, same.id))
      .returning();
    return { status: "updated" as const, subscription: subscriptionJson(u) };
  }

  const samePlanDiffTerms = active.find((s) => s.plan.toLowerCase() === plan.toLowerCase());
  const toClose = samePlanDiffTerms ?? (input.keep_other_active ? undefined : active[active.length - 1]);
  if (toClose) return planChange(db, toClose, { ...input, vendor, plan, amount, currency, nextChargeDate, startedAt, endedAt });

  const [created] = await db
    .insert(subscriptions)
    .values({
      vendor,
      plan,
      amount,
      currency,
      cycle: input.cycle,
      nextChargeDate,
      billingUrl: fields.billingUrl ?? null,
      notes: fields.notes ?? null,
      status: input.status ?? "active",
      startedAt,
      endedAt,
      mandateInfo: input.mandate_info ?? null,
    })
    .returning();
  return { status: "created" as const, subscription: subscriptionJson(created) };
}

async function planChange(
  db: Db,
  old: Subscription,
  next: UpsertSubscriptionInput & { amount: string; currency: string; nextChargeDate: string | null; startedAt: string; endedAt: string | null },
) {
  const closeDate = next.startedAt;
  const [closed] = await db
    .update(subscriptions)
    .set({ status: "cancelled", endedAt: closeDate, cancelledOn: closeDate, nextChargeDate: null })
    .where(eq(subscriptions.id, old.id))
    .returning();
  // Pending expected payments for the old plan are superseded.
  await db
    .update(upcomingEvents)
    .set({ status: "cancelled" })
    .where(and(eq(upcomingEvents.subscriptionId, old.id), eq(upcomingEvents.status, "pending")));
  const [opened] = await db
    .insert(subscriptions)
    .values({
      vendor: next.vendor,
      plan: next.plan,
      amount: next.amount,
      currency: next.currency,
      cycle: next.cycle,
      nextChargeDate: next.nextChargeDate ?? old.nextChargeDate,
      billingUrl: next.billing_url === undefined ? old.billingUrl : blankToNull(next.billing_url),
      notes: next.notes === undefined ? null : blankToNull(next.notes),
      status: next.status ?? "active",
      startedAt: next.startedAt,
      endedAt: next.endedAt,
      mandateInfo: next.mandate_info === undefined ? old.mandateInfo : mergeMandate(old.mandateInfo, next.mandate_info),
    })
    .returning();
  return { status: "plan_changed" as const, closed: subscriptionJson(closed), subscription: subscriptionJson(opened) };
}

export async function listSubscriptions(db: Db, input: { status?: "active" | "cancelled" | "paused"; vendor?: string } = {}) {
  const conds: SQL[] = [];
  if (input.status) conds.push(eq(subscriptions.status, input.status));
  if (input.vendor) conds.push(sql`lower(${subscriptions.vendor}) = lower(${input.vendor})`);
  const rows = await db
    .select()
    .from(subscriptions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(subscriptions.vendor), asc(subscriptions.startedAt));
  return { subscriptions: rows.map(subscriptionJson) };
}

export async function getSubscription(db: Db, id: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
  if (!row) throw notFound("Subscription", id);
  return row;
}

/**
 * Cancel locally. Sets status, cancelled_on and ended_at, and cancels pending expected payments after ended_at.
 * Never contacts the vendor and never makes a network request.
 */
export async function cancelSubscription(db: Db, input: { id: string; cancelled_on?: string | null; ended_at?: string | null }) {
  const row = await getSubscription(db, input.id);
  const cancelledOn = validDate(input.cancelled_on, "cancelled_on") ?? todayIst();
  const endedAt = validDate(input.ended_at, "ended_at") ?? cancelledOn;
  if (endedAt < cancelledOn) throw new DomainError("invalid_input", "ended_at cannot be before cancelled_on");
  const message = `Marked cancelled in the tracker only. ${row.vendor} was NOT contacted; cancel with the vendor${row.billingUrl ? ` at ${row.billingUrl}` : ""} if you haven't already.`;
  if (row.status === "cancelled" && row.cancelledOn === cancelledOn && row.endedAt === endedAt) {
    return { status: "already_cancelled", subscription: subscriptionJson(row), billing_url: row.billingUrl, message };
  }
  const [u] = await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledOn, endedAt, nextChargeDate: row.nextChargeDate && row.nextChargeDate <= endedAt ? row.nextChargeDate : null })
    .where(eq(subscriptions.id, row.id))
    .returning();
  await db
    .update(upcomingEvents)
    .set({ status: "cancelled" })
    .where(and(eq(upcomingEvents.subscriptionId, row.id), eq(upcomingEvents.status, "pending"), sql`${upcomingEvents.expectedDate} > ${endedAt}`));
  return { status: "cancelled", subscription: subscriptionJson(u), billing_url: u.billingUrl, message };
}

/**
 * Link a debit to the active subscription it pays for: same vendor (case-insensitive), same currency, amount equal
 * (within 1 unit) or within the mandate max, and the charge date within ±3 days of next_charge_date.
 * Advances next_charge_date by the cycle; one-off subscriptions are closed after their charge.
 */
export async function linkChargeToSubscription(db: Db, charge: Charge): Promise<{ charge: Charge; subscriptionId: string } | null> {
  if (!charge.vendor) return null;
  const chargeDate = istDate(charge.chargedAt);
  const candidates = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        sql`lower(${subscriptions.vendor}) = lower(${charge.vendor})`,
        eq(subscriptions.currency, charge.currency),
        sql`${subscriptions.nextChargeDate} is not null`,
        sql`abs(${subscriptions.nextChargeDate} - ${chargeDate}::date) <= ${SUBSCRIPTION_MATCH_DAYS}`,
        sql`(abs(${subscriptions.amount} - ${charge.amount}::numeric) <= ${AMOUNT_TOLERANCE}
             or ${charge.amount}::numeric <= coalesce((${subscriptions.mandateInfo}->>'max_amount')::numeric, -1))`,
      ),
    );
  if (candidates.length === 0) return null;
  const sub = candidates.sort((a, b) => Math.abs(diffDays(a.nextChargeDate!, chargeDate)) - Math.abs(diffDays(b.nextChargeDate!, chargeDate)))[0];

  const next = advanceByCycle(sub.nextChargeDate!, sub.cycle);
  const ended = sub.cycle === "one-off" || (next && sub.endedAt && next > sub.endedAt);
  await db
    .update(subscriptions)
    .set(
      sub.cycle === "one-off"
        ? { nextChargeDate: null, status: "cancelled", endedAt: sub.endedAt ?? chargeDate }
        : { nextChargeDate: ended ? null : next },
    )
    .where(eq(subscriptions.id, sub.id));
  await db
    .update(upcomingEvents)
    .set({ status: "paid" })
    .where(
      and(
        eq(upcomingEvents.subscriptionId, sub.id),
        eq(upcomingEvents.status, "pending"),
        sql`abs(${upcomingEvents.expectedDate} - ${chargeDate}::date) <= ${SUBSCRIPTION_MATCH_DAYS}`,
      ),
    );
  const [updated] = await db.update(charges).set({ subscriptionId: sub.id }).where(eq(charges.id, charge.id)).returning();
  return { charge: updated, subscriptionId: sub.id };
}

/** Find the active subscription for a vendor, preferring one whose mandate_ref matches. */
export async function findActiveSubscriptionForVendor(db: Db, vendor: string, mandateRef?: string | null) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), sql`lower(${subscriptions.vendor}) = lower(${vendor})`))
    .orderBy(asc(subscriptions.startedAt));
  if (mandateRef) {
    const byRef = rows.find((r) => r.mandateInfo?.mandate_ref === mandateRef);
    if (byRef) return byRef;
  }
  return rows[rows.length - 1] ?? null;
}


/** Set or clear a planned end date on a subscription without cancelling it. */
export async function setSubscriptionEnd(db: Db, input: { id: string; ended_at: string | null }) {
  const row = await getSubscription(db, input.id);
  const endedAt = validDate(input.ended_at, "ended_at");
  const [u] = await db
    .update(subscriptions)
    .set({ endedAt }) // upcoming projections stop at ended_at
    .where(eq(subscriptions.id, row.id))
    .returning();
  return { status: "updated", subscription: subscriptionJson(u) };
}
