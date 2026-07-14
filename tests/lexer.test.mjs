// The lexer decides what counts as live code. If a comment leaks into the
// string channel, scans get noisy; if a string is missed, retirements slip
// through — both directions are covered here.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { lex, profileForExt, depthMap, lineStarts, positionAt, PLAIN_TEXT_EXTS } from "../dist/lexer.js";

const TS = profileForExt(".ts");
const PY = profileForExt(".py");

test("finds string literals with contents and stable offsets", () => {
  const src = `const a = "gpt-4o"; const b = 'x';`;
  const { strings, masked } = lex(src, TS);
  assert.equal(strings.length, 2);
  assert.equal(strings[0].content, "gpt-4o");
  assert.equal(src.slice(strings[0].contentStart, strings[0].contentStart + 6), "gpt-4o");
  assert.equal(masked.length, src.length); // offsets survive masking
});

test("escaped quotes stay inside the string", () => {
  const { strings } = lex(String.raw`x = "say \"hi\" now"`, TS);
  assert.equal(strings.length, 1);
  assert.equal(strings[0].content, String.raw`say \"hi\" now`);
});

test("line comments are blanked per profile; strings shield comment markers", () => {
  const ts = lex(`const m = "a // b"; // "gpt-4o"`, TS);
  assert.equal(ts.strings.length, 1); // the quoted id in the comment is gone
  assert.equal(ts.strings[0].content, "a // b");
  const py = lex(`m = "a # b"  # "gpt-4o"`, PY);
  assert.equal(py.strings.length, 1);
  assert.equal(py.strings[0].content, "a # b");
});

test("hash is not a comment in C-like files", () => {
  const { strings } = lex(`tag = "#gpt"; other = "gpt-4o"`, TS);
  assert.equal(strings.length, 2);
});

test("block comments spanning lines are blanked", () => {
  const { strings } = lex(`/* "gpt-4o"\n   "o1-mini" */\nconst x = "gpt-4";`, TS);
  assert.equal(strings.length, 1);
  assert.equal(strings[0].content, "gpt-4");
});

test("python triple-quoted strings are a single span", () => {
  const src = `doc = """uses gpt-4-32k\nand more"""\nx = "o1-mini"`;
  const { strings } = lex(src, PY);
  assert.equal(strings.length, 2);
  assert.ok(strings[0].content.includes("gpt-4-32k"));
  assert.equal(strings[1].content, "o1-mini");
});

test("an unterminated quote does not swallow the rest of the file", () => {
  const { strings } = lex(`a = "oops\nb = "gpt-4o"`, TS);
  assert.equal(strings.at(-1).content, "gpt-4o");
});

test("depthMap and positionAt agree on structure and 1-based positions", () => {
  const src = `call({\n  a: [1, 2],\n})`;
  const { masked } = lex(src, TS);
  const depth = depthMap(masked);
  assert.equal(depth[0], 0);
  assert.equal(depth[src.indexOf("a:")], 2); // inside call( and {
  assert.equal(depth[src.indexOf("1")], 3); // plus the array
  const starts = lineStarts(src);
  assert.deepEqual(positionAt(starts, 0), { line: 1, col: 1 });
  assert.deepEqual(positionAt(starts, src.indexOf("a:")), { line: 2, col: 3 });
  assert.equal(PLAIN_TEXT_EXTS.has(".md"), true);
});
