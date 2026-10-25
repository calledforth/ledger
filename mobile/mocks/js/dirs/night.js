import { ANALYSIS, CATEGORIES, MONTHS, chargesFor, displayVendor } from "../data.js";
import { dayShort, inr, money, usd } from "../format.js";

function monthRail(id) {
  return `<div class="months">${MONTHS.map((m) => `<a class="${m.id === id ? "on" : ""}" href="#">${m.short}</a>`).join("")}</div>`;
}

export function render(screen, ctx) {
  const { month } = ctx;

  if (screen === "history") {
    return `
      <div class="scroll" data-swipe>
        <div class="mark">The tape</div>
        <h1>${month.short}</h1>
        ${
          month.empty
            ? `<div class="empty"><h2>The desk is clear.</h2></div>`
            : chargesFor(month)
                .map((r) => `<div class="row"><div><span class="who">${displayVendor(r)}</span><small>${dayShort(r.date)}${r.transfer ? " · metal" : ""}${r.review ? " · unnamed" : ""}</small></div><b class="num">${money(r.amount, r.currency)}</b></div>`)
                .join("")
        }
      </div>`;
  }
  if (screen === "category") {
    return `
      <div class="scroll">
        <div class="mark">Assay</div>
        <h1>Moved to metal.</h1>
        <p class="said">₹2,40,000 left the current account and became gold. The total above does not include it. That is the rule, not a footnote.</p>
        <div class="metal"><b>${inr(150000)}</b> HDFC Securities · gold ETF<br><b>${inr(90000)}</b> Tanishq · 2g coin</div>
        <p class="said">People (₹5,000 to Mom) does count as spend. Metal does not.</p>
      </div>`;
  }
  if (screen === "analysis") {
    const max = Math.max(...ANALYSIS.map((m) => m.inr));
    return `
      <div class="scroll">
        <div class="mark">Four assays</div>
        <h1>The Pixel month.</h1>
        <div class="spark">${ANALYSIS.map((m) => `<i class="${m.inr > 80000 ? "loud" : ""}" style="height:${Math.max(8, (m.inr / max) * 100)}%"></i>`).join("")}</div>
        ${ANALYSIS.map((m) => `<div class="row"><span>${m.short}</span><b>${inr(m.inr)} <small>USD ${usd(m.usd)}</small></b></div>`).join("")}
      </div>`;
  }
  if (screen === "edge") {
    return `
      <div class="scroll">
        <div class="mark">Unnamed</div>
        <h1>A stray UPI.</h1>
        <p class="said">9 Oct, ${inr(1250)}, no vendor. The desk leaves a gold tick until you decide.</p>
        <div class="row"><div><span class="tick"></span><span class="who">UPI-QR-UNKNOWN</span></div><b>${inr(1250)}</b></div>
      </div>`;
  }
  if (screen === "empty" || month.empty) {
    return `
      <div class="scroll" data-swipe>
        ${monthRail(month.id)}
        <div class="empty">
          <div class="mark">November</div>
          <h2>The desk is clear.</h2>
          <div class="line"></div>
          <p class="said">No spend. No metal. Mandates wait in the drawer.</p>
        </div>
      </div>`;
  }

  const body = `
    <div class="mark">Night assay</div>
    <h1>${month.label}</h1>
    ${monthRail(month.id)}
    <div class="gold-num num">${inr(month.inr.spent)}</div>
    <p class="said">${month.note ?? "Nothing on the desk."}</p>
    ${month.inr.transfers ? `<div class="metal"><b>${inr(month.inr.transfers)}</b> moved to metal this month — excluded.</div>` : ""}
    <div class="row sans"><span>USD software</span><b>${usd(month.usd.spent)}</b></div>
    ${month.inr.byCategory
      .slice(0, 4)
      .map((c) => `<div class="row sans"><span><i class="tick" style="background:${CATEGORIES[c.id]?.color}"></i>${CATEGORIES[c.id]?.label}</span><b>${inr(c.amount)}</b></div>`)
      .join("")}`;

  if (screen === "switcher") {
    return `<div class="scroll"><div class="spread" data-swipe><section>${body}</section><section class="dim">${body}</section></div></div>`;
  }
  return `<div class="scroll" data-swipe>${body}</div>`;
}
