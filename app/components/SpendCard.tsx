"use client";

import { ArrowDownLeft, ArrowRightLeft, ChevronDown, Repeat, ShoppingBag, TrendingDown, TrendingUp, Undo2 } from "lucide-react";
import { currencySymbol, formatMoney, monthLabel } from "@/lib/format";
import type { ExpectedData, MonthData, SummaryCardData } from "../dashboard/types";
import { Bar, SpendRestSkeleton } from "./Skeletons";
import { VendorBadge } from "./VendorBadge";

const TRANSFER_LABELS: Record<string, string> = {
  "transfer:investment": "to investments",
  "transfer:people": "sent to people",
  "transfer:self": "to your own accounts",
};

const monShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

/** INR / USD / … switch. Only shown when there is more than one currency to pick from. */
export function CurrencySwitch({ currencies, value, onChange }: { currencies: string[]; value: string; onChange: (c: string) => void }) {
  if (currencies.length < 2) return <span className="cur">{value}</span>;
  return (
    <div className="seg seg-sm" role="radiogroup" aria-label="Currency">
      {currencies.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} onClick={() => onChange(c)}>
          <span className="sym">{currencySymbol(c).trim()}</span>
          {c}
        </button>
      ))}
    </div>
  );
}

/** Wise-style strip: one bar per month, tallest = most spent; clicking a month opens it. */
function MonthStrip({
  history,
  currency,
  month,
  current,
  onPick,
}: {
  history: MonthData["history"];
  currency: string;
  month: string;
  current: string;
  onPick: (m: string) => void;
}) {
  const vals = history.map((h) => Number(h.spent[currency] ?? 0));
  const max = Math.max(...vals, 1);
  return (
    <div className="mstrip" role="tablist" aria-label="Months">
      {history.map((h, i) => {
        const v = vals[i];
        const future = h.month > current;
        const label = `${monthLabel(h.month)}: ${future ? "upcoming" : formatMoney(String(v), currency)}`;
        return (
          <button
            key={h.month}
            type="button"
            role="tab"
            aria-selected={h.month === month}
            aria-label={label}
            title={label}
            className={`mbar${future ? " future" : ""}${h.month === current ? " now" : ""}`}
            onClick={() => onPick(h.month)}
          >
            <span className="col">
              <i style={{ height: future ? undefined : `${v ? Math.max(6, (v / max) * 100) : 0}%` }} />
            </span>
            <span className="ml">{monShort(h.month)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The one spending card: total for the chosen currency, the month strip (which doubles as a month switcher), the
 * subscriptions/one-time split, money received or left out, and the top vendors.
 */
export function SpendCard({
  loading,
  d,
  expected,
  currencies,
  currency,
  onCurrency,
  history,
  month,
  current,
  onPick,
}: {
  loading?: boolean;
  d: SummaryCardData | null;
  expected: ExpectedData | null;
  currencies: string[];
  currency: string;
  onCurrency: (c: string) => void;
  history: MonthData["history"];
  month: string;
  current: string;
  onPick: (m: string) => void;
}) {
  const isFuture = month > current;
  const isPast = month < current;
  const total = isFuture ? (expected?.total ?? "0") : (d?.spent ?? "0");
  const a = isFuture ? (expected?.subs ?? "0") : (d?.subscriptions ?? "0");
  const b = isFuture ? (expected?.other ?? "0") : (d?.one_time ?? "0");
  const t = Number(total) || 1;
  // Month-over-month change, only for finished months (a month in progress would always look "down").
  const idx = history.findIndex((x) => x.month === month);
  const prev = idx > 0 ? history[idx - 1] : null;
  const prevAmt = prev ? Number(prev.spent[currency] ?? 0) : 0;
  const delta = isPast && prev && prevAmt > 0 ? ((Number(total) - prevAmt) / prevAmt) * 100 : null;
  const topMax = Math.max(...(d?.top_vendors ?? []).map((v) => Number(v.amount)), 1);
  return (
    <section className="card spend" aria-label="Spending">
      <div className="card-top">
        <span className="label">{isFuture ? `Expected in ${monthLabel(month)}` : isPast ? `Spent in ${monthLabel(month)}` : "Spent so far this month"}</span>
        <CurrencySwitch currencies={currencies} value={currency} onChange={onCurrency} />
      </div>
      <div className="spend-body">
        <div className="big-row">
          {loading ? <Bar w={180} h={36} r={8} /> : <span className="big num">{formatMoney(total, currency)}</span>}
          {!loading && delta !== null && prev && (
            <span className={`delta ${delta > 0 ? "rise" : "fall"}`} title={`vs ${monthLabel(prev.month)}`}>
              {delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(Math.round(delta))}% vs {monShort(prev.month)}
            </span>
          )}
        </div>
        <MonthStrip history={history} currency={currency} month={month} current={current} onPick={onPick} />
        {loading ? (
          <SpendRestSkeleton />
        ) : (
          <div className="spend-rest">
            <div
              className="split"
              role="img"
              aria-label={`Subscriptions ${formatMoney(a, currency)}, ${isFuture ? "other dues" : "one-time"} ${formatMoney(b, currency)}`}
            >
              <i style={{ width: `${(Number(a) / t) * 100}%`, background: "var(--sub)" }} />
              <i style={{ width: `${(Number(b) / t) * 100}%`, background: "var(--one)" }} />
            </div>
            <div className="legend">
              <span>
                <Repeat size={13} style={{ color: "var(--sub)" }} />
                Subscriptions <b className="num">{formatMoney(a, currency)}</b>
              </span>
              <span>
                <ShoppingBag size={13} style={{ color: "var(--one)" }} />
                {isFuture ? "Other dues" : "One-time"} <b className="num">{formatMoney(b, currency)}</b>
              </span>
            </div>
            {d && !isFuture && (
              <ul className="facts">
                <li className={Number(d.credits) > 0 ? "credit" : undefined}>
                  <ArrowDownLeft size={14} />
                  {Number(d.credits) > 0 ? (
                    <span>
                      Received <span className="num">{formatMoney(d.credits, currency, { sign: true })}</span> via{" "}
                      {d.credits_by_source.map((s) => (s.channel ? `${s.vendor} (${s.channel})` : s.vendor)).join(", ")}
                    </span>
                  ) : (
                    <span>Nothing received in {currency}</span>
                  )}
                </li>
                {Number(d.refunded) > 0 && (
                  <li>
                    <Undo2 size={14} />
                    <span>
                      <span className="num">{formatMoney(d.refunded, currency)}</span> refunded, not counted
                    </span>
                  </li>
                )}
                {Number(d.transfers) > 0 && (
                  <li>
                    <ArrowRightLeft size={14} />
                    <span>
                      {d.transfers_by_category
                        .map((x) => `${formatMoney(x.amount, currency)} ${TRANSFER_LABELS[x.category] ?? `to ${x.category.slice(9)}`}`)
                        .join(", ")}
                      , not counted
                    </span>
                  </li>
                )}
              </ul>
            )}
            {d && d.top_vendors.length > 0 && (
              <details className="more">
                <summary>
                  Where it went <ChevronDown size={14} className="chev" />
                </summary>
                <div className="vendors">
                  {d.top_vendors.map((v) => (
                    <div className="vbar" key={v.vendor}>
                      <VendorBadge icon={v.icon} name={v.vendor} small />
                      <div className="name">
                        <span>
                          {v.vendor} <span className="muted">×{v.count}</span>
                        </span>
                        <span className="track">
                          <i style={{ width: `${(Number(v.amount) / topMax) * 100}%` }} />
                        </span>
                      </div>
                      <span className="num">{formatMoney(v.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
