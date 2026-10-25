export function inr(n) {
  const v = Math.round(Number(n) || 0);
  return `₹${v.toLocaleString("en-IN")}`;
}

export function usd(n) {
  const v = Number(n) || 0;
  const whole = Number.isInteger(v);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function money(n, currency) {
  return currency === "USD" ? usd(n) : inr(n);
}

export function dayShort(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function weekday(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
}

export function initials(name) {
  if (!name) return "?";
  const parts = String(name).replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function maxOf(arr, key) {
  return Math.max(1, ...arr.map((x) => (key ? x[key] : x)));
}
