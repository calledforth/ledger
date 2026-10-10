"use client";

import { addMoney } from "@/domain/money";
import { dayLabel, formatMoney } from "@/lib/format";
import { daysInMonth } from "@/lib/time";
import type { ChargeRow, DueMark } from "../dashboard/types";
import { VendorBadge } from "./VendorBadge";

/** Month grid: vendor logos per day, an INR spend bar, and dues on days still to come. Picking a day filters the list. */
export function MonthCalendar({
  month,
  today,
  rows,
  dues,
  selected,
  onPick,
}: {
  month: string;
  today: string;
  rows: ChargeRow[];
  dues: DueMark[];
  selected: number | null;
  onPick: (day: number) => void;
}) {
  const days = daysInMonth(month);
  const firstDow = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const spendByDay = new Map<number, Record<string, string>>();
  for (const r of rows) {
    if (r.direction !== "debit" || r.is_refunded || r.category?.startsWith("transfer:")) continue;
    const d = Number(r.date.slice(8));
    const m = spendByDay.get(d) ?? {};
    m[r.currency] = addMoney(m[r.currency] ?? "0", r.amount);
    spendByDay.set(d, m);
  }
  const inrMax = Math.max(...[...spendByDay.values()].map((m) => Number(m.INR ?? 0)), 1);
  return (
    <div className="cal" role="grid" aria-label="Calendar">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div className="dow" key={d}>
          {d}
        </div>
      ))}
      {Array.from({ length: firstDow }, (_, i) => (
        <div className="cell blank" key={`b${i}`} />
      ))}
      {Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const future = date > today;
        const items = future
          ? dues.filter((u) => u.date === date).map((u) => ({ vendor: u.vendor, icon: u.icon }))
          : rows.filter((r) => r.date === date && !r.is_refund_credit).map((r) => ({ vendor: r.vendor, icon: r.icon }));
        const spend = spendByDay.get(day);
        const cls = ["cell", date === today && "today", future && "future", selected === day && "sel", items.length > 0 && "has"].filter(Boolean).join(" ");
        return (
          <button type="button" className={cls} key={day} onClick={() => onPick(day)} aria-pressed={selected === day} aria-label={`${dayLabel(date)}: ${items.length} item${items.length === 1 ? "" : "s"}`}>
            <span className="n">{day}</span>
            <span className="icons">
              {items.slice(0, 3).map((v, k) => (
                <VendorBadge key={k} icon={v.icon} name={v.vendor} small />
              ))}
              {items.length > 3 && <span className="more-n">+{items.length - 3}</span>}
            </span>
            {spend && (
              <span className="tot">
                {Object.entries(spend)
                  .map(([c, a]) => formatMoney(a, c))
                  .join(" ")}
              </span>
            )}
            {spend?.INR && <span className="heat" style={{ width: `${Math.max(12, (Number(spend.INR) / inrMax) * 100)}%` }} />}
          </button>
        );
      })}
    </div>
  );
}
