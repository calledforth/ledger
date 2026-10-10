import type { VendorIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { VendorBadge } from "./VendorBadge";

export type SummaryCardData = {
  currency: string;
  spent: string;
  subscriptions: string;
  one_time: string;
  credits: string;
  refunded: string;
  credits_by_source: { vendor: string; channel: string | null; amount: string }[];
  daily: { day: number; cumulative: string }[];
  top_vendors: { vendor: string; amount: string; count: number; icon: VendorIcon | null }[];
  review_count: number;
};

/** Cumulative-spend sparkline drawn to one scale; a dashed line marks today in the current month. */
function Spark({ daily, todayDay, currency }: { daily: { day: number; cumulative: string }[]; todayDay: number | null; currency: string }) {
  const W = 300;
  const H = 56;
  const pad = 3;
  const upto = todayDay ?? daily.length;
  const pts = daily.slice(0, upto).map((d) => Number(d.cumulative));
  const max = Math.max(...pts, 1);
  const x = (i: number) => pad + (i / Math.max(daily.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${x(pts.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z` : "";
  const last = pts.length - 1;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Cumulative ${currency} spend through the month, reaching ${formatMoney(String(pts[last] ?? 0), currency)}`}>
      <line className="grid" x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} />
      {pts.length > 0 && <path className="area" d={area} />}
      {pts.length > 0 && <path className="line" d={line} vectorEffect="non-scaling-stroke" />}
      {todayDay && todayDay < daily.length && <line className="today" x1={x(todayDay - 1)} x2={x(todayDay - 1)} y1={pad} y2={H - pad} vectorEffect="non-scaling-stroke" />}
      {last >= 0 && <circle className="end" cx={x(last)} cy={y(pts[last])} r={2.5} />}
    </svg>
  );
}

export function SummaryCard({ d, todayDay, past }: { d: SummaryCardData; todayDay: number | null; past: boolean }) {
  const spent = Number(d.spent);
  const subPct = spent ? (Number(d.subscriptions) / spent) * 100 : 0;
  const onePct = spent ? (Number(d.one_time) / spent) * 100 : 0;
  const topMax = Math.max(...d.top_vendors.map((v) => Number(v.amount)), 1);
  return (
    <section className="card" aria-label={`${d.currency} summary`}>
      <div className="label">{past ? `Spent in ${d.currency}` : `Spent so far in ${d.currency}`}</div>
      <div className="big num">{formatMoney(d.spent, d.currency)}</div>
      <div className="split" role="img" aria-label={`Subscriptions ${formatMoney(d.subscriptions, d.currency)}, one-time ${formatMoney(d.one_time, d.currency)}`}>
        <i style={{ width: `${subPct}%`, background: "var(--sub)" }} title={`Subscriptions ${formatMoney(d.subscriptions, d.currency)}`} />
        <i style={{ width: `${onePct}%`, background: "var(--one)", animationDelay: "120ms" }} title={`One-time ${formatMoney(d.one_time, d.currency)}`} />
      </div>
      <div className="legend">
        <span>
          <i className="dot" style={{ background: "var(--sub)" }} />
          Subscriptions <b className="num">{formatMoney(d.subscriptions, d.currency)}</b>
        </span>
        <span>
          <i className="dot" style={{ background: "var(--one)" }} />
          One-time <b className="num">{formatMoney(d.one_time, d.currency)}</b>
        </span>
      </div>
      <Spark daily={d.daily} todayDay={todayDay} currency={d.currency} />
      <div className="received">
        {Number(d.credits) > 0 ? (
          <span>
            Received <span className="num">{formatMoney(d.credits, d.currency, { sign: true })}</span> via{" "}
            {d.credits_by_source.map((s) => (s.channel ? `${s.vendor} (${s.channel})` : s.vendor)).join(", ")}
          </span>
        ) : (
          <span>Nothing received in {d.currency}</span>
        )}
        {Number(d.refunded) > 0 && <span style={{ color: "var(--refund)" }}>{formatMoney(d.refunded, d.currency)} refunded, not counted</span>}
      </div>
      {d.top_vendors.length > 0 && (
        <details className="more">
          <summary>Where it went</summary>
          <div className="vendors" style={{ marginTop: 8 }}>
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

export function ExpectedCard({ currency, total, subs, other }: { currency: string; total: string; subs: string; other: string }) {
  const t = Number(total) || 1;
  return (
    <section className="card" aria-label={`${currency} expected`}>
      <div className="label">Expected in {currency}</div>
      <div className="big num">{formatMoney(total, currency)}</div>
      <div className="split">
        <i style={{ width: `${(Number(subs) / t) * 100}%`, background: "var(--sub)" }} />
        <i style={{ width: `${(Number(other) / t) * 100}%`, background: "var(--one)" }} />
      </div>
      <div className="legend">
        <span>
          <i className="dot" style={{ background: "var(--sub)" }} />
          Subscriptions <b className="num">{formatMoney(subs, currency)}</b>
        </span>
        <span>
          <i className="dot" style={{ background: "var(--one)" }} />
          Other dues <b className="num">{formatMoney(other, currency)}</b>
        </span>
      </div>
    </section>
  );
}
