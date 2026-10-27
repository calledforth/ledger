import { formatMoney } from "@/lib/format";
import { daysInMonth } from "@/lib/time";
import { fromMinor, toMinor } from "./money";
import { isTransfer } from "./summary";

/**
 * The month, said in words. Everything here is arithmetic over getMonthSummary's output, so it is always current and
 * never needs the assistant. The assistant's own observations live in month_notes and are shown next to this.
 *
 * Text is returned as segments with a tone so both the web dashboard and the mobile app can colour the numbers
 * without parsing prose.
 */
export type Tone = "plain" | "strong" | "in" | "invest" | "out";
export type Segment = { text: string; tone?: Tone };

export type NarrativeCurrency = {
  currency: string;
  spent: string;
  subscriptions: string;
  one_time: string;
  credits: string;
  transfers: string;
  transfers_by_category: { category: string; amount: string }[];
  credits_by_source: { vendor: string; channel: string | null; amount: string }[];
  by_category: { category: string; amount: string }[];
  daily: { day: number; amount: string }[];
};

export type NarrativeRow = {
  id: string;
  vendor: string | null;
  amount: string;
  currency: string;
  date: string; // IST YYYY-MM-DD
  direction: "debit" | "credit";
  category: string | null;
  is_refunded: boolean;
};

export type NarrativeInput = {
  month: string;
  today: string;
  currencies: NarrativeCurrency[];
  rows: NarrativeRow[];
  /** Spending in the previous month, per currency. */
  previous: Record<string, string>;
};

export type MonthStory = {
  paragraphs: Segment[][];
  biggest_expense: { id: string; vendor: string; amount: string; currency: string; amount_label: string; date: string; category: string | null; share_pct: number } | null;
  highest_day: { date: string; amount: string; currency: string; amount_label: string } | null;
  /** Straight-line projection for the month being viewed, only while it is the current month. */
  projected: { currency: string; amount: string; amount_label: string }[];
  vs_previous: { currency: string; delta_pct: number; direction: "under" | "over" | "same"; label: string } | null;
  by_category: { currency: string; category: string; amount: string; amount_label: string; pct: number }[];
};

const money = (a: string, c: string) => formatMoney(a, c);
const isZero = (a: string) => toMinor(a) === 0n;

