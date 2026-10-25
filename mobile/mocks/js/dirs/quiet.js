import { ANALYSIS, CATEGORIES, CURRENT_MONTH, INSIGHTS_OCT, chargesFor, displayVendor } from "../data.js";
import { href } from "../engine.js";
import { dayShort, initials, inr, money, pct, usd } from "../format.js";

function rows(month, filter) {
  return chargesFor(month)
    .filter((r) => (filter ? filter(r) : true))
    .map((r) => {
      const name = displayVendor(r);
      const cls = r.review ? "review" : r.transfer ? "gold" : r.direction === "credit" ? "credit" : "";
      const amtCls = r.direction === "credit" ? "in" : r.transfer ? "dim" : "out";
      return `<div class="row">
        <div class="av ${cls}">${initials(name)}</div>
        <div class="who">${name}${r.review ? ' <span class="warn">review</span>' : ""}${r.transfer ? " · moved" : ""}
          <small>${dayShort(r.date)} · ${r.channel ?? ""}${r.category ? ` · ${CATEGORIES[r.category]?.label ?? r.category}` : ""}</small>
        </div>
        <div class="amt ${amtCls} num">${r.direction === "credit" ? "+" : ""}${money(r.amount, r.currency)}</div>
      </div>`;
    })
    .join("");
}

function cats(month, currency) {
  const block = currency === "USD" ? month.usd : month.inr;
  const max = Math.max(1, ...block.byCategory.map((c) => c.amount));
  return block.byCategory
    .map((c) => {
      const meta = CATEGORIES[c.id];
      return `<div class="cat">
        <span>${meta?.label ?? c.id}</span>
        <b class="num">${money(c.amount, currency)}</b>
        <div class="bar"><i style="width:${pct(c.amount, max)}%;background:${meta?.color ?? "#111"}"></i></div>
      </div>`;
    })
    .join("");
}

export function render(screen, ctx) {
  const { month, prev, next, dir } = ctx;
  const cur = month.id;
  if (screen === "history") {
    return `
      <div class="scroll" data-swipe>
        <div class="eyebrow">This month</div>
        <div class="month-row"><h1>${month.label}</h1></div>
        <p class="sub">${month.empty ? "No charges yet." : "Spend, credits, and transfers — transfers stay in the list but not the total."}</p>
        <div class="sheet-card">${month.empty ? `<div class="empty"><h2>Quiet so far.</h2><p>HDFC alerts will land here.</p></div>` : rows(month)}</div>
      </div>`;
  }
  if (screen === "category") {
    const shop = month.inr.byCategory.find((c) => c.id === "shopping");
    return `
      <div class="scroll">
        <div class="eyebrow">Insight</div>
        <h1>The Pixel month</h1>
        <p class="prose">Shopping was ${inr(shop?.amount ?? 0)} — almost the whole INR total. Ma boi: <em>without Croma, October looks like September.</em></p>
        <div class="facts">
          <div class="fact"><span>3 Oct · Croma</span><b class="num">${inr(124999)}</b></div>
          <div class="fact"><span>3 Oct · Zomato after</span><b class="num">${inr(820)}</b></div>
          <div class="fact"><span>Rest of shopping</span><b class="num">${inr(0)}</b></div>
        </div>
        <div class="note-card">Highest spend day in the log. One device, one IST day.</div>
        ${rows(month, (r) => r.category === "shopping")}
      </div>`;
  }
  if (screen === "analysis") {
    const max = Math.max(...ANALYSIS.map((m) => m.inr));
    return `
      <div class="scroll">
        <div class="eyebrow">Recent months</div>
        <h1>INR, unconverted</h1>
        <p class="prose">USD is a separate rent. This strip is only rupees. October is the Pixel; the rest is a flat line.</p>
        <div class="bars">
          ${ANALYSIS.map((m) => `<div class="${m.id === CURRENT_MONTH ? "on" : ""}"><i style="height:${Math.max(6, (m.inr / max) * 100)}%"></i><span>${m.short}</span></div>`).join("")}
        </div>
        <div class="facts">
          <div class="fact"><span>Typical month</span><b>~${inr(27000)}</b></div>
          <div class="fact"><span>Gold moved, 4 mo.</span><b>${inr(ANALYSIS.reduce((a, m) => a + m.transfers, 0))}</b></div>
          <div class="fact"><span>USD software, 4 mo.</span><b>${usd(ANALYSIS.reduce((a, m) => a + m.usd, 0))}</b></div>
        </div>
      </div>`;
  }
  if (screen === "edge") {
    return `
      <div class="scroll">
        <div class="eyebrow">Needs a look</div>
        <h1>One unknown UPI</h1>
        <p class="prose">Ma boi could not name the payee. The row is in the month, tinted, and waiting. Transfers sit below — counted as moved, not spent.</p>
        <div class="sheet-card">${rows(month, (r) => r.review || r.transfer)}</div>
      </div>`;
  }
  if (screen === "empty" || month.empty) {
    return `
      <div class="scroll">
        <div class="eyebrow">Upcoming</div>
        <div class="month-row"><h1>November</h1></div>
        <div class="empty">
          <h2>A blank page.</h2>
          <p class="sub">Nothing posted yet. Expected from mandates:</p>
        </div>
        ${(month.upcoming ?? []).map((u) => `<div class="due"><span>${u.vendor}</span><b class="num">${money(u.amount, u.currency)}</b></div>`).join("")}
      </div>`;
  }

  const swipe = screen === "switcher";
  const hero = (m, c) => `
    <section>
      <div class="eyebrow">${m.id === "2026-10" ? "Spent so far" : m.empty ? "Nothing yet" : "Spent"}</div>
      <div class="month-row">
        <h1>${m.label.replace(" 2026", "")}</h1>
        <div class="switch">
          <a class="on" href="#">INR</a>
          <a href="${href({ dir, screen: "history", month: m.id })}">USD ${usd(m.usd.spent)}</a>
        </div>
      </div>
      <div class="hero-num num">${inr(m.inr.spent)}</div>
      <div class="sub">USD ${usd(m.usd.spent)} kept separate${m.inr.transfers ? ` · ${inr(m.inr.transfers)} moved to gold` : ""}</div>
      ${m.note ? `<p class="prose">${m.note}</p>` : ""}
      <div class="cats">${cats(m, "INR")}</div>
      <div class="peek"><span>← ${c.prev.short}</span><span>${c.next.short} →</span></div>
    </section>`;

  if (swipe) {
    return `<div class="scroll"><div class="mid-swipe" data-swipe>${hero(month, ctx)}${hero(next, { prev: month, next })}</div></div>`;
  }
  return `<div class="scroll" data-swipe>${hero(month, ctx)}</div>`;
}
