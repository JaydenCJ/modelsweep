/**
 * Minimal, dependency-free ISO-date arithmetic. All dates in the dataset and
 * on the CLI are plain `YYYY-MM-DD` strings evaluated in UTC, so scans are
 * reproducible regardless of the machine's timezone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a strict `YYYY-MM-DD` string to a UTC timestamp, or null. */
export function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(ms);
  // Reject dates that only parse via overflow (e.g. 2026-02-30 -> March 2).
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** True when `value` is a valid `YYYY-MM-DD` calendar date. */
export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days from `from` to `to` (positive when `to` is later). Both must be
 * valid ISO dates — callers validate at the boundary (CLI args, dataset).
 */
export function daysBetween(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || b === null) {
    throw new Error(`daysBetween: invalid ISO date (${from}, ${to})`);
  }
  return Math.round((b - a) / DAY_MS);
}

/** Today as a UTC `YYYY-MM-DD` string. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Pluralize the day count used throughout report messages. */
export function dayCount(n: number): string {
  return `${n} day(s)`;
}
