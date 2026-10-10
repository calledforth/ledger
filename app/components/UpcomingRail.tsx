"use client";

import { CalendarClock, CircleCheck, ExternalLink, Repeat, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { cancelSub, setSubEnd } from "../actions";
import type { SubCard, UpWeek } from "../dashboard/types";
import { VendorBadge } from "./VendorBadge";

export type { SubCard, UpWeek };

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
    <aside className="panel rail" aria-label={title}>
      {weeks && (
        <>
          <div className="panel-head">
            <h2>
              <CalendarClock size={17} className="h-icon" />
              {title}
            </h2>
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
                    <span className="v">
                      {it.vendor} {it.plan && <span className="plan">{it.plan}</span>}
                    </span>
                    <span className="s">{it.detail}</span>
                  </span>
                  <span className="num">{it.amount_label}</span>
                </button>
              ))}
            </div>
          ))}
        </>
      )}

      <div className="panel-head" style={{ marginTop: weeks ? 14 : 0 }}>
        <h2>
          <Repeat size={17} className="h-icon" />
          Subscriptions
        </h2>
        <span className="count">{subs.length} active</span>
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
              <span>–</span>
            )}
          </span>
          <VendorBadge icon={s.icon} name={s.vendor} />
          <span className="meta">
            <span className="v">
              {s.vendor} <span className="plan">{s.plan}</span>
            </span>
            <span className="s">
              {s.cycle}
              {s.ended_at ? ` · ends ${s.ended_at}` : ""}
            </span>
          </span>
          <span className="num">{s.amount_label}</span>
        </button>
      ))}

      <dialog ref={dialog} className="sheet" onClose={() => setSel(null)} aria-labelledby="sub-title">
        {sel && <SubSheet key={sel.id} sub={sel} today={today} close={() => dialog.current?.close()} />}
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
        <header>
          <span className="done-icon">
            <CircleCheck size={22} />
          </span>
          <h3 id="sub-title" className="grow">
            {done}
          </h3>
        </header>
        <p className="hint">
          This only updated your tracker. {sub.vendor} was not contacted.
          {sub.billing_url && (
            <>
              {" "}
              Cancel there too on their{" "}
              <a href={sub.billing_url} target="_blank" rel="noopener noreferrer">
                billing page <ExternalLink size={12} />
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
        <div className="grow">
          <h3 id="sub-title">
            {sub.vendor} <span className="muted plan">{sub.plan}</span>
          </h3>
          <div className="muted">
            <span className="num">{sub.amount_label}</span> {sub.cycle}
          </div>
        </div>
        <button type="button" className="iconbtn ghost" onClick={close} aria-label="Close">
          <X size={18} />
        </button>
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
              Open <ExternalLink size={12} />
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
