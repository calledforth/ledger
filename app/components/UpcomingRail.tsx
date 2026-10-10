"use client";

import { useRef, useState, useTransition } from "react";
import { cancelSub, setSubEnd } from "../actions";
import type { VendorIcon } from "@/lib/icons";
import { VendorBadge } from "./VendorBadge";

export type UpItem = {
  key: string;
  date: string;
  day: string;
  mon: string;
  vendor: string;
  plan: string | null;
  amount_label: string;
  detail: string;
  mandate: boolean;
  subscription_id: string | null;
  icon: VendorIcon | null;
};
export type UpWeek = { label: string; totals: string; items: UpItem[] };
export type SubCard = {
  id: string;
  vendor: string;
  plan: string;
  amount_label: string;
  cycle: string;
  next_charge_date: string | null;
  next_label: string | null;
  ended_at: string | null;
  billing_url: string | null;
  mandate: string | null;
  icon: VendorIcon | null;
};

export function UpcomingRail({
  weeks,
  subs,
  today,
  title,
  emptyText,
}: {
  weeks: UpWeek[] | null;
  subs: SubCard[];
  today: string;
  title: string;
  emptyText: string;
}) {
  const [sel, setSel] = useState<SubCard | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const open = (id: string | null) => {
    const s = subs.find((x) => x.id === id);
    if (!s) return;
    setSel(s);
    dialog.current?.showModal();
  };

  return (
    <aside className="panel" aria-label={title}>
      {weeks && (
        <>
          <div className="panel-head">
            <h2>{title}</h2>
          </div>
          {weeks.length === 0 && <div className="empty">{emptyText}</div>}
          {weeks.map((w) => (
            <div className="week" key={w.label}>
              <div className="weekhead">
                <span>{w.label}</span>
                <span className="num">{w.totals}</span>
              </div>
              {w.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={`up${it.mandate ? " mandate" : ""}`}
                  onClick={() => open(it.subscription_id)}
                  disabled={!it.subscription_id}
                  title={it.subscription_id ? "Open subscription" : undefined}
                >
                  <span className="date">
                    <b>{it.day}</b>
                    <span>{it.mon}</span>
                  </span>
                  <VendorBadge icon={it.icon} name={it.vendor} />
                  <span className="meta">
                    <div className="v">
                      {it.vendor} {it.plan && <span className="muted" style={{ fontWeight: 400 }}>{it.plan}</span>}
                    </div>
                    <div className="s">{it.detail}</div>
                  </span>
                  <span className="num">{it.amount_label}</span>
                </button>
              ))}
            </div>
          ))}
        </>
      )}

      <div className="panel-head" style={{ marginTop: weeks ? 12 : 0 }}>
        <h2>Subscriptions</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {subs.length} active
        </span>
      </div>
      {subs.length === 0 && <div className="empty">No active subscriptions yet. Ma boi adds them from receipts and mandate emails.</div>}
      {subs.map((s) => (
        <button key={s.id} type="button" className={`up${s.mandate ? " mandate" : ""}`} onClick={() => open(s.id)}>
          <span className="date">
            {s.next_label ? (
              <>
                <b>{s.next_label.split(" ")[0]}</b>
                <span>{s.next_label.split(" ")[1]}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </span>
          <VendorBadge icon={s.icon} name={s.vendor} />
          <span className="meta">
            <div className="v">
              {s.vendor} <span className="muted" style={{ fontWeight: 400 }}>{s.plan}</span>
            </div>
            <div className="s">
              {s.cycle}
              {s.ended_at ? ` · ends ${s.ended_at}` : ""}
            </div>
          </span>
          <span className="num">{s.amount_label}</span>
        </button>
      ))}

      <dialog ref={dialog} className="sheet" onClose={() => setSel(null)} aria-labelledby="sub-title">
        {sel && <SubSheet sub={sel} today={today} close={() => dialog.current?.close()} />}
      </dialog>
    </aside>
  );
}

function SubSheet({ sub, today, close }: { sub: SubCard; today: string; close: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const submit = (fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, okText: string) => (fd: FormData) =>
    start(async () => {
      const res = await fn(fd);
      if (res.ok) setDone(okText);
      else setError(res.error ?? "Something went wrong");
    });

  if (done)
    return (
      <div className="sheet-body">
        <h3 id="sub-title">{done}</h3>
        <p className="hint">
          This only updated your tracker. {sub.vendor} was not contacted.
          {sub.billing_url && (
            <>
              {" "}
              Cancel there too on their{" "}
              <a href={sub.billing_url} target="_blank" rel="noopener noreferrer">
                billing page ↗
              </a>
            </>
          )}
        </p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    );

  return (
    <form className="sheet-body" action={submit(cancelSub, `${sub.vendor} marked cancelled`)}>
      <input type="hidden" name="id" value={sub.id} />
      <header>
        <VendorBadge icon={sub.icon} name={sub.vendor} />
        <div>
          <h3 id="sub-title">
            {sub.vendor} {sub.plan}
          </h3>
          <div className="muted num">
            {sub.amount_label} {sub.cycle}
          </div>
        </div>
      </header>
      <dl className="kv">
        <dt>Next charge</dt>
        <dd>{sub.next_charge_date ?? "Not known"}</dd>
        {sub.mandate && (
          <>
            <dt>Mandate</dt>
            <dd>{sub.mandate}</dd>
          </>
        )}
        <dt>Billing page</dt>
        <dd>
          {sub.billing_url ? (
            <a href={sub.billing_url} target="_blank" rel="noopener noreferrer">
              Open ↗
            </a>
          ) : (
            "Not known"
          )}
        </dd>
      </dl>
      <div className="fields">
        <label className="field" htmlFor="cancelled_on">
          Cancelled on
          <input id="cancelled_on" type="date" name="cancelled_on" defaultValue={today} required />
        </label>
        <label className="field" htmlFor="ended_at">
          Access ends
          <input id="ended_at" type="date" name="ended_at" defaultValue={sub.ended_at ?? sub.next_charge_date ?? today} />
        </label>
      </div>
      <p className="hint">Marking it cancelled only updates the tracker. It doesn&apos;t contact {sub.vendor}.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={close}>
          Keep it
        </button>
        <button
          type="submit"
          className="btn"
          formAction={submit(setSubEnd, `${sub.vendor} will end on the date you picked`)}
          disabled={pending}
          title="Keep it active but stop expecting charges after Access ends"
        >
          Only set end date
        </button>
        <button type="submit" className="btn danger" disabled={pending}>
          {pending ? "Saving…" : "Mark cancelled"}
        </button>
      </div>
    </form>
  );
}
