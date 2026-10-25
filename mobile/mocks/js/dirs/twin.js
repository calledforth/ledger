import { ANALYSIS, CATEGORIES, chargesFor, displayVendor } from "../data.js";
import { dayShort, inr, money, usd } from "../format.js";

function pane(kind, month) {
  const isInr = kind === "INR";
  const b = isInr ? month.inr : month.usd;
  const total = isInr ? inr(b.spent) : usd(b.spent);
  const extra = isInr
    ? `${inr(b.transfers)} moved to gold · not spent`
    : `All software. Never added to rupees.`;
  return `
    <a class="pane ${isInr ? "inr" : "usd"}" href="#">
      <div class="cur">${kind}</div>
      <div class="big num">${month.empty ? (isInr ? "₹0" : "$0") : total}</div>
      <p>${month.empty ? "No lines this month." : extra}</p>
    </a>`;
}

export function render(screen, ctx) {
  const { month } = ctx;

  if (screen === "history") {
    const inrRows = chargesFor(month, "INR");
    return `
      <div class="scroll" data-swipe>
        <div class="rail"><h1>${month.short} · two tapes</h1></div>
        <div class="seg"><a class="on">INR</a><a>USD</a></div>
        <div class="rows">
          ${inrRows.length === 0 ? `<div class="empty-pane">No INR rows.</div>` : inrRows.map((r) => `<div class="row"><span>${displayVendor(r)}<br><small>${dayShort(r.date)}${r.transfer ? " · moved" : ""}${r.review ? " · review" : ""}</small></span><b class="num">${r.direction === "credit" ? "+" : ""}${money(r.amount, r.currency)}</b></div>`).join("")}
        </div>
      </div>`;
  }
  if (screen === "category") {
    const usdRows = chargesFor(month, "USD");
    return `
      <div class="scroll">
        <div class="pane usd">
          <div class="cur">USD only</div>
          <div class="big num">${usd(month.usd.spent)}</div>
          <p>Software rent for October. A different book from the Pixel.</p>
        </div>
        <div class="rows">
          ${usdRows.map((r) => `<div class="row"><span>${r.vendor}</span><b>${usd(r.amount)}</b></div>`).join("")}
        </div>
      </div>`;
  }
  if (screen === "analysis") {
    const maxI = Math.max(...ANALYSIS.map((m) => m.inr));
    const maxU = Math.max(...ANALYSIS.map((m) => m.usd));
    return `
      <div class="scroll">
        <div class="rail"><h1>Side by side, never summed</h1></div>
        <p class="disclaimer">There is no combined total. There is no FX line.</p>
        <div class="bars">
          <div class="col inr">
            <h3>INR</h3>
            <div class="hbar">${ANALYSIS.map((m) => `<i title="${m.short}" style="height:${Math.max(6, (m.inr / maxI) * 100)}%"></i>`).join("")}</div>
          </div>
          <div class="col usd">
            <h3>USD</h3>
            <div class="hbar">${ANALYSIS.map((m) => `<i title="${m.short}" style="height:${Math.max(6, (m.usd / maxU) * 100)}%"></i>`).join("")}</div>
          </div>
        </div>
        <div class="rows" style="margin-top:18px">
          ${ANALYSIS.map((m) => `<div class="row"><span>${m.short}</span><b>${inr(m.inr)} · ${usd(m.usd)}</b></div>`).join("")}
        </div>
      </div>`;
  }
  if (screen === "edge") {
    return `
      <div class="scroll">
        <div class="pane inr">
          <div class="cur">Asymmetric month</div>
          <div class="big num">${inr(month.inr.spent)}</div>
          <p>INR is loud. USD is a flat software bill. Showing both at once is the point — a combined number would lie.</p>
        </div>
        <div class="pane usd">
          <div class="cur">USD</div>
          <div class="big num">${usd(month.usd.spent)}</div>
          <p>Same days. Different book.</p>
        </div>
      </div>`;
  }
  if (screen === "empty" || month.empty) {
    return `
      <div class="scroll" data-swipe>
        <div class="rail"><h1>November</h1></div>
        ${pane("INR", month)}
        ${pane("USD", month)}
        <p class="disclaimer">Both books are empty. Mandates will write the first lines.</p>
      </div>`;
  }

  const body = `
    <div class="rail"><h1>${month.label}</h1><span class="disclaimer">No FX</span></div>
    ${pane("INR", month)}
    ${pane("USD", month)}
    <p class="disclaimer">Swipe the month. Each pane stays in its own currency.</p>
    <div class="rows">
      ${month.inr.byCategory.slice(0, 4).map((c) => `<div class="row"><span>${CATEGORIES[c.id]?.label}</span><b>${inr(c.amount)}</b></div>`).join("")}
    </div>`;

  if (screen === "switcher") {
    return `<div class="scroll"><div class="mid" data-swipe><div>${pane("INR", month)}${pane("USD", month)}</div><div>${pane("INR", ctx.next)}${pane("USD", ctx.next)}</div></div></div>`;
  }
  return `<div class="scroll" data-swipe>${body}</div>`;
}
