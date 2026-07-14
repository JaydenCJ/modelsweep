// Extraction is where language reality meets the scanner: object literals,
// kwargs, structs, JSON, YAML. Each test pins one shape the tool claims to
// understand.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractReferences, findKnownIds, extOf } from "../dist/extract.js";

function refs(content, ext) {
  return extractReferences(content, ext);
}

test("a known id inside any string literal is a reference", () => {
  const [ref] = refs(`const FALLBACK = "gpt-4-32k";`, ".ts");
  assert.equal(ref.model, "gpt-4-32k");
  assert.equal(ref.source, "string-literal");
  assert.equal(ref.line, 1);
  assert.equal(ref.col, 19);
});

test("ids inside comments are never references", () => {
  assert.deepEqual(refs(`// switch back to "gpt-4-32k" later`, ".ts"), []);
  assert.deepEqual(refs(`# model: claude-2.1`, ".py"), []);
});

test("unknown strings without a model key produce nothing", () => {
  assert.deepEqual(refs(`const name = "totally-not-a-model";`, ".ts"), []);
});

test("js object literal: model key plus sibling params with parsed values", () => {
  const src = `await client.chat.completions.create({
  model: "gpt-4o",
  temperature: 0.7,
  top_p: 0.9,
  stream: true,
});`;
  const [ref] = refs(src, ".ts");
  assert.equal(ref.model, "gpt-4o");
  assert.equal(ref.source, "model-key");
  const byKey = Object.fromEntries(ref.params.map((p) => [p.key, p.value]));
  assert.deepEqual(byKey.temperature, { kind: "number", value: 0.7 });
  assert.deepEqual(byKey.top_p, { kind: "number", value: 0.9 });
  assert.equal(byKey.stream, undefined); // not a linted param
});

test("python kwargs: model= channel, capitalized booleans, variables unknown", () => {
  const src = `resp = client.chat.completions.create(
    model="gpt-4o",
    temperature=cfg.temp,
    logprobs=True,
    n=2,
)`;
  const [ref] = refs(src, ".py");
  const byKey = Object.fromEntries(ref.params.map((p) => [p.key, p.value]));
  assert.deepEqual(byKey.temperature, { kind: "unknown" });
  assert.deepEqual(byKey.logprobs, { kind: "boolean", value: true });
  assert.deepEqual(byKey.n, { kind: "number", value: 2 });
});

test("json: quoted keys work as model and param keys", () => {
  const src = `{ "request": { "model": "gpt-4o-mini", "temperature": 1.5, "max_tokens": 128 } }`;
  const [ref] = refs(src, ".json");
  assert.equal(ref.model, "gpt-4o-mini");
  const keys = ref.params.map((p) => p.key).sort();
  assert.deepEqual(keys, ["max_tokens", "temperature"]);
});

test("go struct spelling normalizes: Model / Temperature / TopP", () => {
  const src = `req := ChatRequest{
	Model:       "mistral-large-2402",
	Temperature: 0.3,
	TopP:        0.8,
}`;
  const [ref] = refs(src, ".go");
  assert.equal(ref.model, "mistral-large-2402");
  const keys = ref.params.map((p) => p.key).sort();
  assert.deepEqual(keys, ["temperature", "top_p"]);
});

test("budget_tokens nested inside a thinking object is still captured", () => {
  const src = `client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  thinking: { type: "enabled", budget_tokens: 512 },
});`;
  const [ref] = refs(src, ".ts");
  const byKey = Object.fromEntries(ref.params.map((p) => [p.key, p.value]));
  assert.deepEqual(byKey.budget_tokens, { kind: "number", value: 512 });
  assert.deepEqual(byKey.max_tokens, { kind: "number", value: 2048 });
});

test("params never leak between two separate calls in one file", () => {
  const src = `a = client.create(model="gpt-4o", temperature=1.9)
b = client.create(model="o1-mini", max_tokens=64)`;
  const [first, second] = refs(src, ".py");
  assert.deepEqual(first.params.map((p) => p.key), ["temperature"]);
  assert.deepEqual(second.params.map((p) => p.key), ["max_tokens"]);
});

test("yaml: unquoted scalars, sibling params, comments stripped", () => {
  const src = `job:
  model: claude-3-opus-20240229   # pinned long ago
  temperature: 1.2
  top_k: 40
`;
  const [ref] = refs(src, ".yaml");
  assert.equal(ref.model, "claude-3-opus-20240229");
  assert.equal(ref.line, 2);
  const keys = ref.params.map((p) => p.key).sort();
  assert.deepEqual(keys, ["temperature", "top_k"]);
});

test("yaml: sibling collection stops at block boundaries", () => {
  const src = `summarizer:
  model: gpt-4o
  temperature: 0.2

reranker:
  model: gemini-2.5-flash
  temperature: 1.9
`;
  const [first, second] = refs(src, ".yml");
  assert.deepEqual(first.params.map((p) => [p.key, p.value.value]), [["temperature", 0.2]]);
  assert.deepEqual(second.params.map((p) => [p.key, p.value.value]), [["temperature", 1.9]]);
});

test("a plausible-but-unknown id via the model key is still a reference", () => {
  const [ref] = refs(`options = { model: "gpt-4o-mimi" }`, ".ts");
  assert.equal(ref.model, "gpt-4o-mimi");
  assert.equal(ref.source, "model-key");
  // engine keys count too; arbitrary strings do not
  const [engineRef] = refs(`engine = "text-davinci-003"`, ".py");
  assert.equal(engineRef.model, "text-davinci-003");
  assert.deepEqual(refs(`options = { model: "prod-default" }`, ".ts"), []);
});

test("known-id search is boundary-safe (no gpt-4 inside gpt-4-32k)", () => {
  const hits = findKnownIds("uses gpt-4-32k and gpt-4, plus xgpt-4o");
  assert.deepEqual(hits.map((h) => h.id), ["gpt-4-32k", "gpt-4"]);
  assert.equal(extOf("dir/file.test.TS"), ".ts");
  assert.equal(extOf("Makefile"), "");
});

test("markdown files use the prose channel with positions", () => {
  const src = `# runbook\n\nRoll back to \`claude-2.1\` if needed.\n`;
  const [ref] = refs(src, ".md");
  assert.equal(ref.model, "claude-2.1");
  assert.equal(ref.source, "plain-text");
  assert.equal(ref.line, 3);
});
