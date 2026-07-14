/**
 * A small, language-profile-driven lexer. It does exactly what the extractor
 * needs and nothing more: find string literals (model ids live in strings),
 * blank out comments (model ids in comments are not live code), and keep
 * every byte position stable so findings point at the real line/column.
 */

export interface LangProfile {
  /** Line comment openers, e.g. `//` or `#`. */
  lineComments: readonly string[];
  /** Block comment pairs, e.g. `/* ... *​/`. */
  blockComments: readonly (readonly [string, string])[];
  /** Whether Python-style triple-quoted strings exist. */
  tripleQuotes: boolean;
}

const C_LIKE: LangProfile = { lineComments: ["//"], blockComments: [["/*", "*/"]], tripleQuotes: false };
const HASH: LangProfile = { lineComments: ["#"], blockComments: [], tripleQuotes: false };
const PYTHON: LangProfile = { lineComments: ["#"], blockComments: [], tripleQuotes: true };
const JSON_PROFILE: LangProfile = { lineComments: [], blockComments: [], tripleQuotes: false };
const MIXED: LangProfile = { lineComments: ["//", "#"], blockComments: [["/*", "*/"]], tripleQuotes: false };

const PROFILE_BY_EXT: Record<string, LangProfile> = {
  ".js": C_LIKE, ".jsx": C_LIKE, ".mjs": C_LIKE, ".cjs": C_LIKE,
  ".ts": C_LIKE, ".tsx": C_LIKE, ".mts": C_LIKE, ".cts": C_LIKE,
  ".java": C_LIKE, ".kt": C_LIKE, ".kts": C_LIKE, ".scala": C_LIKE,
  ".go": C_LIKE, ".c": C_LIKE, ".h": C_LIKE, ".cpp": C_LIKE, ".cc": C_LIKE,
  ".hpp": C_LIKE, ".cs": C_LIKE, ".swift": C_LIKE, ".rs": C_LIKE,
  ".php": C_LIKE, ".dart": C_LIKE,
  ".py": PYTHON, ".pyi": PYTHON,
  ".rb": HASH, ".sh": HASH, ".bash": HASH, ".zsh": HASH,
  ".yaml": HASH, ".yml": HASH, ".toml": HASH, ".ini": HASH,
  ".r": HASH, ".pl": HASH, ".tf": HASH, ".env": HASH,
  ".json": JSON_PROFILE, ".jsonl": JSON_PROFILE,
};

/** Extensions treated as prose: known-id search only, no code lexing. */
export const PLAIN_TEXT_EXTS = new Set([".md", ".markdown", ".txt", ".rst", ".adoc"]);

/** Pick the lexing profile for a file extension (dot included). */
export function profileForExt(ext: string): LangProfile {
  return PROFILE_BY_EXT[ext.toLowerCase()] ?? MIXED;
}

/** A string literal found in source, with delimiters excluded. */
export interface StringSpan {
  /** Offset of the opening quote. */
  start: number;
  /** Offset just past the closing quote (or EOF for unterminated strings). */
  end: number;
  /** Offset of the first content character. */
  contentStart: number;
  /** Literal content (escape sequences left as written). */
  content: string;
}

export interface LexResult {
  /** All string literals in source order. */
  strings: StringSpan[];
  /**
   * The source with comments and string contents replaced by spaces —
   * same length as the input, so offsets carry over. Quote delimiters and
   * all structural characters survive.
   */
  masked: string;
}

const QUOTES = new Set(['"', "'", "`"]);

/** Lex `source` according to `profile`. Single pass, O(n). */
export function lex(source: string, profile: LangProfile): LexResult {
  const strings: StringSpan[] = [];
  const out = source.split("");
  const n = source.length;
  let i = 0;

  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < n) {
    const ch = source[i] as string;

    // Triple-quoted strings must be checked before single quotes.
    if (profile.tripleQuotes && (ch === '"' || ch === "'") && source.startsWith(ch.repeat(3), i)) {
      const delim = ch.repeat(3);
      const close = source.indexOf(delim, i + 3);
      const end = close === -1 ? n : close + 3;
      const contentEnd = close === -1 ? n : close;
      strings.push({ start: i, end, contentStart: i + 3, content: source.slice(i + 3, contentEnd) });
      blank(i + 3, contentEnd);
      i = end;
      continue;
    }

    if (QUOTES.has(ch)) {
      let j = i + 1;
      while (j < n) {
        const cj = source[j] as string;
        if (cj === "\\") {
          j += 2;
          continue;
        }
        if (cj === ch) break;
        // A plain single/double-quoted string does not span lines; bail so a
        // stray apostrophe cannot swallow the rest of the file.
        if (cj === "\n" && ch !== "`") break;
        j++;
      }
      const closed = j < n && source[j] === ch;
      const contentEnd = Math.min(j, n);
      const end = closed ? j + 1 : contentEnd;
      strings.push({ start: i, end, contentStart: i + 1, content: source.slice(i + 1, contentEnd) });
      blank(i + 1, contentEnd);
      i = end === i ? i + 1 : end;
      continue;
    }

    const lineComment = profile.lineComments.find((c) => source.startsWith(c, i));
    if (lineComment) {
      let j = source.indexOf("\n", i);
      if (j === -1) j = n;
      blank(i, j);
      i = j;
      continue;
    }

    const block = profile.blockComments.find(([open]) => source.startsWith(open, i));
    if (block) {
      const close = source.indexOf(block[1], i + block[0].length);
      const j = close === -1 ? n : close + block[1].length;
      blank(i, j);
      i = j;
      continue;
    }

    i++;
  }

  return { strings, masked: out.join("") };
}

/**
 * Bracket depth before each offset of `masked` (strings/comments already
 * blanked, so every bracket seen here is structural).
 */
export function depthMap(masked: string): Int32Array {
  const depth = new Int32Array(masked.length + 1);
  let d = 0;
  for (let i = 0; i < masked.length; i++) {
    depth[i] = d;
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") d++;
    else if (ch === ")" || ch === "]" || ch === "}") d = Math.max(0, d - 1);
  }
  depth[masked.length] = d;
  return depth;
}

/** Offset of each line start, for O(log n) line/col lookups. */
export function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Convert a byte offset into a 1-based { line, col }. */
export function positionAt(starts: readonly number[], offset: number): { line: number; col: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - (starts[lo] as number) + 1 };
}
