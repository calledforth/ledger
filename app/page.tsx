import Link from "next/link";
import { getDb } from "@/db/client";
import { listCharges } from "@/domain/charges";
import { addMoney } from "@/domain/money";
import { listSubscriptions } from "@/domain/subscriptions";
import { getMonthSummary } from "@/domain/summary";
import { upcomingPayments, type UpcomingItem } from "@/domain/upcoming";
import { dayLabel, formatMoney, monthLabel, shortDate, timeIst } from "@/lib/format";
import { vendorIcon } from "@/lib/icons";
import { addDays, daysInMonth, istDate, shiftMonth, todayIst } from "@/lib/time";
import { logout } from "./login/actions";
import { ChargeList, type ChargeRow } from "./components/ChargeList";
import { ExpectedCard, SummaryCard } from "./components/SummaryCard";
import { VendorBadge } from "./components/VendorBadge";
import { UpcomingRail, type SubCard, type UpWeek } from "./components/UpcomingRail";

export const dynamic = "force-dynamic";

type Search = { m?: string; view?: string; day?: string };

const totalsLabel = (t: Record<string, string>) =>
  Object.entries(t)
    .map(([c, a]) => formatMoney(a, c))
    .join(" · ") || "nothing due";

function upItemDetail(it: UpcomingItem) {
  if (it.kind === "mandate_upcoming") return "Bank pre-debit notice";
  if (it.kind === "manual") return "Expected payment";
  return it.mandate ? `${it.cycle} · auto-debit` : (it.cycle ?? "");
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const today = todayIst();
  const current = today.slice(0, 7);
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : current;
  const view = sp.view === "cal" ? "cal" : "list";
  const isCurrent = month === current;
  const isFuture = month > current;
  const isPast = month < current;
  const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const db = getDb();

  const [summary, chargePage, upcoming, monthDues, subs] = await Promise.all([
    getMonthSummary(db, { month }),
    listCharges(db, { month, limit: 500 }),
    isPast ? null : upcomingPayments(db, isFuture ? { from: `${month}-01`, to: lastDay } : { from: today, days: 30 }),
    // Dues for the rest of the visible month, shown on calendar days after today.
    isPast ? null : upcomingPayments(db, { from: isFuture ? `${month}-01` : addDays(today, 1), to: lastDay }),
    listSubscriptions(db, { status: "active" }),
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

  const selectedDay = view === "cal" && sp.day && /^\d{1,2}$/.test(sp.day) ? Number(sp.day) : null;
  const listRows = selectedDay ? rows.filter((r) => Number(r.date.slice(8)) === selectedDay) : rows;

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

  const todayDay = isCurrent ? Number(today.slice(8)) : null;
  const reviewCount = summary.counts.needs_review;
  const href = (m: string, extra: Partial<Search> = {}) => {
    const q = new URLSearchParams();
    if (m !== current) q.set("m", m);
    const v = extra.view ?? view;
    if (v === "cal") q.set("view", "cal");
    if (extra.day) q.set("day", extra.day);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  // Expected totals for a future month, split into subscriptions vs other dues.
  const expected = new Map<string, { total: string; subs: string; other: string }>();
  for (const w of upcoming?.weeks ?? [])
    for (const it of w.items) {
      const e = expected.get(it.currency) ?? { total: "0", subs: "0", other: "0" };
      e.total = addMoney(e.total, it.amount);
      if (it.subscription_id) e.subs = addMoney(e.subs, it.amount);
      else e.other = addMoney(e.other, it.amount);
      expected.set(it.currency, e);
    }

  return (
    <main className="wrap">
      <header className="topbar">
        <nav className="month" aria-label="Month">
          <Link className="iconbtn" href={href(shiftMonth(month, -1))} aria-label="Previous month">
            ‹
          </Link>
          <h1>{monthLabel(month)}</h1>
          <Link className="iconbtn" href={href(shiftMonth(month, 1))} aria-label="Next month">
            ›
          </Link>
          {!isCurrent && (
            <Link className="chip-link" href={href(current)}>
              This month
            </Link>
          )}
        </nav>
        <div className="top-actions">
          {reviewCount > 0 && <span className="tag rv">{reviewCount} to review</span>}
          <form action={logout}>
            <button className="linkbtn" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {summary.note && (
        <p className="note">
          <b>Ma boi</b>
          <span>{summary.note}</span>
        </p>
      )}

      {isFuture ? (
        <div className="summary">
          {[...expected.entries()].map(([c, e]) => (
            <ExpectedCard key={c} currency={c} {...e} />
          ))}
          {expected.size === 0 && <div className="empty">Nothing is expected in {monthLabel(month)} yet.</div>}
        </div>
      ) : (
        <div className="summary">
          {summary.currencies.map((c) => (
            <SummaryCard
              key={c.currency}
              todayDay={todayDay}
              past={isPast}
              d={{ ...c, review_count: reviewCount, top_vendors: c.top_vendors.map((v) => ({ ...v, icon: vendorIcon(v.vendor === "Unknown" ? null : v.vendor) })) }}
            />
          ))}
          {summary.currencies.length === 0 && <div className="empty">Nothing recorded for {monthLabel(month)} yet. Rows appear here as Ma boi adds them.</div>}
        </div>
      )}

      <div className={`cols${isPast || isFuture ? " single" : ""}`}>
        {isFuture ? (
          <UpcomingRail weeks={weeks} subs={subCards} today={today} title={`Due in ${monthLabel(month)}`} emptyText="No payments expected this month." />
        ) : (
          <section className="panel" aria-label="This month">
            <div className="panel-head">
              <h2>{selectedDay ? dayLabel(`${month}-${String(selectedDay).padStart(2, "0")}`) : isCurrent ? "This month" : monthLabel(month)}</h2>
              <div className="seg" role="tablist">
                <Link href={href(month, { view: "list" })} aria-current={view === "list" ? "page" : undefined}>
                  List
                </Link>
                <Link href={href(month, { view: "cal" })} aria-current={view === "cal" ? "page" : undefined}>
                  Calendar
                </Link>
              </div>
            </div>
            {view === "cal" && (
              <Calendar month={month} today={today} rows={rows} dues={monthDues?.weeks.flatMap((w) => w.items) ?? []} selected={selectedDay} href={(d) => href(month, { view: "cal", day: String(d) })} />
            )}
            {selectedDay && (
              <Link className="chip-link" href={href(month, { view: "cal" })} style={{ justifySelf: "start" }}>
                Show whole month
              </Link>
            )}
            <ChargeList rows={listRows} emptyText={selectedDay ? "No charges on this day." : `No charges in ${monthLabel(month)} yet.`} />
          </section>
        )}
        {isCurrent && (
          <UpcomingRail
            weeks={weeks}
            subs={subCards}
            today={today}
            title="Upcoming"
            emptyText="Nothing due in the next 30 days."
          />
        )}
      </div>
    </main>
  );
}

function Calendar({
  month,
  today,
  rows,
  dues,
  selected,
  href,
}: {
  month: string;
  today: string;
  rows: ChargeRow[];
  dues: UpcomingItem[];
  selected: number | null;
  href: (day: number) => string;
}) {
  const days = daysInMonth(month);
  const firstDow = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const spendByDay = new Map<number, Record<string, string>>();
  for (const r of rows) {
    if (r.direction !== "debit" || r.is_refunded) continue;
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
        const items = future ? dues.filter((u) => u.date === date).map((u) => u.vendor) : rows.filter((r) => Number(r.date.slice(8)) === day && !r.is_refund_credit).map((r) => r.vendor);
        const spend = spendByDay.get(day);
        const cls = ["cell", date === today && "today", future && "future", selected === day && "sel"].filter(Boolean).join(" ");
        return (
          <Link className={cls} key={day} href={href(day)} aria-label={`${dayLabel(date)}: ${items.length} item${items.length === 1 ? "" : "s"}`}>
            <span className="n">{day}</span>
            {spend?.INR && <span className="heat" style={{ width: `${Math.max(12, (Number(spend.INR) / inrMax) * 100)}%` }} />}
            <span className="icons">
              {items.slice(0, 4).map((v, k) => (
                <VendorBadge key={k} icon={vendorIcon(v)} name={v} small />
              ))}
              {items.length > 4 && <span className="muted" style={{ fontSize: 10 }}>+{items.length - 4}</span>}
            </span>
            {spend && (
              <span className="tot">
                {Object.entries(spend)
                  .map(([c, a]) => formatMoney(a, c))
                  .join(" ")}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
