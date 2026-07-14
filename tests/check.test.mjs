// Lifecycle verdicts: the dated-deprecation logic that is modelsweep's whole
// reason to exist. Horizon boundaries and time travel are exercised at exact
// day granularity.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { check, codes, AT } from "./helpers.mjs";

test("a model past its shutdown date is E101 with exact day math", () => {
  const report = check("app.ts", `const m = "gpt-4-32k";`); // shutdown 2025-06-06
  assert.deepEqual(codes(report), ["E101"]);
  const [finding] = report.findings;
  assert.equal(finding.severity, "error");
  assert.match(finding.message, /shut down on 2025-06-06 \(401 day\(s\) before 2026-07-12\)/);
  assert.equal(finding.fix, "migrate to gpt-4o");
  assert.equal(finding.file, "app.ts");
});

test("the --within horizon flips a scheduled shutdown to E102 at the boundary", () => {
  const src = `const m = { model: "claude-opus-4-1-20250805" };`; // shutdown 2026-08-05
  // 2026-05-07 is exactly 90 days before the shutdown: inside the horizon.
  const inside = check("a.ts", src, { at: "2026-05-07" });
  assert.deepEqual(codes(inside), ["E102"]);
  assert.match(inside.findings[0].message, /90 day\(s\) after 2026-05-07/);
  // With an 89-day horizon the same scan only warns.
  const outside = check("a.ts", src, { at: "2026-05-07", withinDays: 89 });
  assert.deepEqual(codes(outside), ["W201"]);
});

test("deprecated with no announced shutdown stays a warning", () => {
  const report = check("bot.py", `model = "command-light"`);
  assert.deepEqual(codes(report), ["W201"]);
  assert.match(report.findings[0].message, /no shutdown announced yet/);
  assert.equal(report.findings[0].fix, "migrate to command-r-08-2024");
});

test("active models produce zero findings", () => {
  const report = check("ok.ts", `const m = { model: "claude-sonnet-5", max_tokens: 1024 };`);
  assert.deepEqual(report.findings, []);
  assert.equal(report.references.length, 1);
});

test("time travel: the same file was clean before the deprecation existed", () => {
  const src = `const m = "gpt-4-32k";`;
  assert.deepEqual(codes(check("a.ts", src, { at: "2024-01-01" })), []);
  assert.deepEqual(codes(check("a.ts", src, { at: AT })), ["E101"]);
});

test("the deprecation announcement date itself already warns", () => {
  const src = `const m = "gpt-4-32k";`; // deprecated 2024-06-06
  assert.deepEqual(codes(check("a.ts", src, { at: "2024-06-05" })), []);
  assert.deepEqual(codes(check("a.ts", src, { at: "2024-06-06" })), ["W201"]);
});

test("floating aliases warn and inherit the target's lifecycle", () => {
  const report = check("a.ts", `const m = "claude-3-5-sonnet-latest";`);
  assert.deepEqual(codes(report), ["E101", "W202"]); // same position, code order
  const [retired, alias] = report.findings;
  assert.match(alias.fix, /pin claude-3-5-sonnet-20241022/);
  assert.match(retired.message, /resolves to claude-3-5-sonnet-20241022, which was shut down/);
});

test("an alias of a living model warns about pinning only", () => {
  const report = check("a.ts", `const m = "chatgpt-4o-latest";`);
  assert.deepEqual(codes(report), ["W202"]);
});

test("--allow suppresses every finding for that id", () => {
  const src = `const m = { model: "gpt-4-32k", temperature: 9 };`;
  const allowed = check("a.ts", src, { allow: new Set(["gpt-4-32k"]) });
  assert.deepEqual(allowed.findings, []);
  const notAllowed = check("a.ts", src);
  assert.ok(notAllowed.findings.length > 0);
});

test("unknown ids under a known prefix get W206 with a did-you-mean", () => {
  const report = check("a.ts", `const opts = { model: "gpt-4o-mimi" };`);
  assert.deepEqual(codes(report), ["W206"]);
  assert.equal(report.findings[0].fix, "did you mean gpt-4o-mini?");
});

test("unknown ids far from anything known get W206 without a guess", () => {
  const report = check("a.ts", `const opts = { model: "claude-hypernova-max-ultra-99" };`);
  assert.deepEqual(codes(report), ["W206"]);
  assert.equal(report.findings[0].fix, undefined);
});

test("findings are sorted by position and carry the file on every row", () => {
  const src = `b = client.create(model="o1-mini", temperature=1)\na = "gpt-4-32k"`;
  const report = check("multi.py", src);
  const positions = report.findings.map((f) => [f.line, f.col]);
  const sorted = [...positions].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  assert.deepEqual(positions, sorted);
  assert.ok(report.findings.every((f) => f.file === "multi.py"));
});
