import { DIRECTION_META, SCREENS, CURRENT_MONTH } from "./data.js";
import { href, monthCtx, resolveMonth, screenFor, statusBar, tabs } from "./engine.js";
import { RENDERERS, THEMES } from "./registry.js";

function phoneHTML(dir, screen) {
  const monthId = resolveMonth(screen, CURRENT_MONTH);
  const view = screenFor(screen, monthId);
  const ctx = { ...monthCtx(monthId), dir, screen };
  const theme = THEMES[dir];
  const render = RENDERERS[dir];
  const which = ["empty", "edge", "category", "analysis", "history", "switcher"].includes(screen) ? screen : view;
  const inner = render(which, ctx);
  return `
    <div class="phone">
      <div class="phone-glass ${theme.className}">
        ${statusBar(theme.lightBar)}
        <div class="screen">${inner}${tabs(dir, screen, monthId)}</div>
      </div>
    </div>`;
}

const root = document.querySelector("#dirs");
root.innerHTML = DIRECTION_META.map((d) => {
  const shots = SCREENS.map((s) => {
    return `<figure class="shot">
      <a class="frame" href="${href({ dir: d.id, screen: s.id, month: resolveMonth(s.id, CURRENT_MONTH) })}">${phoneHTML(d.id, s.id)}</a>
      <figcaption><span>${s.label}</span><span>${d.name}</span></figcaption>
    </figure>`;
  }).join("");
  return `<section class="dir-block" id="${d.id}">
    <div class="dir-head">
      <div>
        <div class="tag">${d.tag}</div>
        <h2>${d.name}</h2>
        <p>${d.one}<br>${d.gesture}</p>
      </div>
      <a class="chip" href="${href({ dir: d.id, screen: "home" })}">Open interactive →</a>
    </div>
    <div class="rail">${shots}</div>
  </section>`;
}).join("");
