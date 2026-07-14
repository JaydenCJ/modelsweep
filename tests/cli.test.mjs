// End-to-end runs of the compiled CLI: exit codes, formats, and the bundled
// example project. These are the same contracts scripts/smoke.sh asserts.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, tempDir, writeTree, ROOT, AT } from "./helpers.mjs";

const EXAMPLES = join(ROOT, "examples", "legacy-app");

test("--version matches package.json", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const { code, stdout } = runCli("--version");
  assert.equal(code, 0);
  assert.equal(stdout.trim(), pkg.version);
});

test("--help documents subcommands and exits 0", () => {
  const { code, stdout } = runCli("--help");
  assert.equal(code, 0);
  for (const needle of ["scan", "models", "explain", "EXIT CODES"]) {
    assert.ok(stdout.includes(needle), `help missing ${needle}`);
  }
});

test("scanning the bundled legacy app finds the seeded rot", () => {
  const { code, stdout } = runCli("scan", EXAMPLES, "--at", AT);
  assert.equal(code, 1);
  assert.match(stdout, /FAIL \(10 error\(s\), 4 warning\(s\)\)/);
  assert.match(stdout, /scanned 3 file\(s\), 6 model reference\(s\)/);
  for (const needle of ["E101", "E102", "E103", "E104", "E105", "W202", "W204", "W205"]) {
    assert.ok(stdout.includes(needle), `report missing ${needle}`);
  }
});

test("--at time-travels the same tree back to a clean state", () => {
  const dir = writeTree(tempDir(), { "app.ts": `const M = "gpt-4-32k";\n` });
  assert.equal(runCli("scan", dir, "--at", "2024-01-01").code, 0);
  assert.equal(runCli("scan", dir, "--at", AT).code, 1);
});

test("--format json emits valid JSON with the finding rows", () => {
  const { code, stdout } = runCli("scan", EXAMPLES, "--at", AT, "--format", "json");
  assert.equal(code, 1);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.tool, "modelsweep");
  assert.equal(parsed.errors, 10);
  assert.equal(parsed.warnings, 4);
  assert.equal(parsed.findings.length, 14);
  assert.ok(parsed.findings.some((f) => f.code === "E102" && f.model === "claude-opus-4-1"));
});

test("--strict turns a warnings-only run into exit 1", () => {
  const dir = writeTree(tempDir(), { "a.ts": `const M = "chatgpt-4o-latest";\n` });
  assert.equal(runCli("scan", dir, "--at", AT).code, 0); // W202 only
  assert.equal(runCli("scan", dir, "--at", AT, "--strict").code, 1);
});

test("--allow suppresses an id and flips the exit code", () => {
  const dir = writeTree(tempDir(), { "a.ts": `const M = "gpt-4-32k";\n` });
  assert.equal(runCli("scan", dir, "--at", AT).code, 1);
  assert.equal(runCli("scan", dir, "--at", AT, "--allow", "gpt-4-32k").code, 0);
});

test("--within controls the imminent-shutdown escalation", () => {
  const dir = writeTree(tempDir(), { "a.ts": `const c = { model: "claude-opus-4-1-20250805", max_tokens: 10 };\n` });
  assert.equal(runCli("scan", dir, "--at", AT).code, 1); // 24 days out, default 90
  assert.equal(runCli("scan", dir, "--at", AT, "--within", "5").code, 0); // W201 only
});

test("models prints the table and filters by provider and status", () => {
  const all = runCli("models", "--at", AT);
  assert.equal(all.code, 0);
  assert.match(all.stdout, /MODEL\s+PROVIDER\s+STATUS/);
  assert.match(all.stdout, /gpt-4-32k\s+openai\s+retired\s+2024-06-06\s+2025-06-06\s+gpt-4o/);
  const filtered = runCli("models", "--provider", "google", "--status", "retired", "--at", AT);
  assert.match(filtered.stdout, /^gemini-1\.5-pro\s/m); // retired row present
  assert.ok(!filtered.stdout.includes("gpt-4-32k")); // other provider filtered
  assert.doesNotMatch(filtered.stdout, /^gemini-2\.5-pro\s/m); // active row filtered
});

test("explain shows lifecycle, dates and family rules for one id", () => {
  const { code, stdout } = runCli("explain", "claude-opus-4-1", "--at", AT);
  assert.equal(code, 0);
  assert.match(stdout, /resolves to: {2}claude-opus-4-1-20250805 \(floating alias\)/);
  assert.match(stdout, /status: {7}deprecated \(as of 2026-07-12\)/);
  assert.match(stdout, /shutdown: {5}2026-08-05/);
  assert.match(stdout, /temperature and top_p must not be set together/);
});

test("explain on an unknown id and scans of missing paths exit 2", () => {
  const unknown = runCli("explain", "gpt-9000");
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /unknown model id/);
  const missing = runCli("scan", "/nonexistent/nowhere");
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /cannot read path/);
  const usage = runCli("scan", "--format", "xml");
  assert.equal(usage.code, 2);
  assert.match(usage.stderr, /--format expects/);
});
