"use client";

import { useRef, useState, useTransition } from "react";
import { saveCharge } from "../actions";
import type { VendorIcon } from "@/lib/icons";
import { VendorBadge } from "./VendorBadge";

export type ChargeRow = {
  id: string;
  vendor: string | null;
  payee_raw: string | null;
  amount: string;
  amount_label: string;
  currency: string;
  date: string; // IST YYYY-MM-DD
  day_label: string;
  time_label: string;
  direction: "debit" | "credit";
  channel: string | null;
  category: string | null;
  notes: string | null;
  is_refunded: boolean;
  is_refund_credit: boolean;
  needs_review: boolean;
  review_reason: string | null;
  subscription: string | null;
  pdf_url: string | null;
  invoice_number: string | null;
  card_last4: string | null;
  icon: VendorIcon | null;
};

const REASONS: Record<string, string> = {
  unknown_vendor: "Who was this?",
  possible_duplicate: "Possible duplicate",
  flagged: "Flagged",
};

export function ChargeList({ rows, emptyText }: { rows: ChargeRow[]; emptyText: string }) {
  const [editing, setEditing] = useState<ChargeRow | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const open = (r: ChargeRow) => {
    setEditing(r);
    dialog.current?.showModal();
  };

  if (rows.length === 0) return <div className="empty">{emptyText}</div>;
  const days: [string, ChargeRow[]][] = [];
  for (const r of rows) {
    const last = days[days.length - 1];
    if (last && last[0] === r.date) last[1].push(r);
    else days.push([r.date, [r]]);
  }

  return (
    <>
      <div className="rows">
        {days.map(([date, items]) => (
          <div key={date}>
            <div className="day">
              <span>{items[0].day_label}</span>
            </div>
            {items.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => open(r)}
                className={["row", r.is_refunded && "refunded", r.direction === "credit" && "credit", r.needs_review && "review"].filter(Boolean).join(" ")}
              >
                <VendorBadge icon={r.icon} name={r.vendor} />
                <span className="meta">
                  <span className="v">{r.vendor ?? r.payee_raw ?? "Unknown"}</span>
                  <span className="s">
                    {r.subscription && <span className="tag sub">{r.subscription}</span>}
                    {r.direction === "credit" && <span className="tag cr">{r.is_refund_credit ? "refund" : (r.category ?? "received")}</span>}
                    {r.is_refunded && <span className="tag">refunded</span>}
                    {r.needs_review && <span className="tag rv">{REASONS[r.review_reason ?? ""] ?? "Needs review"}</span>}
                    {r.direction === "debit" && !r.subscription && r.category && <span className="tag">{r.category}</span>}
                    <span>
                      {r.time_label}
                      {r.channel ? ` · ${r.channel}` : ""}
                    </span>
                  </span>
                </span>
                <span className="amt">
                  <span className="num">{r.amount_label}</span>
                  {r.pdf_url && <span className="s">invoice</span>}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <dialog ref={dialog} className="sheet" onClose={() => setEditing(null)} aria-labelledby="edit-title">
        {editing && <EditCharge row={editing} close={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}

function EditCharge({ row, close }: { row: ChargeRow; close: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="sheet-body"
      action={(fd) =>
        start(async () => {
          const res = await saveCharge(fd);
          if (res.ok) close();
          else setError(res.error);
        })
      }
    >
      <input type="hidden" name="id" value={row.id} />
      <header>
        <VendorBadge icon={row.icon} name={row.vendor} />
        <div>
          <h3 id="edit-title">{row.vendor ?? "Unknown vendor"}</h3>
          <div className="muted num">
            {row.amount_label} · {row.day_label}, {row.time_label}
          </div>
        </div>
      </header>
      <dl className="kv">
        {row.payee_raw && (
          <>
            <dt>Bank says</dt>
            <dd className="num">{row.payee_raw}</dd>
          </>
        )}
        {row.channel && (
          <>
            <dt>Paid via</dt>
            <dd>
              {row.channel}
              {row.card_last4 ? ` ·· ${row.card_last4}` : ""}
            </dd>
          </>
        )}
        {row.pdf_url && (
          <>
            <dt>Invoice</dt>
            <dd>
              <a href={row.pdf_url} target="_blank" rel="noopener noreferrer">
                {row.invoice_number ?? "Open PDF"} ↗
              </a>
            </dd>
          </>
        )}
      </dl>
      <div className="fields">
        <label className="field" htmlFor="edit-vendor">
          Vendor
          <input id="edit-vendor" name="vendor" defaultValue={row.vendor ?? ""} placeholder="e.g. Swiggy" />
        </label>
        <label className="field" htmlFor="edit-category">
          Category
          <input id="edit-category" name="category" defaultValue={row.category ?? ""} placeholder="e.g. food" />
        </label>
      </div>
      <label className="field" htmlFor="edit-notes">
        Notes
        <textarea id="edit-notes" name="notes" rows={2} defaultValue={row.notes ?? ""} />
      </label>
      {row.payee_raw && (
        <label className="check" htmlFor="edit-alias">
          <input id="edit-alias" type="checkbox" name="alias" />
          <span>Use this vendor for every payment that says “{row.payee_raw}”</span>
        </label>
      )}
      {row.needs_review && (
        <label className="check" htmlFor="edit-reviewed">
          <input id="edit-reviewed" type="checkbox" name="reviewed" defaultChecked />
          <span>Mark as reviewed</span>
        </label>
      )}
      {row.direction === "debit" && !row.is_refunded && (
        <label className="check" htmlFor="edit-refunded">
          <input id="edit-refunded" type="checkbox" name="refunded" />
          <span>This was refunded (keeps it listed, leaves it out of the total)</span>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={close}>
          Close
        </button>
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
