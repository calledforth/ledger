/**
 * Never store full card/account numbers. Any run of 8+ digits (spaces or dashes allowed between digits)
 * in free text is masked down to its last four digits, e.g. "A/c 50100123456789" -> "A/c XXXX6789".
 */
const LONG_DIGIT_RUN = /\d(?:[ -]?\d){7,}/g;

export function maskLongNumbers(text: string | null | undefined): string | null {
  if (text == null) return null;
  return text.replace(LONG_DIGIT_RUN, (run) => {
    const digits = run.replace(/\D/g, "");
    return `XXXX${digits.slice(-4)}`;
  });
}

export type Last4Result = { value: string | null; warning?: string };

/** Keep only the last four digits of whatever was supplied. */
export function normalizeCardLast4(input: string | null | undefined): Last4Result {
  if (input == null) return { value: null };
  const digits = String(input).replace(/\D/g, "");
  if (digits.length === 0) return { value: null };
  if (digits.length < 4) return { value: null, warning: `card_last4 "${input}" has fewer than 4 digits; dropped` };
  if (digits.length > 4)
    return { value: digits.slice(-4), warning: `card_last4 had ${digits.length} digits; kept only the last 4` };
  return { value: digits };
}

export function normalizeCurrency(input: string): string {
  const c = input.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new Error(`Invalid currency "${input}": expected a 3-letter ISO code like INR or USD`);
  return c;
}

/** Normalize a money amount to a positive 2-decimal string without going through floats for display. */
export function normalizeAmount(input: string | number): string {
  const s = String(input).replace(/[,\s₹$]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount "${input}"`);
  const n = Number(s);
  if (!(Math.abs(n) > 0)) throw new Error(`Amount must be non-zero, got "${input}"`);
  return Math.abs(n).toFixed(2);
}

export function blankToNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t === "" ? null : t;
}
