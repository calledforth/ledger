import { ANALYSIS, CATEGORIES, chargesFor, displayVendor } from "../data.js";
import { dayShort, inr, money, usd } from "../format.js";

export function render(screen, ctx) {
  const { month, prev, next } = ctx;
  const vol = month.id.slice(5);
  const rail = `
    <div class="issue-rail">
      <a href="#">${prev.short}</a>
      <a class="on" href="#">${month.short}</a>
      <a href="#">${next.short}</a>
    </div>`;

  if (screen === "history") {
    const lines = chargesFor(month)
      .map((r) => {
        const name = displayVendor(r);
        return `<div class="row"><span>${dayShort(r.date)}</span><div><b>${name}</b><div class="tiny">${r.channel ?? ""} ${r.review ? "· needs review" : ""}</div></div><span class="folio">${r.direction === "credit" ? "+" : ""}${money(r.amount, r.currency)}${r.transfer ? "*" : ""}</span></div>`;
      })
      .join("");
    return `
      <div class="scroll classified" data-swipe>
        <div class="mast"><div class="vol">The tape · Vol. ${vol}</div><h1>${month.short}.</h1></div>
        ${month.empty ? `<div class="empty-col"><h2>No classifieds.</h2><p>The issue has not gone to press.</p></div>` : lines}
        <p class="tiny">* moved, not spent</p>
      </div>`;
  }
  if (screen === "category") {
    return `
      <div class="scroll">
        <div class="mast"><div class="vol">Dispatch</div><h1>On the third.</h1></div>
        <p class="lead">A Wednesday in Bengaluru. Croma took a Pixel. Dinner after. That is the month, almost.</p>
        <div class="pull">${inr(125819)}<small>3 October, IST</small></div>
        <p class="body">Ma boi wrote: without the phone, October is a September. The rest of the issue is food, a gift, and the usual software rent in dollars — printed in the other column, never added here.</p>
      </div>`;
  }
  if (screen === "analysis") {
    return `
      <div class="scroll">
        <div class="mast"><div class="vol">Index of issues</div><h1>Four months.</h1></div>
        <div class="index">
          ${ANALYSIS.map((m) => `<div class="ix"><span>${m.short} 2026</span><span class="folio">${inr(m.inr)}</span></div>`).join("")}
        </div>
        <p class="body">The gold column is omitted from these folios. It lives in the assay.</p>
      </div>`;
  }
  if (screen === "edge") {
    return `
      <div class="scroll">
        <div class="mast"><div class="vol">Errata</div><h1>A nameless line.</h1></div>
        <p class="lead">9 Oct, UPI, ${inr(1250)}. No vendor after alias lookup. Printed in rust until you name it.</p>
        <p class="body">Also in this issue: ${inr(240000)} to metal. Starred in the tape. Not in the folio total.</p>
      </div>`;
  }
  if (screen === "empty" || month.empty) {
    return `
      <div class="scroll">
        ${rail}
        <div class="empty-col">
          <div class="vol">Vol. 11</div>
          <h2>No issue.</h2>
          <p>November has not been written. The mandates are queued in the drawer.</p>
        </div>
      </div>`;
  }

  const article = `
    <article>
      ${rail}
      <div class="mast"><div class="vol">Ledger letter · Vol. ${vol}</div><h1>${month.short}.</h1></div>
      <div class="byline">A note from Ma boi · IST</div>
      <p class="lead">${month.note ?? "The page is still blank."}</p>
      <div class="pull">${inr(month.inr.spent)}<small>INR spent · USD ${usd(month.usd.spent)} elsewhere</small></div>
      <div class="index">
        <h3>In this issue</h3>
        ${month.inr.byCategory.map((c) => `<div class="ix"><span><i class="dot" style="background:${CATEGORIES[c.id]?.color}"></i>${CATEGORIES[c.id]?.label}</span><span class="folio">${inr(c.amount)}</span></div>`).join("")}
      </div>
    </article>`;

  if (screen === "switcher") {
    return `<div class="scroll"><div class="spread" data-swipe>${article}<aside>${article}</aside></div></div>`;
  }
  return `<div class="scroll" data-swipe>${article}</div>`;
}
