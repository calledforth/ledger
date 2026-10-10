import { and, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { charges, monthNotes } from "@/db/schema";
import { DomainError } from "./errors";
import { addMoney, fromMinor, toMinor } from "./money";
import { assertMonth, currentMonthIst, istParts, monthRangeIst } from "@/lib/time";

type CurrencySummary = {
  currency: string;
  /** Debits that are not refunded. */
  spent: string;
  /** Part of `spent` linked to a subscription. */
  subscriptions: string;
  /** Part of `spent` not linked to a subscription. */
  one_time: string;
  /** Credits that are not refunds of a charge. */
  credits: string;
  /** Refunded debits (excluded from spent). */
  refunded: string;
  debit_count: number;
  credit_count: number;
  top_vendors: { vendor: string; amount: string; count: number }[];
  by_category: { category: string; amount: string }[];
  credits_by_source: { vendor: string; channel: string | null; amount: string; count: number }[];
  /** Cumulative spend by IST day of month, for the progress chart. */
  daily: { day: number; amount: string; cumulative: string }[];
};

/**
 * Month summary with the business rules applied:
 * - every figure is per currency, never combined;
 * - refunded debits are excluded from spending, and refund credits (refund_of_charge_id set) from credits;
 * - credits are never part of spending.
 */
export async function getMonthSummary(db: Db, input: { month?: string } = {}) {
  const month = input.month ?? currentMonthIst();
  try {
    assertMonth(month);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  const { start, end } = monthRangeIst(month);
  const rows = await db.select().from(charges).where(and(gte(charges.chargedAt, start), lt(charges.chargedAt, end)));
  const [note] = await db.select().from(monthNotes).where(eq(monthNotes.month, month));

  const per = new Map<string, CurrencySummary & { _v: Map<string, { a: bigint; n: number }>; _c: Map<string, bigint>; _s: Map<string, { vendor: string; channel: string | null; a: bigint; n: number }>; _d: Map<number, bigint> }>();
  const get = (c: string) => {
    let s = per.get(c);
    if (!s) {
      s = {
        currency: c, spent: "0.00", subscriptions: "0.00", one_time: "0.00", credits: "0.00", refunded: "0.00",
        debit_count: 0, credit_count: 0, top_vendors: [], by_category: [], credits_by_source: [], daily: [],
        _v: new Map(), _c: new Map(), _s: new Map(), _d: new Map(),
      };
      per.set(c, s);
    }
    return s;
  };

  let needsReview = 0;
  let refundedCount = 0;
  for (const r of rows) {
    if (r.needsReview) needsReview++;
    const s = get(r.currency);
    if (r.direction === "debit") {
      s.debit_count++;
      if (r.isRefunded) {
        refundedCount++;
        s.refunded = addMoney(s.refunded, r.amount);
        continue;
      }
      s.spent = addMoney(s.spent, r.amount);
      if (r.subscriptionId) s.subscriptions = addMoney(s.subscriptions, r.amount);
      else s.one_time = addMoney(s.one_time, r.amount);
      const vk = r.vendor ?? "Unknown";
      const v = s._v.get(vk) ?? { a: 0n, n: 0 };
      v.a += toMinor(r.amount);
      v.n++;
      s._v.set(vk, v);
      const ck = r.category ?? (r.subscriptionId ? "subscription" : "uncategorized");
      s._c.set(ck, (s._c.get(ck) ?? 0n) + toMinor(r.amount));
      const day = istParts(r.chargedAt).day;
      s._d.set(day, (s._d.get(day) ?? 0n) + toMinor(r.amount));
    } else {
      s.credit_count++;
      if (r.refundOfChargeId) continue;
      s.credits = addMoney(s.credits, r.amount);
      const key = `${r.vendor ?? "Unknown"}|${r.channel ?? ""}`;
      const src = s._s.get(key) ?? { vendor: r.vendor ?? "Unknown", channel: r.channel, a: 0n, n: 0 };
      src.a += toMinor(r.amount);
      src.n++;
      s._s.set(key, src);
    }
  }

  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const currencies = [...per.values()]
    .map(({ _v, _c, _s, _d, ...s }) => {
      let cum = 0n;
      const daily = Array.from({ length: days }, (_, i) => {
        const a = _d.get(i + 1) ?? 0n;
        cum += a;
        return { day: i + 1, amount: fromMinor(a), cumulative: fromMinor(cum) };
      });
      return {
        ...s,
        top_vendors: [..._v.entries()].sort((a, b) => Number(b[1].a - a[1].a)).slice(0, 5).map(([vendor, v]) => ({ vendor, amount: fromMinor(v.a), count: v.n })),
        by_category: [..._c.entries()].sort((a, b) => Number(b[1] - a[1])).map(([category, a]) => ({ category, amount: fromMinor(a) })),
        credits_by_source: [..._s.values()].sort((a, b) => Number(b.a - a.a)).map((x) => ({ vendor: x.vendor, channel: x.channel, amount: fromMinor(x.a), count: x.n })),
        daily,
      };
    })
    .sort((a, b) => (a.currency === "INR" ? -1 : b.currency === "INR" ? 1 : a.currency.localeCompare(b.currency)));

  return {
    month,
    spending: Object.fromEntries(currencies.map((c) => [c.currency, c.spent])),
    credits: Object.fromEntries(currencies.filter((c) => c.credits !== "0.00").map((c) => [c.currency, c.credits])),
    counts: {
      charges: rows.length,
      debits: rows.filter((r) => r.direction === "debit").length,
      credits: rows.filter((r) => r.direction === "credit").length,
      needs_review: needsReview,
      refunded: refundedCount,
    },
    currencies,
    note: note?.note ?? null,
  };
}

export async function setMonthNote(db: Db, input: { month: string; note: string }) {
  try {
    assertMonth(input.month);
  } catch (e) {
    throw new DomainError("invalid_input", (e as Error).message);
  }
  const text = input.note.trim();
  if (!text) {
    await db.delete(monthNotes).where(eq(monthNotes.month, input.month));
    return { status: "cleared", month: input.month };
  }
  if (text.length > 500) throw new DomainError("invalid_input", "note must be 500 characters or fewer");
  await db
    .insert(monthNotes)
    .values({ month: input.month, note: text })
    .onConflictDoUpdate({ target: monthNotes.month, set: { note: text } });
  return { status: "saved", month: input.month, note: text };
}
