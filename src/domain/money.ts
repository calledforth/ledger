/**
 * Exact 2-decimal money arithmetic on strings via integer minor units (BigInt), so totals never drift.
 * There is deliberately no currency conversion anywhere: callers only add amounts of the same currency.
 */
export function toMinor(amount: string): bigint {
  const neg = amount.trim().startsWith("-");
  const [int, frac = ""] = amount.trim().replace("-", "").split(".");
  const v = BigInt(int || "0") * 100n + BigInt((frac + "00").slice(0, 2));
  return neg ? -v : v;
}

export function fromMinor(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = `${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

export function addMoney(a: string, b: string): string {
  return fromMinor(toMinor(a) + toMinor(b));
}

/** Per-currency totals: currency -> amount string. */
export function sumByCurrency(rows: { currency: string; amount: string }[]): Record<string, string> {
  const out: Record<string, bigint> = {};
  for (const r of rows) out[r.currency] = (out[r.currency] ?? 0n) + toMinor(r.amount);
  return Object.fromEntries(Object.entries(out).map(([c, v]) => [c, fromMinor(v)]));
}
