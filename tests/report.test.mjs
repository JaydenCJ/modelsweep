// Report assembly and rendering: deterministic ordering and a JSON shape
// that CI scripts can rely on.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildReport, renderText, renderJson } from "../dist/report.js";
import { check, AT } from "./helpers.mjs";

const OPTIONS = { at: AT, withinDays: 90, allow: new Set() };

function sampleReport() {
  const fileB = check(
    "b/config.yaml",
    "job:\n  model: gpt-4-32k\n  temperature: 3.0\n  max_tokens: 128\n"
  );
  const fileA = check("a/app.ts", `const m = "claude-sonnet-5";`);
  return buildReport([fileB, fileA], 2, OPTIONS);
}

test("buildReport counts references, errors and warnings and sets ok", () => {
  const report = sampleReport();
  assert.equal(report.scannedFiles, 2);
  assert.equal(report.referenceCount, 2);
  assert.equal(report.errorCount, 2); // E101 retired + E104 out of range
  assert.equal(report.warningCount, 1); // W204 deprecated max_tokens
  assert.equal(report.ok, false);
  assert.equal(report.at, AT);
});

test("files are sorted lexicographically regardless of input order", () => {
  const report = sampleReport();
  assert.deepEqual(
    report.files.map((f) => f.file),
    ["a/app.ts", "b/config.yaml"]
  );
});

test("renderText groups findings under their reference and shows fixes", () => {
  const text = renderText(sampleReport());
  assert.match(text, /b\/config\.yaml: 3 finding\(s\)/);
  assert.match(text, /2:10 {2}gpt-4-32k/);
  assert.match(text, /error E101: retired model/);
  assert.match(text, /fix: migrate to gpt-4o/);
  assert.match(text, /FAIL \(2 error\(s\), 1 warning\(s\)\)/);
  assert.match(text, /dataset snapshot \d{4}-\d{2}-\d{2}, evaluated at 2026-07-12/);
});

test("quiet mode keeps only the dataset and summary lines", () => {
  const lines = renderText(sampleReport(), { quiet: true }).split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /scanned 2 file\(s\), 2 model reference\(s\): FAIL/);
});

test("renderJson is parseable with a stable top-level shape", () => {
  const parsed = JSON.parse(renderJson(sampleReport()));
  assert.deepEqual(
    Object.keys(parsed),
    ["tool", "snapshot", "at", "scannedFiles", "references", "errors", "warnings", "ok", "findings"]
  );
  assert.equal(parsed.tool, "modelsweep");
  assert.equal(parsed.findings.length, 3);
  assert.ok(parsed.findings.every((f) => f.file && f.code && f.severity && f.message));
});

test("a clean scan renders OK and exits the happy path", () => {
  const clean = buildReport([check("ok.ts", `const m = "gpt-4o";`)], 1, OPTIONS);
  assert.equal(clean.ok, true);
  assert.match(renderText(clean), /OK \(0 error\(s\), 0 warning\(s\)\)/);
});
