/** All calendar logic is in IST (Asia/Kolkata, fixed +05:30, no DST). */
export const APP_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parse an ISO-ish timestamp. Strings without an explicit offset ("2026-09-30T23:30", "2026-09-30 23:30:00",
 * "2026-09-30") are interpreted as IST.
 */
export function parseIstTimestamp(input: string): Date {
  const s = input.trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw new Error(`Invalid timestamp "${input}": expected ISO format like 2026-10-05T14:30:00`);
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  let iso = s;
  if (!hasOffset) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = `${s}T00:00:00`;
    else if (/T\d{2}:\d{2}$/.test(s)) iso = `${s}:00`;
    iso += "+05:30";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp "${input}"`);
  return d;
}

/** Calendar parts of an instant as seen in IST. */
export function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(), // 0 = Sunday
  };
}

/** 'YYYY-MM-DD' of the instant in IST. */
export function istDate(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayIst(now: Date = new Date()): string {
  return istDate(now);
}

export function currentMonthIst(now: Date = new Date()): string {
  return todayIst(now).slice(0, 7);
}

export function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month "${month}": expected YYYY-MM`);
}

/** [start, end) instants for an IST calendar month. */
export function monthRangeIst(month: string): { start: Date; end: Date } {
  assertMonth(month);
  const [y, m] = month.split("-").map(Number);
  const start = new Date(`${month}-01T00:00:00+05:30`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = new Date(`${ny}-${pad(nm)}-01T00:00:00+05:30`);
  return { start, end };
}

export function shiftMonth(month: string, delta: number): string {
  assertMonth(month);
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ---- plain calendar dates ('YYYY-MM-DD'), timezone-free arithmetic ----

export function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
    throw new Error(`Invalid date "${date}": expected YYYY-MM-DD`);
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
function fromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Add months, clamping to the end of shorter months (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const [y, m, day] = date.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(day, last))}`;
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

/** Monday of the ISO week containing the date. */
export function isoWeekStart(date: string): string {
  const dow = toUtc(date).getUTCDay(); // 0 Sun
  return addDays(date, -((dow + 6) % 7));
}

/** ISO week label like '2026-W41'. */
export function isoWeekLabel(date: string): string {
  const d = toUtc(date);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${pad(week)}`;
}
