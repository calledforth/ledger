import { ArrowDownLeft, ArrowRightLeft, ChevronDown, Repeat, ShoppingBag, Undo2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { ExpectedData, SummaryCardData } from "../dashboard/types";
import { VendorBadge } from "./VendorBadge";

const TRANSFER_LABELS: Record<string, string> = { "transfer:investment": "to investments", "transfer:people": "sent to people", "transfer:self": "to your own accounts" };

/** Cumulative-spend line drawn to one scale; a dashed line marks today in the current month. */
function Spark({ daily, todayDay, currency }: { daily: { day: number; cumulative: string }[]; todayDay: number | null; currency: string }) {
  const W = 300;
  const H = 64;
  const pad = 4;
  const upto = todayDay ?? daily.length;
  const pts = daily.slice(0, upto).map((d) => Number(d.cumulative));
  const max = Math.max(...pts, 1);
  const x = (i: number) => pad + (i / Math.max(daily.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${x(pts.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z` : "";
  const last = pts.length - 1;
  const gid = `g-${currency}`;
  return (
    <div className="spark-wrap">
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Cumulative ${currency} spend through the month, reaching ${formatMoney(String(pts[last] ?? 0), currency)}`}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="grid" x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} vectorEffect="non-scaling-stroke" />
        {pts.length > 0 && <path d={area} fill={`url(#${gid})`} />}
        {pts.length > 0 && <path className="line" d={line} vectorEffect="non-scaling-stroke" />}
        {todayDay && todayDay < daily.length && <line className="today" x1={x(todayDay - 1)} x2={x(todayDay - 1)} y1={pad} y2={H - pad} vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* Drawn outside the stretched SVG so it stays a circle at any width. */}
      {last >= 0 && <span className="spark-dot" style={{ left: `${(x(last) / W) * 100}%`, top: `${(y(pts[last]) / H) * 100}%` }} />}
    </div>
  );
}

export function SummaryCard({ d, todayDay, past }: { d: SummaryCardData; todayDay: number | null; past: boolean }) {
  const spent = Number(d.spent);
  const subPct = spent ? (Number(d.subscriptions) / spent) * 100 : 0;
  const onePct = spent ? (Number(d.one_time) / spent) * 100 : 0;
  const topMax = Math.max(...d.top_vendors.map((v) => Number(v.amount)), 1);
  return (
    <section className="card" aria-label={`${d.currency} summary`}>
      <div className="card-top">
        <span className="label">{past ? "Spent" : "Spent so far"}</span>
        <span className="cur">{d.currency}</span>
      </div>
      <div className="big num">{formatMoney(d.spent, d.currency)}</div>
      <div className="split" role="img" aria-label={`Subscriptions ${formatMoney(d.subscriptions, d.currency)}, one-time ${formatMoney(d.one_time, d.currency)}`}>
        <i style={{ width: `${subPct}%`, background: "var(--sub)" }} />
        <i style={{ width: `${onePct}%`, background: "var(--one)" }} />
      </div>
      <div className="legend">
        <span>
          <Repeat size={13} style={{ color: "var(--sub)" }} />
          Subscriptions <b className="num">{formatMoney(d.subscriptions, d.currency)}</b>
        </span>
        <span>
          <ShoppingBag size={13} style={{ color: "var(--one)" }} />
          One-time <b className="num">{formatMoney(d.one_time, d.currency)}</b>
        </span>
      </div>
      <Spark daily={d.daily} todayDay={todayDay} currency={d.currency} />
      <ul className="facts">
        <li className={Number(d.credits) > 0 ? "credit" : undefined}>
          <ArrowDownLeft size={14} />
          {Number(d.credits) > 0 ? (
            <span>
              Received <span className="num">{formatMoney(d.credits, d.currency, { sign: true })}</span> via{" "}
              {d.credits_by_source.map((s) => (s.channel ? `${s.vendor} (${s.channel})` : s.vendor)).join(", ")}
            </span>
          ) : (
            <span>Nothing received in {d.currency}</span>
          )}
        </li>
        {Number(d.refunded) > 0 && (
          <li>
            <Undo2 size={14} />
            <span>
              <span className="num">{formatMoney(d.refunded, d.currency)}</span> refunded, not counted
            </span>
          </li>
        )}
        {Number(d.transfers) > 0 && (
          <li>
            <ArrowRightLeft size={14} />
            <span>
              {d.transfers_by_category.map((t) => `${formatMoney(t.amount, d.currency)} ${TRANSFER_LABELS[t.category] ?? `to ${t.category.slice(9)}`}`).join(", ")}, not counted
            </span>
          </li>
        )}
      </ul>
      {d.top_vendors.length > 0 && (
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
                <span className="num">{formatMoney(v.amount, d.currency)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function ExpectedCard({ currency, total, subs, other }: ExpectedData) {
  const t = Number(total) || 1;
  return (
    <section className="card" aria-label={`${currency} expected`}>
      <div className="card-top">
        <span className="label">Expected</span>
        <span className="cur">{currency}</span>
      </div>
      <div className="big num">{formatMoney(total, currency)}</div>
      <div className="split">
        <i style={{ width: `${(Number(subs) / t) * 100}%`, background: "var(--sub)" }} />
        <i style={{ width: `${(Number(other) / t) * 100}%`, background: "var(--one)" }} />
      </div>
      <div className="legend">
        <span>
          <Repeat size={13} style={{ color: "var(--sub)" }} />
          Subscriptions <b className="num">{formatMoney(subs, currency)}</b>
        </span>
        <span>
          <ShoppingBag size={13} style={{ color: "var(--one)" }} />
          Other dues <b className="num">{formatMoney(other, currency)}</b>
        </span>
      </div>
    </section>
  );
}
