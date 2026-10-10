const SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AED: "AED ", SGD: "S$" };

/** Format a decimal string in its own currency. INR uses Indian digit grouping. */
export function formatMoney(amount: string | number, currency: string, opts: { decimals?: "auto" | "always"; sign?: boolean } = {}): string {
  const n = Number(amount);
  const whole = Number.isInteger(n) || (opts.decimals !== "always" && Math.abs(n) >= 1000);
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const body = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  const sym = SYMBOLS[currency] ?? `${currency} `;
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}${sym}${body}`;
}

export function currencySymbol(currency: string) {
  return SYMBOLS[currency] ?? currency;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function shortDate(date: string): { day: string; month: string } {
  const d = new Date(`${date}T00:00:00Z`);
  return { day: String(d.getUTCDate()), month: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) };
}

export function timeIst(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
