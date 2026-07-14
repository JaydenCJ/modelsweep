/**
 * Model-reference extraction. Two channels:
 *
 *  1. key-value — `model: "…"`, `model="…"`, `"model": "…"`, `Model: "…"`,
 *     or YAML `model: …`. This channel also captures the request parameters
 *     written next to the model id (same call, object literal, or YAML
 *     block), which is what powers the parameter linting. It fires for
 *     unknown ids too, so typo'd model names can be caught.
 *  2. string-literal — any string containing a known model id verbatim
 *     (`const FALLBACK = "gpt-4-32k"`). Known ids only; no parameters.
 *
 * Comments never produce references. Markdown/text files use a third,
 * prose-oriented channel: a boundary-safe search for known ids.
 */
import {
  depthMap,
  lex,
  lineStarts,
  positionAt,
  profileForExt,
  PLAIN_TEXT_EXTS,
  type LexResult,
  type StringSpan,
} from "./lexer.js";
import { KNOWN_IDS, findModel, looksLikeKnownProviderId } from "./registry.js";
import type { ExtractedParam, ModelReference, ParamValue } from "./types.js";

/** Keys whose value is treated as a model id (normalized spelling). */
const MODEL_KEYS = new Set(["model", "modelid", "modelname", "engine"]);

/** Normalized param key -> canonical snake_case name. */
const PARAM_KEYS = new Map<string, string>([
  ["temperature", "temperature"],
  ["topp", "top_p"],
  ["topk", "top_k"],
  ["maxtokens", "max_tokens"],
  ["maxcompletiontokens", "max_completion_tokens"],
  ["maxoutputtokens", "max_output_tokens"],
  ["presencepenalty", "presence_penalty"],
  ["frequencypenalty", "frequency_penalty"],
  ["n", "n"],
  ["logprobs", "logprobs"],
  ["logitbias", "logit_bias"],
  ["budgettokens", "budget_tokens"],
  ["reasoningeffort", "reasoning_effort"],
]);

/** Params accepted below the top level of the call (nested objects). */
const NESTED_PARAM_KEYS = new Set(["budget_tokens"]);

/** Cap on how far the sibling-parameter scan reaches inside huge literals. */
const REGION_WINDOW = 3000;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, "");
}

const ID_CHAR = /[A-Za-z0-9._-]/;

let knownIdPattern: RegExp | null = null;
function knownIdRegex(): RegExp {
  if (!knownIdPattern) {
    const escaped = KNOWN_IDS.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    knownIdPattern = new RegExp(escaped.join("|"), "g");
  }
  return new RegExp(knownIdPattern.source, "g");
}

/** Boundary-safe occurrences of known model ids inside `text`. */
export function findKnownIds(text: string): Array<{ id: string; index: number }> {
  const out: Array<{ id: string; index: number }> = [];
  const re = knownIdRegex();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const before = text[match.index - 1];
    const after = text[match.index + match[0].length];
    if (before !== undefined && ID_CHAR.test(before)) continue;
    if (after !== undefined && ID_CHAR.test(after)) continue;
    out.push({ id: match[0], index: match.index });
  }
  return out;
}

interface KeyCandidate {
  /** Normalized key name. */
  name: string;
  /** Spelling as written. */
  raw: string;
  /** Offset of the key's first character. */
  keyStart: number;
  /** Offset just past the `:` or `=` operator. */
  valueFrom: number;
}

const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * Every `key:` / `key =` / `"key":` site in the masked source. Assignment
 * detection deliberately excludes `==`, `===`, `=>`, `<=`, `>=`, `!=`.
 */
function keyCandidates(lexed: LexResult, from = 0, to = Infinity): KeyCandidate[] {
  const { masked, strings } = lexed;
  const end = Math.min(to, masked.length);
  const out: KeyCandidate[] = [];

  const operatorAfter = (offset: number): number | null => {
    let i = offset;
    while (i < end && (masked[i] === " " || masked[i] === "\t")) i++;
    const ch = masked[i];
    if (ch === ":") {
      // Exclude `::` (C++/Rust paths) so `std::model` never looks like a key.
      if (masked[i + 1] === ":" || masked[i - 1] === ":") return null;
      return i + 1;
    }
    if (ch === "=") {
      const next = masked[i + 1];
      if (next === "=" || next === ">") return null;
      const prev = masked[i - 1];
      if (prev === "!" || prev === "<" || prev === ">" || prev === "+" || prev === "-" || prev === "*" || prev === "/" || prev === "%") return null;
      return i + 1;
    }
    return null;
  };

  const re = new RegExp(IDENT.source, "g");
  re.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = re.exec(masked)) !== null && match.index < end) {
    const valueFrom = operatorAfter(match.index + match[0].length);
    if (valueFrom !== null) {
      out.push({ name: normalizeName(match[0]), raw: match[0], keyStart: match.index, valueFrom });
    }
  }

  for (const span of strings) {
    if (span.start < from || span.start >= end) continue;
    const valueFrom = operatorAfter(span.end);
    if (valueFrom !== null && span.content.length > 0) {
      out.push({ name: normalizeName(span.content), raw: span.content, keyStart: span.start, valueFrom });
    }
  }

  out.sort((a, b) => a.keyStart - b.keyStart);
  return out;
}

