// Date arithmetic underpins every lifecycle verdict, so the edge cases here
// (calendar overflow, leap days, boundary inclusivity) are load-bearing.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseIsoDate, isValidIsoDate, daysBetween, todayIso, dayCount } from "../dist/dates.js";

test("parseIsoDate returns the UTC timestamp for a valid date", () => {
  assert.equal(parseIsoDate("1970-01-01"), 0);
  assert.equal(parseIsoDate("1970-01-02"), 24 * 60 * 60 * 1000);
});

test("malformed and impossible dates are rejected, never coerced", () => {
  for (const bad of ["2026-7-12", "2026/07/12", "20260712", "2026-07-12T00:00:00Z", "", "yesterday"]) {
    assert.equal(parseIsoDate(bad), null, `should reject "${bad}"`);
  }
  // Date.UTC would silently roll 2026-02-30 into March; we must not.
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(parseIsoDate("2026-13-01"), null);
  assert.equal(parseIsoDate("2026-00-10"), null);
  assert.equal(parseIsoDate("2026-04-31"), null);
});

test("leap days parse only in leap years", () => {
  assert.notEqual(parseIsoDate("2024-02-29"), null);
  assert.equal(parseIsoDate("2023-02-29"), null);
});

test("daysBetween is signed and exact across month/year boundaries", () => {
  assert.equal(daysBetween("2026-07-12", "2026-07-12"), 0);
  assert.equal(daysBetween("2026-07-12", "2026-08-05"), 24);
  assert.equal(daysBetween("2026-08-05", "2026-07-12"), -24);
  assert.equal(daysBetween("2025-12-31", "2026-01-01"), 1);
  assert.equal(daysBetween("2024-01-01", "2025-01-01"), 366); // 2024 is a leap year
  // Invalid input throws rather than returning NaN.
  assert.throws(() => daysBetween("not-a-date", "2026-07-12"), /invalid ISO date/);
});

test("todayIso is a valid ISO date; dayCount pluralizes uniformly", () => {
  assert.equal(isValidIsoDate(todayIso()), true);
  assert.equal(dayCount(1), "1 day(s)");
  assert.equal(dayCount(24), "24 day(s)");
});
