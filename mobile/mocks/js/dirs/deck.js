import { ANALYSIS, CATEGORIES, MONTHS, chargesFor, displayVendor } from "../data.js";
import { initials, inr, money, usd } from "../format.js";

function dots(id) {
  return `<div class="dots">${MONTHS.map((m) => `<i class="${m.id === id ? "on" : ""}"></i>`).join("")}</div>`;
}

function card(month) {
  return `
    <div class="card">
      <div class="mo">${month.label}</div>
      <div class="big num">${inr(month.inr.spent)}</div>
      <p class="said">${month.note ?? "Nothing posted. Swipe back to October."}</p>
    </div>`;
}

export function render(screen, ctx) {
  const { month, next } = ctx;
  if (screen === "history") {
    const list = chargesFor(month)
      .map((r) => {
        const name = displayVendor(r);
        return `<div class="row"><div class="av">${initials(name)}</div><div class="who">${name}<small>${r.date.slice(8)} ${month.short}${r.review ? " · review" : ""}${r.transfer ? " · moved" : ""}</small></div><b class="num">${money(r.amount, r.currency)}</b></div>`;
      })
      .join("");
    return `
      <div class="scroll">
        <div class="top"><span>${month.short} tape</span><span>${inr(month.inr.spent)}</span></div>
        <div class="sheet"><div class="handle"></div>${month.empty ? `<div class="empty-card"><p>No rows to drag through.</p></div>` : list}</div>
      </div>`;
  }
  if (screen === "category") {
    const food = month.inr.byCategory.find((c) => c.id === "food");
    return `
      <div class="scroll">
        <div class="top"><span class="coral">Food</span><span>${inr(food?.amount ?? 0)}</span></div>
        <p class="said">Not the story of the month — the Pixel is — but the daily texture. Swiggy and Zomato, small and regular.</p>
        ${chargesFor(month)
          .filter((r) => r.category === "food")
          .map((r) => `<div class="row"><div class="av">${initials(r.vendor)}</div><div class="who">${r.vendor}<small>${r.date}</small></div><b>${inr(r.amount)}</b></div>`)
          .join("")}
      </div>`;
  }
  if (screen === "analysis") {
    return `
      <div class="scroll">
        <div class="top"><span>The year so far</span><span>INR</span></div>
        <div class="yr">
          ${ANALYSIS.map((m) => `<div class="m ${m.id === month.id ? "on" : ""}"><div>${m.short}<div class="said" style="font-size:12px;margin:0">USD ${usd(m.usd)}</div></div><b class="num">${inr(m.inr)}</b></div>`).join("")}
        </div>
      </div>`;
  }
  if (screen === "edge") {
    return `
      <div class="scroll">
        <div class="card">
          <div class="mo coral">Needs a look</div>
          <div class="big num">${inr(1250)}</div>
          <p class="said">Unknown UPI on the 9th. The deck keeps going; this card stays coral until you name the payee.</p>
        </div>
      </div>`;
  }
  if (screen === "empty" || month.empty) {
    return `
      <div class="scroll" data-swipe>
        ${dots(month.id)}
        <div class="card empty-card"><div><div class="mo">November</div><h2>Blank card.</h2><p>Mandates are queued. Spend is not.</p></div></div>
      </div>`;
  }

  const pills = month.inr.byCategory
    .slice(0, 5)
    .map((c) => `<span class="pill" style="box-shadow: inset 3px 0 ${CATEGORIES[c.id]?.color}"><span>${CATEGORIES[c.id]?.label}</span><b>${inr(c.amount)}</b></span>`)
    .join("");

  const body = `
    <div class="top"><span>Ledger</span><span>USD ${usd(month.usd.spent)}</span></div>
    ${dots(month.id)}
    ${card(month)}
    <div class="pills">${pills}</div>
    <div class="up">Drag up for the tape</div>`;

  if (screen === "switcher") {
    return `<div class="scroll"><div class="stack" data-swipe>${card(month)}${card(next)}</div>${dots(month.id)}</div>`;
  }
  return `<div class="scroll" data-swipe>${body}</div>`;
}