function skipWhitespace(masked: string, offset: number): number {
  let i = offset;
  while (i < masked.length && /\s/.test(masked[i] as string)) i++;
  return i;
}

const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const BOOLEAN = /^(?:true|false|True|False)\b/;

function parseValueAt(lexed: LexResult, spansByStart: Map<number, StringSpan>, offset: number): ParamValue {
  const at = skipWhitespace(lexed.masked, offset);
  const span = spansByStart.get(at);
  if (span) return { kind: "string", value: span.content.trim() };
  const rest = lexed.masked.slice(at, at + 64);
  const num = NUMBER.exec(rest);
  if (num) return { kind: "number", value: Number(num[0]) };
  const bool = BOOLEAN.exec(rest);
  if (bool) return { kind: "boolean", value: bool[0].toLowerCase() === "true" };
  return { kind: "unknown" };
}

/** Walk left to the nearest unmatched opening bracket, or -1. */
function enclosingOpener(masked: string, from: number): number {
  let balance = 0;
  for (let i = from - 1; i >= 0; i--) {
    const ch = masked[i];
    if (ch === ")" || ch === "]" || ch === "}") balance++;
    else if (ch === "(" || ch === "[" || ch === "{") {
      if (balance === 0) return i;
      balance--;
    }
  }
  return -1;
}

/** Offset of the closer matching the opener at `openerPos`. */
function matchingCloser(masked: string, openerPos: number): number {
  let depth = 0;
  for (let i = openerPos; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return masked.length;
}

function extractCodeParams(
  lexed: LexResult,
  spansByStart: Map<number, StringSpan>,
  depths: Int32Array,
  starts: readonly number[],
  modelKeyStart: number
): ExtractedParam[] {
  const opener = enclosingOpener(lexed.masked, modelKeyStart);
  if (opener === -1) return [];
  const closer = matchingCloser(lexed.masked, opener);
  let from = opener + 1;
  let to = closer;
  if (to - from > REGION_WINDOW * 2) {
    from = Math.max(from, modelKeyStart - REGION_WINDOW);
    to = Math.min(to, modelKeyStart + REGION_WINDOW);
  }
  const baseDepth = (depths[opener] as number) + 1;
  const params: ExtractedParam[] = [];
  const seen = new Set<string>();
  for (const candidate of keyCandidates(lexed, from, to)) {
    const canonical = PARAM_KEYS.get(candidate.name);
    if (!canonical) continue;
    const depth = depths[candidate.keyStart] as number;
    if (depth !== baseDepth && !(NESTED_PARAM_KEYS.has(canonical) && depth > baseDepth)) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const { line, col } = positionAt(starts, candidate.keyStart);
    params.push({
      key: canonical,
      raw: candidate.raw,
      line,
      col,
      value: parseValueAt(lexed, spansByStart, candidate.valueFrom),
    });
  }
  return params;
}

function extractCode(content: string, ext: string): ModelReference[] {
  const lexed = lex(content, profileForExt(ext));
  const starts = lineStarts(content);
  const depths = depthMap(lexed.masked);
  const spansByStart = new Map<number, StringSpan>(lexed.strings.map((s) => [s.start, s]));
  const references: ModelReference[] = [];
  const consumedSpans = new Set<number>();

  for (const candidate of keyCandidates(lexed)) {
    if (!MODEL_KEYS.has(candidate.name)) continue;
    const valueAt = skipWhitespace(lexed.masked, candidate.valueFrom);
    const span = spansByStart.get(valueAt);
    if (!span) continue;
    const value = span.content.trim();
    if (value.length === 0) continue;
    if (!findModel(value) && !looksLikeKnownProviderId(value)) continue;
    consumedSpans.add(span.start);
    const { line, col } = positionAt(starts, span.contentStart);
    references.push({
      model: value,
      line,
      col,
      source: "model-key",
      params: extractCodeParams(lexed, spansByStart, depths, starts, candidate.keyStart),
    });
  }

  for (const span of lexed.strings) {
    if (consumedSpans.has(span.start)) continue;
    for (const hit of findKnownIds(span.content)) {
      const { line, col } = positionAt(starts, span.contentStart + hit.index);
      references.push({ model: hit.id, line, col, source: "string-literal", params: [] });
    }
  }

  references.sort((a, b) => a.line - b.line || a.col - b.col);
  return references;
}

function extractPlainText(content: string): ModelReference[] {
  const starts = lineStarts(content);
  return findKnownIds(content).map((hit) => {
    const { line, col } = positionAt(starts, hit.index);
    return { model: hit.id, line, col, source: "plain-text" as const, params: [] };
  });
}

// ---------------------------------------------------------------- YAML

interface YamlLine {
  indent: number;
  key: string | null;
  rawKey: string;
  value: string;
  valueCol: number;
  blank: boolean;
}

/** Cut an unquoted `#` comment off a YAML line. */
function stripYamlComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return line.slice(0, i);
    }
  }
  return line;
}

