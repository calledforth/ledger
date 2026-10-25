import { ANALYSIS, chargesFor, displayVendor } from "../data.js";
import { inr, money, usd } from "../format.js";

function paper(month, { title = "MONTHLY TAPE", extra = "" } = {}) {
  const lines = chargesFor(month)
    .slice(0, 16)
    .map((r) => {
      const name = (displayVendor(r) + (r.transfer ? " *" : "") + (r.review ? " !" : "")).toUpperCase();
      return `<div class="line"><span>${name}</span><span>${r.direction === "credit" ? "+" : ""}${money(r.amount, r.currency)}</span></div>`;
    })
    .join("");
  return `
    <div class="paper">
      <div class="hdr">
        <div class="brand">LEDGER · HDFC</div>
        <h1>${title}</h1>
        <div class="tiny">${month.label} · IST</div>
      </div>
      <hr class="cut"/>
      ${month.empty ? `<div class="void"><h2>VOID</h2><p class="tiny">NO LINES THIS PERIOD</p></div>` : lines}
      <hr class="cut"/>
      <div class="line total"><span>INR SPENT</span><span>${inr(month.inr.spent)}</span></div>
      <div class="line"><span>USD SPENT</span><span>${usd(month.usd.spent)}</span></div>
      <div class="line gold"><span>MOVED TO METAL *</span><span>${inr(month.inr.transfers)}</span></div>
      <div class="line"><span>CREDITS</span><span>+${inr(month.inr.credits)}</span></div>
      <hr class="cut"/>
      ${extra || `<p class="note">${month.note ?? "Awaiting first alert."}</p>`}
      <p class="center tiny">*** END OF MONTH ***</p>
    </div>`;
}

export function render(screen, ctx) {
  const { month, prev, next } = ctx;
  const nav = `<div class="nav-rec"><span>← ${prev.short}</span><span>${next.short} →</span></div>`;

  if (screen === "history") {
    return `<div class="scroll" data-swipe>${nav}${paper(month, { title: month.short.toUpperCase() + " DETAIL" })}</div>`;
  }
  if (screen === "category") {
    return `
      <div class="scroll">
        <div class="paper">
          <div class="hdr"><div class="brand">SKU</div><h1>CROMA / PIXEL</h1></div>
          <hr class="cut"/>
          <div class="line"><span>PIXEL 10</span><span>${inr(124999)}</span></div>
          <div class="line"><span>GST INCL.</span><span>YES</span></div>
          <div class="line"><span>CHANNEL</span><span>CARD</span></div>
          <div class="line"><span>DAY</span><span>03 OCT</span></div>
          <hr class="cut"/>
          <p class="note">Highest spend day. One SKU. The rest of October is change.</p>
          <p class="center tiny">*** KEEP FOR YOUR RECORDS ***</p>
        </div>
      </div>`;
  }
  if (screen === "analysis") {
    const lines = ANALYSIS.map((m) => `<div class="line"><span>${m.short.toUpperCase()}</span><span>${inr(m.inr)}</span></div>`).join("");
    return `
      <div class="scroll">
        <div class="paper yr-tape">
          <div class="hdr"><div class="brand">YTD</div><h1>RUPEE TAPE</h1></div>
          <hr class="cut"/>
          ${lines}
          <hr class="cut"/>
          <p class="note">USD printed on a separate roll. Never added to this one.</p>
        </div>
      </div>`;
  }
  if (screen === "edge") {
    return `
      <div class="scroll">
        <div class="paper">
          <div class="hdr"><div class="brand">EXCEPTION</div><h1>REVIEW !</h1></div>
          <hr class="cut"/>
          <div class="line"><span>09 OCT UPI</span><span>${inr(1250)}</span></div>
          <div class="line"><span>PAYEE</span><span>UNKNOWN</span></div>
          <div class="line"><span>REASON</span><span>NO ALIAS</span></div>
          <hr class="cut"/>
          <p class="note">Starred metal lines are excluded from SPENT. This bang line is included until you name it.</p>
        </div>
      </div>`;
  }
  if (screen === "empty" || month.empty) {
    return `<div class="scroll" data-swipe>${nav}${paper(month, { title: "NOVEMBER" })}</div>`;
  }
  if (screen === "switcher") {
    return `<div class="scroll"><div class="pair" data-swipe>${paper(month)}${paper(next)}</div></div>`;
  }
  return `<div class="scroll" data-swipe>${nav}${paper(month)}</div>`;
}
