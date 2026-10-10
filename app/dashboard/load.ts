import "server-only";
import { getDb } from "@/db/client";
import { listCharges } from "@/domain/charges";
import { addMoney } from "@/domain/money";
import { listSubscriptions } from "@/domain/subscriptions";
import { getMonthSummary, monthlySpending } from "@/domain/summary";
import { upcomingPayments, type UpcomingItem } from "@/domain/upcoming";
import { dayLabel, formatMoney, shortDate, timeIst } from "@/lib/format";
import { vendorIcon } from "@/lib/icons";
import { addDays, daysInMonth, istDate, shiftMonth, todayIst } from "@/lib/time";
import type { ChargeRow, ExpectedData, MonthData, SubCard, UpWeek } from "./types";

export const isMonth = (m: string | null | undefined): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

const totalsLabel = (t: Record<string, string>) =>
  Object.entries(t)
    .map(([c, a]) => formatMoney(a, c))
    .join(" · ") || "nothing due";

function upItemDetail(it: UpcomingItem) {
  if (it.kind === "mandate_upcoming") return "Bank pre-debit notice";
  if (it.kind === "manual") return "Expected payment";
  return it.mandate ? `${it.cycle} · auto-debit` : (it.cycle ?? "");
}

/**
 * The 12 months the spending card's bar strip shows: through next month, so the strip stays put while you move around
 * recent months, and slides only when you go further back or forward than it reaches.
 */
export function historyWindow(month: string, current: string): { from: string; to: string } {
  let to = shiftMonth(current, 1);
  if (month > to) to = month;
  if (month < shiftMonth(to, -11)) to = shiftMonth(month, 6);
  return { from: shiftMonth(to, -11), to };
}

/** Loads and shapes one month for the dashboard. Used by the page (first paint) and /api/month (client switches). */
export async function loadMonth(month: string): Promise<MonthData> {
  const today = todayIst();
  const current = today.slice(0, 7);
  const isFuture = month > current;
  const isPast = month < current;
  const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const db = getDb();
  const hist = historyWindow(month, current);

  const [summary, chargePage, upcoming, monthDues, subs, history] = await Promise.all([
    getMonthSummary(db, { month }),
    listCharges(db, { month, limit: 500 }),
    isPast ? null : upcomingPayments(db, isFuture ? { from: `${month}-01`, to: lastDay } : { from: today, days: 30 }),
    // Dues for the rest of the visible month, shown on calendar days after today.
    isPast ? null : upcomingPayments(db, { from: isFuture ? `${month}-01` : addDays(today, 1), to: lastDay }),
    listSubscriptions(db, { status: "active" }),
    monthlySpending(db, hist),
  ]);

  const subName = new Map(subs.subscriptions.map((s) => [s.id, `${s.plan} · subscription`]));
  const rows: ChargeRow[] = chargePage.charges.map((c) => {
    const date = istDate(new Date(c.charged_at));
    return {
      id: c.id,
      vendor: c.vendor,
      payee_raw: c.payee_raw,
      amount: c.amount,
      amount_label: formatMoney(c.amount, c.currency, { sign: c.direction === "credit", decimals: "always" }),
      currency: c.currency,
      date,
      day_label: dayLabel(date),
      time_label: timeIst(c.charged_at),
      direction: c.direction,
      channel: c.channel,
      category: c.category,
      notes: c.notes,
      is_refunded: c.is_refunded,
      is_refund_credit: !!c.refund_of_charge_id,
      needs_review: c.needs_review,
      review_reason: c.review_reason,
      subscription: c.subscription_id ? (subName.get(c.subscription_id) ?? "subscription") : null,
      pdf_url: c.pdf_url,
      invoice_number: c.invoice_number,
      card_last4: c.card_last4,
      icon: vendorIcon(c.vendor),
    };
  });

  const weeks: UpWeek[] | null = upcoming
    ? upcoming.weeks.map((w) => {
        const start = shortDate(w.week_start);
        return {
          label: `Week of ${start.day} ${start.month}`,
          totals: totalsLabel(w.totals),
          items: w.items.map((it, i) => {
            const d = shortDate(it.date);
            return {
              key: `${it.date}-${it.event_id ?? it.subscription_id ?? i}`,
              date: it.date,
              day: d.day,
              mon: d.month,
              vendor: it.vendor,
              plan: it.plan,
              amount_label: formatMoney(it.amount, it.currency),
              detail: upItemDetail(it),
              mandate: it.mandate,
              subscription_id: it.subscription_id,
              icon: vendorIcon(it.vendor),
            };
          }),
        };
      })
    : null;

  const subCards: SubCard[] = subs.subscriptions
    .map((s) => {
      const mi = s.mandate_info;
      const next = s.next_charge_date ? shortDate(s.next_charge_date) : null;
      return {
        id: s.id,
        vendor: s.vendor,
        plan: s.plan,
        amount_label: formatMoney(s.amount, s.currency),
        cycle: s.cycle,
        next_charge_date: s.next_charge_date,
        next_label: next ? `${next.day} ${next.month}` : null,
        ended_at: s.ended_at,
        billing_url: s.billing_url,
        mandate: mi ? [mi.bank ?? "Bank", "mandate", mi.max_amount ? `up to ${formatMoney(String(mi.max_amount), s.currency)}` : null].filter(Boolean).join(" ") : null,
        icon: vendorIcon(s.vendor),
      };
    })
    .sort((a, b) => (a.next_charge_date ?? "9999").localeCompare(b.next_charge_date ?? "9999"));

  // Expected totals for a future month, split into subscriptions vs other dues.
  const expected = new Map<string, ExpectedData>();
  if (isFuture)
    for (const w of upcoming?.weeks ?? [])
      for (const it of w.items) {
        const e = expected.get(it.currency) ?? { currency: it.currency, total: "0", subs: "0", other: "0" };
        e.total = addMoney(e.total, it.amount);
        if (it.subscription_id) e.subs = addMoney(e.subs, it.amount);
        else e.other = addMoney(e.other, it.amount);
        expected.set(it.currency, e);
      }

  return {
    month,
    today,
    loaded_at: Date.now(),
    note: summary.note ?? null,
    review_count: summary.counts.needs_review,
    summary: summary.currencies.map((c) => ({
      currency: c.currency,
      spent: c.spent,
      subscriptions: c.subscriptions,
      one_time: c.one_time,
      credits: c.credits,
      refunded: c.refunded,
      transfers: c.transfers,
      transfers_by_category: c.transfers_by_category,
      credits_by_source: c.credits_by_source.map((s) => ({ vendor: s.vendor, channel: s.channel, amount: s.amount })),
      daily: c.daily.map((d) => ({ day: d.day, cumulative: d.cumulative })),
      top_vendors: c.top_vendors.map((v) => ({ ...v, icon: vendorIcon(v.vendor === "Unknown" ? null : v.vendor) })),
    })),
    expected: [...expected.values()],
    rows,
    dues: (monthDues?.weeks.flatMap((w) => w.items) ?? []).map((u) => ({ date: u.date, vendor: u.vendor, icon: vendorIcon(u.vendor) })),
    weeks,
    subs: subCards,
    history,
  };
}