const YAML_KEY = /^(\s*)(- )?([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*(.*)$/;

function parseYamlLine(raw: string): YamlLine {
  const stripped = stripYamlComment(raw);
  if (stripped.trim() === "") {
    return { indent: 0, key: null, rawKey: "", value: "", valueCol: 0, blank: true };
  }
  const match = YAML_KEY.exec(stripped);
  if (!match) {
    const indent = (stripped.match(/^\s*/) as RegExpMatchArray)[0].length;
    return { indent, key: null, rawKey: "", value: "", valueCol: 0, blank: false };
  }
  const indent = (match[1] as string).length + (match[2] ? 2 : 0);
  const value = (match[4] as string).trim();
  const valueCol = value.length > 0 ? stripped.indexOf(value, indent) + 1 : 0;
  return { indent, key: (match[3] as string).toLowerCase(), rawKey: match[3] as string, value, valueCol, blank: false };
}

function unquoteYaml(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first)) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseYamlValue(value: string): ParamValue {
  const bare = unquoteYaml(value);
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(bare)) return { kind: "number", value: Number(bare) };
  if (/^(true|false)$/i.test(bare)) return { kind: "boolean", value: bare.toLowerCase() === "true" };
  if (bare.length === 0) return { kind: "unknown" };
  return { kind: "string", value: bare };
}

function extractYaml(content: string): ModelReference[] {
  const rawLines = content.split("\n");
  const lines = rawLines.map(parseYamlLine);
  const references: ModelReference[] = [];

  const collectSiblings = (index: number, indent: number): ExtractedParam[] => {
    const params: ExtractedParam[] = [];
    const seen = new Set<string>();
    const visit = (i: number): boolean => {
      const line = lines[i] as YamlLine;
      if (line.blank) return true;
      if (line.indent < indent) return false;
      if (line.indent > indent || line.key === null || i === index) return true;
      const canonical = PARAM_KEYS.get(normalizeName(line.key));
      if (canonical && line.value.length > 0 && !seen.has(canonical)) {
        seen.add(canonical);
        params.push({
          key: canonical,
          raw: line.rawKey,
          line: i + 1,
          col: line.indent + 1,
          value: parseYamlValue(line.value),
        });
      }
      return true;
    };
    for (let i = index - 1; i >= 0 && visit(i); i--);
    for (let i = index + 1; i < lines.length && visit(i); i++);
    return params;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as YamlLine;
    if (line.blank || line.key === null || line.value.length === 0) continue;
    if (!MODEL_KEYS.has(normalizeName(line.key))) continue;
    const value = unquoteYaml(line.value);
    if (!findModel(value) && !looksLikeKnownProviderId(value)) continue;
    const quoted = value !== line.value;
    references.push({
      model: value,
      line: i + 1,
      col: line.valueCol + (quoted ? 1 : 0),
      source: "model-key",
      params: collectSiblings(i, line.indent),
    });
  }

  references.sort((a, b) => a.line - b.line || a.col - b.col);
  return references;
}

/** File extension (dot included, lowercased) of a path. */
export function extOf(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/** Extract every model reference from one file's content. */
export function extractReferences(content: string, ext: string): ModelReference[] {
  if (PLAIN_TEXT_EXTS.has(ext)) return extractPlainText(content);
  if (ext === ".yaml" || ext === ".yml") return extractYaml(content);
  return extractCode(content, ext);
}
