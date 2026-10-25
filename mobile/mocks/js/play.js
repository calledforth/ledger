import { DIRECTION_META, SCREENS } from "./data.js";
import { bindSwipe, href, monthCtx, qs, resolveMonth, screenFor, statusBar, tabs } from "./engine.js";
import { neighbor } from "./data.js";
import { RENDERERS, THEMES } from "./registry.js";

const state = qs();
const monthId = resolveMonth(state.screen, state.month);
const view = screenFor(state.screen, monthId);
const ctx = {
  ...monthCtx(monthId),
  dir: state.dir,
  screen: state.screen,
};
const theme = THEMES[state.dir] ?? THEMES.quiet;
const render = RENDERERS[state.dir] ?? RENDERERS.quiet;
const inner = render(state.screen === "empty" || state.screen === "edge" || state.screen === "category" || state.screen === "analysis" || state.screen === "history" || state.screen === "switcher" ? state.screen : view, ctx);

const glass = document.querySelector("#glass");
glass.className = `phone-glass ${theme.className}`;
glass.innerHTML = `${statusBar(theme.lightBar)}<div class="screen">${inner}${tabs(state.dir, state.screen, monthId)}</div>`;

if (!state.static) {
  bindSwipe(glass, {
    enabled: true,
    onLeft: () => {
      if (ctx.isLast) return;
      location.href = href({ month: neighbor(monthId, 1).id, screen: view === "home" ? "home" : state.screen });
    },
    onRight: () => {
      if (ctx.isFirst) return;
      location.href = href({ month: neighbor(monthId, -1).id, screen: view === "home" ? "home" : state.screen });
    },
  });
}

const meta = DIRECTION_META.find((d) => d.id === state.dir);
document.title = `${meta?.name ?? "Ledger"} · ${state.screen}`;
document.querySelector("#dir-name").textContent = meta?.name ?? state.dir;
document.querySelector("#dir-one").textContent = meta?.one ?? "";
document.querySelector("#dir-gesture").textContent = meta?.gesture ?? "";

const screenNav = document.querySelector("#screens");
screenNav.innerHTML = SCREENS.map((s) => `<a class="${s.id === state.screen ? "on" : ""}" href="${href({ screen: s.id, month: resolveMonth(s.id, monthId) })}">${s.label}</a>`).join("");

const dirNav = document.querySelector("#dirs");
dirNav.innerHTML = DIRECTION_META.map((d) => `<a class="${d.id === state.dir ? "on" : ""}" href="${href({ dir: d.id })}">${d.name}</a>`).join("");
