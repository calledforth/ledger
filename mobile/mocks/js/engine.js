import { CURRENT_MONTH, MONTHS, neighbor, monthById } from "./data.js";

export function qs() {
  const q = new URLSearchParams(location.search);
  return {
    dir: q.get("dir") || "quiet",
    screen: q.get("screen") || "home",
    month: q.get("month") || CURRENT_MONTH,
    static: q.get("static") === "1",
  };
}

export function href(next) {
  const cur = qs();
  const q = new URLSearchParams({
    dir: next.dir ?? cur.dir,
    screen: next.screen ?? cur.screen,
    month: next.month ?? cur.month,
  });
  if (next.static ?? cur.static) q.set("static", "1");
  return `play.html?${q}`;
}

export function go(next) {
  location.href = href(next);
}

export function monthCtx(id) {
  const month = monthById(id);
  const i = MONTHS.findIndex((m) => m.id === month.id);
  return {
    month,
    prev: neighbor(month.id, -1),
    next: neighbor(month.id, 1),
    i,
    isFirst: i === 0,
    isLast: i === MONTHS.length - 1,
    isCurrent: month.id === CURRENT_MONTH,
  };
}

export function statusBar(light = false) {
  return `
    <div class="sb ${light ? "sb-light" : ""}">
      <span>9:41</span>
      <i class="island"></i>
      <span class="sb-end">
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="0.5"/><rect x="4.5" y="4" width="3" height="8" rx="0.5"/><rect x="9" y="1" width="3" height="11" rx="0.5"/><rect x="13.5" y="0" width="3.2" height="12" rx="0.6" opacity=".35"/></svg>
      </span>
    </div>`;
}

export function bindSwipe(root, { onLeft, onRight, enabled = true }) {
  if (!enabled) return;
  let x0 = 0;
  let y0 = 0;
  let locked = null;
  const surface = root.querySelector("[data-swipe]") || root;
  surface.addEventListener("pointerdown", (e) => {
    x0 = e.clientX;
    y0 = e.clientY;
    locked = null;
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener("pointermove", (e) => {
    if (x0 === 0) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (locked === "x") {
      surface.style.transform = `translateX(${dx * 0.35}px)`;
      surface.style.transition = "none";
    }
  });
  const end = (e) => {
    if (x0 === 0) return;
    const dx = e.clientX - x0;
    surface.style.transform = "";
    surface.style.transition = "";
    x0 = 0;
    if (locked === "x" && Math.abs(dx) > 56) {
      if (dx < 0) onLeft?.();
      else onRight?.();
    }
    locked = null;
  };
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);
}

export function tabs(dir, active, month) {
  const items = [
    ["home", "Home"],
    ["history", "History"],
    ["analysis", "Months"],
  ];
  return `
    <nav class="tabs">
      ${items
        .map(
          ([id, label]) =>
            `<a class="${id === active || (active === "home-prev" && id === "home") ? "on" : ""}" href="${href({ dir, screen: id, month })}">${label}</a>`,
        )
        .join("")}
    </nav>`;
}

export function screenFor(requested, month) {
  if (requested === "home-prev") return "home";
  if (requested === "empty") return "home";
  if (requested === "switcher") return "home";
  return requested;
}

export function resolveMonth(requestedScreen, requestedMonth) {
  if (requestedScreen === "home-prev") return neighbor(CURRENT_MONTH, -1).id;
  if (requestedScreen === "empty") return "2026-11";
  return requestedMonth;
}
