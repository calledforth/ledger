"use client";

import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, List, LoaderCircle, LogOut, RotateCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { logout } from "../login/actions";
import { ChargeList } from "../components/ChargeList";
import { MonthCalendar } from "../components/MonthCalendar";
import { CalendarSkeleton, ListSkeleton, RailSkeleton, SummarySkeleton } from "../components/Skeletons";
import { SpendCard } from "../components/SpendCard";
import { ThemeToggle } from "../components/ThemeToggle";
import { UpcomingRail } from "../components/UpcomingRail";
import { dayLabel, monthLabel } from "@/lib/format";
import { shiftMonth } from "@/lib/time";
import type { MonthData } from "./types";

type View = "list" | "cal";

const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

const orderCurrencies = (cs: string[]) => [...new Set(cs)].sort((a, b) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b)));

/** Cached months older than this are shown at once and refreshed in the background. */
const STALE_MS = 30_000;

/**
 * The whole dashboard runs client-side over a per-month cache. The server renders the first month; later months come
 * from /api/month, and the months either side are prefetched, so switching months or views never waits on a page
 * render. Uncached months show skeletons straight away. Edits (server actions) refresh the page, which hands down fresh
 * data and drops the cache.
 */
export function Dashboard({ initial, initialView, initialDay }: { initial: MonthData; initialView: View; initialDay: number | null }) {
  const today = initial.today;
  const current = today.slice(0, 7);

  const [cache, setCache] = useState(() => new Map([[initial.month, initial]]));
  const [month, setMonth] = useState(initial.month);
  const [view, setView] = useState<View>(initialView);
  const [day, setDay] = useState<number | null>(initialDay);
  const [cur, setCur] = useState("INR");
  useEffect(() => {
    try {
      const c = localStorage.getItem("ledger.currency");
      if (c) setCur(c);
    } catch {}
  }, []);
  const pickCurrency = (c: string) => {
    setCur(c);
    try {
      localStorage.setItem("ledger.currency", c);
    } catch {}
  };
  const [failed, setFailed] = useState<string | null>(null);
  const [fetching, setFetching] = useState<Set<string>>(() => new Set());

  // Fresh server data (a refresh after an edit) replaces everything cached, since any month may have changed.
  const [base, setBase] = useState(initial.loaded_at);
  const gen = useRef(0);
  if (initial.loaded_at !== base) {
    setBase(initial.loaded_at);
    setCache(new Map([[initial.month, initial]]));
    setMonth(initial.month);
  }
  useEffect(() => {
    gen.current++;
  }, [base]);

  const inflight = useRef(new Set<string>());
  const load = useCallback(async (m: string) => {
    if (inflight.current.has(m)) return;
    inflight.current.add(m);
    setFetching((s) => new Set(s).add(m));
    const g = gen.current;
    try {
      const res = await fetch(`/api/month?m=${m}`, { headers: { accept: "application/json" } });
      if (res.status === 401 || res.redirected) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MonthData;
      if (g !== gen.current) return; // an edit refreshed everything while this was in flight
      setCache((c) => new Map(c).set(m, data));
      setFailed((f) => (f === m ? null : f));
    } catch {
      if (g === gen.current) setFailed(m);
    } finally {
      inflight.current.delete(m);
      setFetching((s) => {
        const n = new Set(s);
        n.delete(m);
        return n;
      });
    }
  }, []);

  const data = cache.get(month);

  // Load the visible month if missing or stale, then warm the months either side.
  useEffect(() => {
    const now = Date.now();
    if (!data) {
      if (failed !== month) load(month);
      return;
    }
    if (now - data.loaded_at > STALE_MS) load(month);
    const t = setTimeout(() => {
      for (const m of [shiftMonth(month, -1), shiftMonth(month, 1)]) {
        const c = cache.get(m);
        if (!c || Date.now() - c.loaded_at > STALE_MS) load(m);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [month, data, cache, failed, load]);

  // Keep the URL shareable without asking the server for a new render.
  const writeUrl = useCallback(
    (m: string, v: View, d: number | null, mode: "push" | "replace") => {
      const q = new URLSearchParams();
      if (m !== current) q.set("m", m);
      if (v === "cal") q.set("view", "cal");
      if (v === "cal" && d) q.set("day", String(d));
      const s = q.toString();
      const url = s ? `/?${s}` : "/";
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [current],
  );

  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(window.location.search);
      const m = q.get("m");
      setMonth(m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : current);
      const v = q.get("view") === "cal" ? "cal" : "list";
      setView(v);
      const d = q.get("day");
      setDay(v === "cal" && d && /^\d{1,2}$/.test(d) ? Number(d) : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [current]);

  const goMonth = (m: string) => {
    setMonth(m);
    setDay(null);
    setFailed(null);
    writeUrl(m, view, null, "push");
  };
  const goView = (v: View) => {
    setView(v);
    setDay(null);
    writeUrl(month, v, null, "replace");
  };
  const pickDay = (d: number | null) => {
    setDay(d);
    writeUrl(month, view, d, "replace");
  };

  const isCurrent = month === current;
  const isFuture = month > current;
  const isPast = month < current;
  const reviewCount = data?.review_count ?? 0;
  const busy = fetching.has(month);

  // While a month loads, the card keeps the last month strip if it covers that month, so only the figures shimmer.
  const lastShown = useRef<MonthData | null>(null);
  if (data) lastShown.current = data;
  const cardData = data ?? (lastShown.current?.history.some((h) => h.month === month) ? lastShown.current : null);

  // Every currency seen this month or in the strip, INR first; the pick sticks across months when it can.
  const currencies = cardData
    ? orderCurrencies([
        ...(data?.summary.map((c) => c.currency) ?? []),
        ...(data?.expected.map((e) => e.currency) ?? []),
        ...cardData.history.flatMap((h) => Object.keys(h.spent)),
      ])
    : [];
  const shownCur = currencies.includes(cur) ? cur : (currencies[0] ?? "INR");

  const rows = data?.rows ?? [];
  const listRows = day ? rows.filter((r) => Number(r.date.slice(8)) === day) : rows;

  return (
    <main className="wrap">
      <header className="topbar">
        <nav className="month" aria-label="Month">
          <button type="button" className="iconbtn" onClick={() => goMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <h1 aria-live="polite">
            <span className="long">{monthLabel(month)}</span>
            <span className="short" aria-hidden>
              {shortMonth(month)}
            </span>
          </h1>
          <button type="button" className="iconbtn" onClick={() => goMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
          {!isCurrent && (
            <button type="button" className="pill" onClick={() => goMonth(current)}>
              Today
            </button>
          )}
          <LoaderCircle size={16} className={`spin${busy && data ? " on" : ""}`} aria-hidden />
        </nav>
        <div className="top-actions">
          {reviewCount > 0 && (
            <span className="badge warn" title="Charges that need a look">
              <CircleAlert size={14} />
              {reviewCount}
              <span className="badge-text"> to review</span>
            </span>
          )}
          <ThemeToggle />
          <form action={logout}>
            <button className="iconbtn ghost" type="submit" aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </form>
        </div>
      </header>

      {failed === month && !data ? (
        <div className="empty error-box">
          <p>Couldn&apos;t load {monthLabel(month)}.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFailed(null);
              load(month);
            }}
          >
            <RotateCw size={15} /> Try again
          </button>
        </div>
      ) : (
        <>
          {data?.note && (
            <p className="note">
              <span className="note-who">
                <Sparkles size={14} /> Ma boi
              </span>
              <span>{data.note}</span>
            </p>
          )}

          {!cardData ? (
            <SummarySkeleton />
          ) : (
            <SpendCard
              loading={!data}
              d={data?.summary.find((c) => c.currency === shownCur) ?? null}
              expected={data?.expected.find((e) => e.currency === shownCur) ?? null}
              currencies={currencies}
              currency={shownCur}
              onCurrency={pickCurrency}
              history={cardData.history}
              month={month}
              current={current}
              onPick={goMonth}
            />
          )}

          <div className={`cols${isPast || isFuture ? " single" : ""}`}>
            {isFuture ? (
              data ? (
                <UpcomingRail
                  weeks={data.weeks}
                  subs={data.subs}
                  today={today}
                  title={`Due in ${monthLabel(month)}`}
                  emptyText="No payments expected this month."
                />
              ) : (
                <RailSkeleton />
              )
            ) : (
              <section className="panel" aria-label="Charges">
                <div className="panel-head">
                  <h2>{day ? dayLabel(`${month}-${String(day).padStart(2, "0")}`) : isCurrent ? "This month" : monthLabel(month)}</h2>
                  <div className="seg" role="tablist" aria-label="View">
                    <button type="button" role="tab" aria-selected={view === "list"} onClick={() => goView("list")}>
                      <List size={15} /> List
                    </button>
                    <button type="button" role="tab" aria-selected={view === "cal"} onClick={() => goView("cal")}>
                      <CalendarDays size={15} /> Calendar
                    </button>
                  </div>
                </div>
                {!data ? (
                  view === "cal" ? (
                    <CalendarSkeleton month={month} />
                  ) : (
                    <ListSkeleton />
                  )
                ) : (
                  <>
                    {view === "cal" && (
                      <MonthCalendar month={month} today={today} rows={rows} dues={data.dues} selected={day} onPick={(d) => pickDay(day === d ? null : d)} />
                    )}
                    {day && (
                      <button type="button" className="pill" onClick={() => pickDay(null)} style={{ justifySelf: "start" }}>
                        Show whole month
                      </button>
                    )}
                    <ChargeList rows={listRows} emptyText={day ? "No charges on this day." : `No charges in ${monthLabel(month)} yet.`} />
                  </>
                )}
              </section>
            )}
            {isCurrent &&
              (data ? (
                <UpcomingRail weeks={data.weeks} subs={data.subs} today={today} title="Upcoming" emptyText="Nothing due in the next 30 days." />
              ) : (
                <RailSkeleton />
              ))}
          </div>
        </>
      )}
    </main>
  );
}
