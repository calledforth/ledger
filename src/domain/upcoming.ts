import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { subscriptions, upcomingEvents } from "@/db/schema";
import { blankToNull, normalizeAmount, normalizeCurrency } from "@/lib/sanitize";
import { addDays, assertDate, diffDays, isoWeekLabel, isoWeekStart, todayIst } from "@/lib/time";
import { DomainError, notFound } from "./errors";
import { upcomingEventJson } from "./serialize";
import { advanceByCycle, SUBSCRIPTION_MATCH_DAYS } from "./subscriptions";
import { addMoney } from "./money";

export type UpcomingItem = {
  date: string;
  vendor: string;
  plan: string | null;
  amount: string;
  currency: string;
  kind: "subscription" | "mandate_upcoming" | "manual";
  subscription_id: string | null;
  event_id: string | null;
  billing_url: string | null;
  cycle: string | null;
  mandate: boolean;
};

export type UpcomingWeek = {
  week: string; // ISO week label, e.g. 2026-W42
  week_start: string; // Monday
  items: UpcomingItem[];
  totals: Record<string, string>; // currency -> amount
};

/**
 * Expected payments between `from` and `to` (inclusive, IST dates). Default: today through today + `days` (30).
 * Sources: active subscriptions projected forward from next_charge_date by their cycle (stopping at ended_at), plus
 * pending upcoming_events. A pending event within ±3 days of a projected charge of the same subscription replaces
 * that projection, so nothing is counted twice.
 */
export async function upcomingPayments(db: Db, input: { days?: number; from?: string; to?: string } = {}) {
  const from = input.from ?? todayIst();
  const to = input.to ?? addDays(from, Math.min(Math.max(input.days ?? 30, 1), 366));
  try {
    assertDate(from);
    assertDate(to);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }

  const subs = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), sql`${subscriptions.nextChargeDate} is not null`, lte(subscriptions.nextChargeDate, to)));
  const events = await db
    .select()
    .from(upcomingEvents)
    .where(and(eq(upcomingEvents.status, "pending"), gte(upcomingEvents.expectedDate, from), lte(upcomingEvents.expectedDate, to)))
    .orderBy(asc(upcomingEvents.expectedDate));

  const items: UpcomingItem[] = [];
  for (const e of events) {
    const sub = subs.find((s) => s.id === e.subscriptionId);
    items.push({
      date: e.expectedDate,
      vendor: e.vendor,
      plan: sub?.plan ?? null,
      amount: e.amount,
      currency: e.currency,
      kind: e.kind,
      subscription_id: e.subscriptionId,
      event_id: e.id,
      billing_url: sub?.billingUrl ?? null,
      cycle: sub?.cycle ?? null,
      mandate: e.kind === "mandate_upcoming" || !!sub?.mandateInfo,
    });
  }
  for (const s of subs) {
    let date: string | null = s.nextChargeDate!;
    let guard = 0;
    while (date && date <= to && guard++ < 400) {
      if (s.endedAt && date > s.endedAt) break;
      const d = date;
      const covered = events.some((e) => e.subscriptionId === s.id && Math.abs(diffDays(e.expectedDate, d)) <= SUBSCRIPTION_MATCH_DAYS);
      if (d >= from && !covered) {
        items.push({
          date: d,
          vendor: s.vendor,
          plan: s.plan,
          amount: s.amount,
          currency: s.currency,
          kind: "subscription",
          subscription_id: s.id,
          event_id: null,
          billing_url: s.billingUrl,
          cycle: s.cycle,
          mandate: !!s.mandateInfo,
        });
      }
      date = advanceByCycle(d, s.cycle);
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.vendor.localeCompare(b.vendor));

  const weeks = new Map<string, UpcomingWeek>();
  for (const it of items) {
    const start = isoWeekStart(it.date);
    const w = weeks.get(start) ?? { week: isoWeekLabel(it.date), week_start: start, items: [], totals: {} };
    w.items.push(it);
    w.totals[it.currency] = addMoney(w.totals[it.currency] ?? "0", it.amount);
    weeks.set(start, w);
  }
  const totals: Record<string, string> = {};
  for (const it of items) totals[it.currency] = addMoney(totals[it.currency] ?? "0", it.amount);
  return { from, to, weeks: [...weeks.values()], totals, count: items.length };
}

export type AddUpcomingInput = {
  vendor: string;
  amount: string | number;
  currency: string;
  expected_date: string;
  kind?: "mandate_upcoming" | "manual";
  subscription_id?: string | null;
  source_message_id?: string | null;
  notes?: string | null;
};

/** Idempotent on source_message_id. */
export async function addUpcomingEvent(db: Db, input: AddUpcomingInput) {
  let amount: string, currency: string;
  try {
    amount = normalizeAmount(input.amount);
    currency = normalizeCurrency(input.currency);
    assertDate(input.expected_date);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  if (input.subscription_id) {
    const [s] = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, input.subscription_id));
    if (!s) throw notFound("Subscription", input.subscription_id);
  }
  const values = {
    vendor: input.vendor.trim(),
    amount,
    currency,
    expectedDate: input.expected_date,
    kind: input.kind ?? "manual",
    subscriptionId: input.subscription_id ?? null,
    sourceMessageId: blankToNull(input.source_message_id),
    notes: blankToNull(input.notes),
  } as const;
  const [row] = await db.insert(upcomingEvents).values(values).onConflictDoNothing().returning();
  if (row) return { status: "created", event: upcomingEventJson(row) };
  const [existing] = await db.select().from(upcomingEvents).where(eq(upcomingEvents.sourceMessageId, values.sourceMessageId!));
  return { status: "existing", event: upcomingEventJson(existing) };
}

export async function setUpcomingEventStatus(db: Db, input: { id: string; status: "pending" | "paid" | "declined" | "cancelled" }) {
  const [row] = await db.update(upcomingEvents).set({ status: input.status }).where(eq(upcomingEvents.id, input.id)).returning();
  if (!row) throw notFound("Upcoming event", input.id);
  return { status: "updated", event: upcomingEventJson(row) };
}