/** "transfer:investment" → "investing", "transfer:savings" → "savings", "transfer:x" → "x". */
export function transferLabel(category: string): string {
  const k = category.toLowerCase().replace(/^transfer:/, "");
  return k === "investment" || k === "investments" || k === "investing" ? "investing" : k || "your own accounts";
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function monthStory(input: NarrativeInput): MonthStory {
  const { month, today, currencies, rows, previous } = input;
  const current = today.slice(0, 7);
  const isCurrent = month === current;
  const isFuture = month > current;
  const dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(month);
  const primary = currencies[0] ?? null;
  const paragraphs: Segment[][] = [];

  // Received and moved.
  const received: Segment[] = [];
  const credited = currencies.filter((c) => !isZero(c.credits));
  if (credited.length) {
    received.push({ text: "You received " });
    credited.forEach((c, i) => {
      if (i) received.push({ text: " and " });
      received.push({ text: money(c.credits, c.currency), tone: "in" });
      const sources = c.credits_by_source.slice(0, 2).map((s) => `${s.vendor}${s.channel ? ` over ${s.channel}` : ""}`);
      if (sources.length) received.push({ text: ` from ${joinList(sources)}` });
    });
  }
  const moved = currencies.filter((c) => !isZero(c.transfers));
  if (moved.length) {
    received.push({ text: received.length ? ", and moved " : "You moved " });
    moved.forEach((c, i) => {
      if (i) received.push({ text: " and " });
      received.push({ text: money(c.transfers, c.currency), tone: "invest" });
      const transferRows = rows.filter((r) => r.currency === c.currency && r.direction === "debit" && !r.is_refunded && isTransfer(r.category));
      const vendors = [...new Set(transferRows.map((r) => r.vendor).filter((v): v is string => !!v))];
      const kinds = [...new Set(c.transfers_by_category.map((t) => transferLabel(t.category)))];
      if (vendors.length === 1) received.push({ text: ` to ${vendors[0]}` });
      else if (kinds.length) received.push({ text: ` into ${joinList(kinds)}` });
    });
    received.push({ text: ". That's money moved, not spent" });
  }
  if (received.length) {
    received.push({ text: "." });
    paragraphs.push(received);
  }

  // Subscriptions and the rest.
  if (primary && !isZero(primary.spent)) {
    const p: Segment[] = [];
    const withSubs = currencies.filter((c) => !isZero(c.subscriptions));
    if (withSubs.length) {
      p.push({ text: "Subscriptions account for " });
      withSubs.forEach((c, i) => {
        if (i) p.push({ text: " and " });
        p.push({ text: money(c.subscriptions, c.currency), tone: "strong" });
      });
      p.push({ text: isCurrent ? " so far. " : ". " });
    }
    const others = currencies.slice(1).filter((c) => !isZero(c.spent));
    if (others.length) {
      p.push({ text: "Kept apart: " });
      others.forEach((c, i) => {
        if (i) p.push({ text: ", " });
        p.push({ text: money(c.spent, c.currency), tone: "strong" });
        const top = c.by_category[0];
        if (top && c.by_category.length === 1) p.push({ text: ` on ${top.category}` });
      });
      p.push({ text: ". " });
    }
    if (isZero(primary.one_time)) p.push({ text: `Everything in ${primary.currency} was a subscription.` });
    else {
      p.push({ text: withSubs.length ? "The rest, " : "In total, " });
      p.push({ text: money(primary.one_time, primary.currency), tone: "strong" });
      p.push({ text: withSubs.length ? ", went to:" : " went to:" });
    }
    paragraphs.push(p);
  } else if (primary || !currencies.length) {
    paragraphs.push([{ text: isFuture ? "Nothing spent yet; this month is in the future." : isCurrent ? "Nothing spent yet this month." : "Nothing was spent this month." }]);
  }

  // Biggest single expense.
  let biggest: MonthStory["biggest_expense"] = null;
  if (primary) {
    const candidates = rows.filter((r) => r.currency === primary.currency && r.direction === "debit" && !r.is_refunded && !isTransfer(r.category));
    const top = candidates.sort((a, b) => Number(toMinor(b.amount) - toMinor(a.amount)))[0];
    if (top) {
      const spent = toMinor(primary.spent);
      biggest = {
        id: top.id,
        vendor: top.vendor ?? "Unknown",
        amount: top.amount,
        currency: top.currency,
        amount_label: money(top.amount, top.currency),
        date: top.date,
        category: top.category,
        share_pct: spent > 0n ? Number((toMinor(top.amount) * 1000n) / spent) / 10 : 0,
      };
    }
  }

  // Highest day.
  let highest: MonthStory["highest_day"] = null;
  if (primary) {
    const top = [...primary.daily].sort((a, b) => Number(toMinor(b.amount) - toMinor(a.amount)))[0];
    if (top && !isZero(top.amount)) {
      highest = { date: `${month}-${String(top.day).padStart(2, "0")}`, amount: top.amount, currency: primary.currency, amount_label: money(top.amount, primary.currency) };
    }
  }

  // Projection, current month only, once a few days are in.
  const projected: MonthStory["projected"] = [];
  if (isCurrent && dayOfMonth >= 3) {
    const days = daysInMonth(month);
    for (const c of currencies) {
      if (isZero(c.spent)) continue;
      const amount = fromMinor((toMinor(c.spent) * BigInt(days)) / BigInt(dayOfMonth));
      projected.push({ currency: c.currency, amount, amount_label: money(amount, c.currency) });
    }
  }

  // Against last month: compare like with like (full month vs full month, or so-far vs projection's base).
  let vs: MonthStory["vs_previous"] = null;
  if (primary && previous[primary.currency] && !isZero(previous[primary.currency]) && !isZero(primary.spent)) {
    const now = isCurrent ? toMinor(projected.find((p) => p.currency === primary.currency)?.amount ?? primary.spent) : toMinor(primary.spent);
    const prev = toMinor(previous[primary.currency]);
    const pct = Number(((now - prev) * 1000n) / prev) / 10;
    const direction = Math.abs(pct) < 1 ? "same" : pct < 0 ? "under" : "over";
    const label =
      direction === "same"
        ? "About the same as last month"
        : `${Math.abs(Math.round(pct))}% ${direction} last month${isCurrent ? ", at this pace" : ""}`;
    vs = { currency: primary.currency, delta_pct: pct, direction, label };
  }

  const by_category: MonthStory["by_category"] = [];
  for (const c of currencies) {
    const spent = toMinor(c.spent);
    for (const k of c.by_category) by_category.push({ currency: c.currency, category: k.category, amount: k.amount, amount_label: money(k.amount, c.currency), pct: spent > 0n ? Number((toMinor(k.amount) * 1000n) / spent) / 10 : 0 });
  }

  return { paragraphs, biggest_expense: biggest, highest_day: highest, projected, vs_previous: vs, by_category };
}

/** Plain-text rendering, for logs, tests and the MCP summary tool. */
export function storyText(story: MonthStory): string {
  return story.paragraphs.map((p) => p.map((s) => s.text).join("")).join("\n");
}
