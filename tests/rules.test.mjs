// Parameter-rule semantics per family. Every case here mirrors a documented
// vendor constraint; the rule catalog in docs/rules.md cites the same rows.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluateParams, describeFamilyRules } from "../dist/rules.js";
import { findModel } from "../dist/registry.js";

const REF = { line: 1, col: 1 };

function param(key, value, line = 2) {
  const parsed =
    typeof value === "number"
      ? { kind: "number", value }
      : typeof value === "boolean"
        ? { kind: "boolean", value }
        : typeof value === "string"
          ? { kind: "string", value }
          : { kind: "unknown" };
  return { key, raw: key, line, col: 3, value: parsed };
}

function run(modelId, params) {
  return evaluateParams(findModel(modelId), params, REF);
}

test("openai chat: temperature range is 0..2, inclusive", () => {
  assert.deepEqual(run("gpt-4o", [param("temperature", 2)]), []);
  const findings = run("gpt-4o", [param("temperature", 2.5)]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "E104");
  assert.match(findings[0].message, /outside the supported range 0\.\.2/);
});

test("openai chat: n must be a positive integer", () => {
  assert.equal(run("gpt-4o", [param("n", 0)])[0].code, "E104");
  assert.equal(run("gpt-4o", [param("n", 1.5)])[0].code, "E104");
  assert.deepEqual(run("gpt-4o", [param("n", 3)]), []);
});

test("openai chat: max_tokens draws the deprecated-parameter warning", () => {
  const [finding] = run("gpt-4o", [param("max_tokens", 256)]);
  assert.equal(finding.code, "W204");
  assert.equal(finding.severity, "warning");
  assert.match(finding.fix, /max_completion_tokens/);
});

test("openai chat: temperature plus top_p is advisory, not an error", () => {
  const findings = run("gpt-4o", [param("temperature", 0.5), param("top_p", 0.5)]);
  assert.deepEqual(findings.map((f) => f.code), ["W203"]);
  assert.equal(findings[0].severity, "warning");
});

test("reasoning models reject sampling and penalty controls", () => {
  const findings = run("o1", [
    param("temperature", 0.1),
    param("presence_penalty", 0),
    param("logit_bias", undefined),
  ]);
  assert.deepEqual(findings.map((f) => f.code), ["E103", "E103", "E103"]);
});

test("reasoning models reject max_tokens with a concrete rename fix", () => {
  const [finding] = run("o3-mini", [param("max_tokens", 128)]);
  assert.equal(finding.code, "E103");
  assert.match(finding.fix, /max_completion_tokens/);
});

test("reasoning_effort is validated against the enum", () => {
  assert.deepEqual(run("o3", [param("reasoning_effort", "high")]), []);
  const [finding] = run("o3", [param("reasoning_effort", "extreme")]);
  assert.equal(finding.code, "E104");
  assert.match(finding.message, /not one of minimal, low, medium, high/);
});

test("claude 4.x: temperature plus top_p is a hard conflict", () => {
  const findings = run("claude-sonnet-4-6", [
    param("temperature", 0.5),
    param("top_p", 0.5),
    param("max_tokens", 1024),
  ]);
  assert.deepEqual(findings.map((f) => f.code), ["E105"]);
  assert.equal(findings[0].severity, "error");
});

test("anthropic temperature range is 0..1, not 0..2", () => {
  const [finding] = run("claude-3-opus-20240229", [param("temperature", 1.2), param("max_tokens", 100)]);
  assert.equal(finding.code, "E104");
  assert.match(finding.message, /0\.\.1/);
});

test("adaptive-thinking family rejects sampling and budget_tokens outright", () => {
  const findings = run("claude-sonnet-5", [
    param("temperature", 0.5),
    param("budget_tokens", 4096),
    param("max_tokens", 8192),
  ]);
  assert.deepEqual(findings.map((f) => f.code), ["E103", "E103"]);
  assert.match(findings[1].fix, /adaptive thinking/);
});

test("budget_tokens needs >= 1024 and strictly less than max_tokens", () => {
  const low = run("claude-sonnet-4-5", [param("budget_tokens", 512), param("max_tokens", 2048)]);
  assert.deepEqual(low.map((f) => f.code), ["E104"]);
  const inverted = run("claude-sonnet-4-5", [param("budget_tokens", 4096), param("max_tokens", 2048)]);
  assert.deepEqual(inverted.map((f) => f.code), ["E105"]);
  const fine = run("claude-sonnet-4-5", [param("budget_tokens", 2048), param("max_tokens", 4096)]);
  assert.deepEqual(fine, []);
});

test("missing max_tokens on anthropic calls warns only when a call is visible", () => {
  const withParams = run("claude-haiku-4-5", [param("temperature", 0.3)]);
  assert.deepEqual(withParams.map((f) => f.code), ["W205"]);
  assert.equal(withParams[0].line, REF.line); // anchored to the reference
  assert.deepEqual(run("claude-haiku-4-5", []), []); // bare constant: stay quiet
  assert.deepEqual(run("claude-haiku-4-5", [param("max_tokens", 1024)]), []);
  assert.ok(describeFamilyRules("anthropic-4").some((l) => l.includes("max_tokens is required")));
});
