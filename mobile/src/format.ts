const SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AED: "AED ", SGD: "S$" };

/** Indian digit grouping (12,34,567) for INR, western for the rest. Done by hand so it never depends on Intl on device. */
function group(whole: string, indian: boolean): string {
  if (!indian) return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function formatMoney(amount: string | number, currency: string, opts: { decimals?: "auto" | "always"; sign?: boolean } = {}): string {
  const n = Number(amount);
  const abs = Math.abs(n);
  const whole = Number.isInteger(n) || (opts.decimals !== "always" && abs >= 1000);
  const fixed = abs.toFixed(whole ? 0 : 2);
  const [int, frac] = fixed.split(".");
  const body = group(int, currency === "INR") + (frac ? `.${frac}` : "");
  const sym = SYMBOLS[currency] ?? `${currency} `;
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}${sym}${body}`;
}

/** ₹1.42L, ₹41k, $218: for chips and tight spots. */
export function compactMoney(amount: string | number, currency: string): string {
  const n = Math.abs(Number(amount));
  const sym = SYMBOLS[currency] ?? `${currency} `;
  if (currency === "INR" && n >= 100000) return `${sym}${(n / 100000).toFixed(2).replace(/\.?0+$/, "")}L`;
  if (n >= 10000) return `${sym}${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${sym}${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sym}${Math.round(n)}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthName(month: string, short = false): string {
  const m = Number(month.slice(5, 7)) - 1;
  return short ? MONTHS[m].slice(0, 3) : MONTHS[m];
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesday 14 October" */
export function longDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${monthName(date.slice(0, 7))}`;
}

/** "Tue 14" */
export function shortDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const w = name.trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 1)).toUpperCase();
}
