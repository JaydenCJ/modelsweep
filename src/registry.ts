/**
 * The vendored deprecation dataset. Every row carries the vendor-announced
 * dates as of DATA_SNAPSHOT so that lifecycle checks are evaluated against a
 * reference date instead of a hardcoded status — `--at 2024-06-01` reproduces
 * what a scan would have said back then, and a model that retires next month
 * flips from warning to error without a modelsweep release.
 *
 * Provenance and the update policy live in docs/dataset.md. Entries with no
 * `deprecated`/`shutdown` dates are active as of the snapshot.
 */
import type { Family, ModelEntry, ModelStatus, Provider } from "./types.js";
import { daysBetween, parseIsoDate } from "./dates.js";

/** The date this table was last reconciled against vendor announcements. */
export const DATA_SNAPSHOT = "2026-06-30";

export const MODELS: readonly ModelEntry[] = [
  // ---------------------------------------------------------------- openai
  // Legacy completions endpoint (retired 2024-01-04).
  { id: "text-davinci-003", provider: "openai", family: "openai-completions", deprecated: "2023-07-06", shutdown: "2024-01-04", replacement: "gpt-3.5-turbo-instruct" },
  { id: "text-davinci-002", provider: "openai", family: "openai-completions", deprecated: "2023-07-06", shutdown: "2024-01-04", replacement: "gpt-3.5-turbo-instruct" },
  { id: "text-curie-001", provider: "openai", family: "openai-completions", deprecated: "2023-07-06", shutdown: "2024-01-04", replacement: "gpt-3.5-turbo-instruct" },
  { id: "text-ada-001", provider: "openai", family: "openai-completions", deprecated: "2023-07-06", shutdown: "2024-01-04", replacement: "gpt-3.5-turbo-instruct" },
  // Chat snapshots.
  { id: "gpt-3.5-turbo-0301", provider: "openai", family: "openai-chat", deprecated: "2023-06-13", shutdown: "2024-09-13", replacement: "gpt-4o-mini" },
  { id: "gpt-3.5-turbo-0613", provider: "openai", family: "openai-chat", deprecated: "2023-11-06", shutdown: "2024-09-13", replacement: "gpt-4o-mini" },
  { id: "gpt-3.5-turbo-16k-0613", provider: "openai", family: "openai-chat", deprecated: "2023-11-06", shutdown: "2024-09-13", replacement: "gpt-4o-mini" },
  { id: "gpt-4-0314", provider: "openai", family: "openai-chat", deprecated: "2023-06-13", shutdown: "2024-06-13", replacement: "gpt-4o" },
  { id: "gpt-4-32k", provider: "openai", family: "openai-chat", deprecated: "2024-06-06", shutdown: "2025-06-06", replacement: "gpt-4o" },
  { id: "gpt-4-32k-0314", provider: "openai", family: "openai-chat", deprecated: "2024-06-06", shutdown: "2025-06-06", replacement: "gpt-4o" },
  { id: "gpt-4-32k-0613", provider: "openai", family: "openai-chat", deprecated: "2024-06-06", shutdown: "2025-06-06", replacement: "gpt-4o" },
  { id: "gpt-4-vision-preview", provider: "openai", family: "openai-chat", deprecated: "2024-06-06", shutdown: "2024-12-06", replacement: "gpt-4o" },
  { id: "gpt-4-1106-preview", provider: "openai", family: "openai-chat", deprecated: "2024-12-17", replacement: "gpt-4.1", note: "deprecated; no shutdown announced as of the snapshot" },
  { id: "gpt-4-0125-preview", provider: "openai", family: "openai-chat", deprecated: "2024-12-17", replacement: "gpt-4.1", note: "deprecated; no shutdown announced as of the snapshot" },
  { id: "gpt-4.5-preview", provider: "openai", family: "openai-chat", deprecated: "2025-04-14", shutdown: "2025-07-14", replacement: "gpt-4.1" },
  { id: "o1-preview", provider: "openai", family: "openai-reasoning", deprecated: "2025-04-28", shutdown: "2025-07-28", replacement: "o3" },
  { id: "o1-mini", provider: "openai", family: "openai-reasoning", deprecated: "2025-04-28", shutdown: "2025-10-27", replacement: "o4-mini" },
  // Floating aliases.
  { id: "chatgpt-4o-latest", provider: "openai", family: "openai-chat", resolvesTo: "gpt-4o", note: "tracks the ChatGPT deployment; retunes without notice" },
  { id: "gpt-4-turbo-preview", provider: "openai", family: "openai-chat", resolvesTo: "gpt-4-0125-preview" },
  // Active as of the snapshot.
  { id: "gpt-4", provider: "openai", family: "openai-chat" },
  { id: "gpt-4-turbo", provider: "openai", family: "openai-chat" },
  { id: "gpt-4o", provider: "openai", family: "openai-chat" },
  { id: "gpt-4o-mini", provider: "openai", family: "openai-chat" },
  { id: "gpt-4.1", provider: "openai", family: "openai-chat" },
  { id: "gpt-4.1-mini", provider: "openai", family: "openai-chat" },
  { id: "gpt-4.1-nano", provider: "openai", family: "openai-chat" },
  { id: "gpt-3.5-turbo", provider: "openai", family: "openai-chat" },
  { id: "gpt-3.5-turbo-instruct", provider: "openai", family: "openai-completions" },
  { id: "o1", provider: "openai", family: "openai-reasoning" },
  { id: "o3", provider: "openai", family: "openai-reasoning" },
  { id: "o3-mini", provider: "openai", family: "openai-reasoning" },
  { id: "o4-mini", provider: "openai", family: "openai-reasoning" },
  { id: "gpt-5", provider: "openai", family: "openai-reasoning" },
  { id: "gpt-5-mini", provider: "openai", family: "openai-reasoning" },
  { id: "gpt-5-nano", provider: "openai", family: "openai-reasoning" },

  // ------------------------------------------------------------- anthropic
  // Retired generations.
  { id: "claude-2.0", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-01-21", shutdown: "2025-07-21", replacement: "claude-sonnet-5" },
  { id: "claude-2.1", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-01-21", shutdown: "2025-07-21", replacement: "claude-sonnet-5" },
  { id: "claude-3-sonnet-20240229", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-01-21", shutdown: "2025-07-21", replacement: "claude-sonnet-5" },
  { id: "claude-3-5-sonnet-20240620", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-04-28", shutdown: "2025-10-28", replacement: "claude-sonnet-5" },
  { id: "claude-3-5-sonnet-20241022", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-04-28", shutdown: "2025-10-28", replacement: "claude-sonnet-5" },
  { id: "claude-3-opus-20240229", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-07-03", shutdown: "2026-01-05", replacement: "claude-opus-4-8" },
  { id: "claude-3-7-sonnet-20250219", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-08-19", shutdown: "2026-02-19", replacement: "claude-sonnet-5" },
  { id: "claude-3-5-haiku-20241022", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-08-19", shutdown: "2026-02-19", replacement: "claude-haiku-4-5" },
  { id: "claude-3-haiku-20240307", provider: "anthropic", family: "anthropic-legacy", deprecated: "2025-10-19", shutdown: "2026-04-19", replacement: "claude-haiku-4-5" },
  // Deprecated with scheduled shutdowns.
  { id: "claude-opus-4-20250514", provider: "anthropic", family: "anthropic-4", deprecated: "2025-12-15", shutdown: "2026-06-15", replacement: "claude-opus-4-8" },
  { id: "claude-sonnet-4-20250514", provider: "anthropic", family: "anthropic-4", deprecated: "2025-12-15", shutdown: "2026-06-15", replacement: "claude-sonnet-5" },
  { id: "claude-opus-4-1-20250805", provider: "anthropic", family: "anthropic-4", deprecated: "2026-02-05", shutdown: "2026-08-05", replacement: "claude-opus-4-8" },
  // Floating aliases.
  { id: "claude-3-5-sonnet-latest", provider: "anthropic", family: "anthropic-legacy", resolvesTo: "claude-3-5-sonnet-20241022" },
  { id: "claude-opus-4-0", provider: "anthropic", family: "anthropic-4", resolvesTo: "claude-opus-4-20250514" },
  { id: "claude-sonnet-4-0", provider: "anthropic", family: "anthropic-4", resolvesTo: "claude-sonnet-4-20250514" },
  { id: "claude-opus-4-1", provider: "anthropic", family: "anthropic-4", resolvesTo: "claude-opus-4-1-20250805" },
  // Active as of the snapshot.
  { id: "claude-opus-4-5", provider: "anthropic", family: "anthropic-4" },
  { id: "claude-opus-4-6", provider: "anthropic", family: "anthropic-4" },
  { id: "claude-sonnet-4-5", provider: "anthropic", family: "anthropic-4" },
  { id: "claude-sonnet-4-6", provider: "anthropic", family: "anthropic-4" },
  { id: "claude-haiku-4-5", provider: "anthropic", family: "anthropic-4" },
  { id: "claude-opus-4-7", provider: "anthropic", family: "anthropic-adaptive", note: "sampling parameters and budget_tokens removed on this family" },
  { id: "claude-opus-4-8", provider: "anthropic", family: "anthropic-adaptive", note: "sampling parameters and budget_tokens removed on this family" },
  { id: "claude-sonnet-5", provider: "anthropic", family: "anthropic-adaptive", note: "sampling parameters and budget_tokens removed on this family" },
  { id: "claude-fable-5", provider: "anthropic", family: "anthropic-adaptive", note: "sampling parameters and budget_tokens removed on this family" },

  // ---------------------------------------------------------------- google
  { id: "text-bison-001", provider: "google", family: "google", deprecated: "2024-10-09", shutdown: "2025-04-21", replacement: "gemini-2.0-flash" },
  { id: "chat-bison-001", provider: "google", family: "google", deprecated: "2024-10-09", shutdown: "2025-04-21", replacement: "gemini-2.0-flash" },
  { id: "gemini-1.0-pro", provider: "google", family: "google", deprecated: "2024-09-24", shutdown: "2025-04-09", replacement: "gemini-2.0-flash" },
  { id: "gemini-1.5-pro-001", provider: "google", family: "google", deprecated: "2024-09-24", shutdown: "2025-05-24", replacement: "gemini-2.5-pro" },
  { id: "gemini-1.5-flash-001", provider: "google", family: "google", deprecated: "2024-09-24", shutdown: "2025-05-24", replacement: "gemini-2.5-flash" },
  { id: "gemini-1.5-pro", provider: "google", family: "google", deprecated: "2025-04-29", shutdown: "2025-09-24", replacement: "gemini-2.5-pro" },
  { id: "gemini-1.5-flash", provider: "google", family: "google", deprecated: "2025-04-29", shutdown: "2025-09-24", replacement: "gemini-2.5-flash" },
  { id: "gemini-pro", provider: "google", family: "google", resolvesTo: "gemini-1.0-pro" },
  { id: "gemini-2.0-flash", provider: "google", family: "google" },
  { id: "gemini-2.0-flash-lite", provider: "google", family: "google" },
  { id: "gemini-2.5-pro", provider: "google", family: "google" },
  { id: "gemini-2.5-flash", provider: "google", family: "google" },

  // --------------------------------------------------------------- mistral
  { id: "open-mistral-7b", provider: "mistral", family: "mistral", deprecated: "2024-11-25", shutdown: "2025-03-30", replacement: "ministral-8b-latest" },
  { id: "open-mixtral-8x7b", provider: "mistral", family: "mistral", deprecated: "2024-11-25", shutdown: "2025-03-30", replacement: "mistral-small-latest" },
  { id: "open-mixtral-8x22b", provider: "mistral", family: "mistral", deprecated: "2024-11-25", shutdown: "2025-03-30", replacement: "mistral-small-latest" },
  { id: "mistral-medium-2312", provider: "mistral", family: "mistral", deprecated: "2024-11-25", shutdown: "2025-03-30", replacement: "mistral-medium-latest" },
  { id: "mistral-small-2402", provider: "mistral", family: "mistral", deprecated: "2024-11-25", shutdown: "2025-03-30", replacement: "mistral-small-latest" },
  { id: "mistral-large-2402", provider: "mistral", family: "mistral", deprecated: "2024-11-25", shutdown: "2025-03-30", replacement: "mistral-large-latest" },
  { id: "codestral-2405", provider: "mistral", family: "mistral", deprecated: "2024-12-02", shutdown: "2025-03-30", replacement: "codestral-latest" },
  { id: "mistral-large-latest", provider: "mistral", family: "mistral" },
  { id: "mistral-medium-latest", provider: "mistral", family: "mistral" },
  { id: "mistral-small-latest", provider: "mistral", family: "mistral" },
  { id: "ministral-8b-latest", provider: "mistral", family: "mistral" },
  { id: "codestral-latest", provider: "mistral", family: "mistral" },

  // ---------------------------------------------------------------- cohere
  { id: "command", provider: "cohere", family: "cohere", deprecated: "2025-01-31", replacement: "command-a-03-2025", note: "deprecated; no shutdown announced as of the snapshot" },
  { id: "command-light", provider: "cohere", family: "cohere", deprecated: "2025-01-31", replacement: "command-r-08-2024", note: "deprecated; no shutdown announced as of the snapshot" },
  { id: "command-r-03-2024", provider: "cohere", family: "cohere", deprecated: "2025-01-31", replacement: "command-r-08-2024", note: "deprecated; no shutdown announced as of the snapshot" },
  { id: "command-r-plus-04-2024", provider: "cohere", family: "cohere", deprecated: "2025-01-31", replacement: "command-r-plus-08-2024", note: "deprecated; no shutdown announced as of the snapshot" },
  { id: "command-r-08-2024", provider: "cohere", family: "cohere" },
  { id: "command-r-plus-08-2024", provider: "cohere", family: "cohere" },
  { id: "command-a-03-2025", provider: "cohere", family: "cohere" },
];

const BY_ID = new Map<string, ModelEntry>(MODELS.map((m) => [m.id, m]));

/** Look up a model entry by exact id. */
export function findModel(id: string): ModelEntry | undefined {
  return BY_ID.get(id);
}

/** All known model ids, longest first (for boundary-safe substring search). */
export const KNOWN_IDS: readonly string[] = [...BY_ID.keys()].sort(
  (a, b) => b.length - a.length || a.localeCompare(b)
);

/**
 * Id prefixes that mark a string as "meant to be a model id" even when it is
 * not in the table — these drive the unknown-model diagnostic (W206).
 */
const KNOWN_PREFIXES = [
  /^gpt-/i,
  /^chatgpt-/i,
  /^o[134](-|$)/i,
  /^text-davinci-/i,
  /^claude-/i,
  /^gemini-/i,
  /^(text|chat)-bison/i,
  /^(open-)?mi(s|x)tral-/i,
  /^ministral-/i,
  /^codestral-/i,
  /^command(-|$)/i,
];

const ID_SHAPE = /^[a-z0-9][a-z0-9._:@-]{1,62}[a-z0-9]$/i;

/** True when `value` looks like a model id from a covered provider. */
export function looksLikeKnownProviderId(value: string): boolean {
  if (!ID_SHAPE.test(value)) return false;
  return KNOWN_PREFIXES.some((re) => re.test(value));
}

/** Derive the lifecycle status of an entry at a reference date. */
export function statusAt(entry: ModelEntry, at: string): ModelStatus {
  const target = entry.resolvesTo ? BY_ID.get(entry.resolvesTo) ?? entry : entry;
  if (target.shutdown && daysBetween(target.shutdown, at) >= 0) return "retired";
  if (target.deprecated && daysBetween(target.deprecated, at) >= 0) return "deprecated";
  return "active";
}

/** Resolve a floating alias to its target entry (identity for non-aliases). */
export function resolveAlias(entry: ModelEntry): ModelEntry {
  if (!entry.resolvesTo) return entry;
  return BY_ID.get(entry.resolvesTo) ?? entry;
}

/** Every provider present in the dataset, in a stable order. */
export const PROVIDERS: readonly Provider[] = ["openai", "anthropic", "google", "mistral", "cohere"];

/** Every family present in the dataset, in a stable order. */
export const FAMILIES: readonly Family[] = [
  "openai-chat",
  "openai-reasoning",
  "openai-completions",
  "anthropic-legacy",
  "anthropic-4",
  "anthropic-adaptive",
  "google",
  "mistral",
  "cohere",
];

/** Levenshtein distance, used for did-you-mean suggestions on W206. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] as number) + 1,
        (curr[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[cols - 1] as number;
}

/** Nearest known id within edit distance 2, or undefined. */
export function suggestModel(value: string): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const id of BY_ID.keys()) {
    if (Math.abs(id.length - value.length) >= bestDistance) continue;
    const d = editDistance(value.toLowerCase(), id.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = id;
    }
  }
  return best;
}

/** Dataset self-check used by the test suite (all dates valid, links resolve). */
export function validateDataset(): string[] {
  const problems: string[] = [];
  for (const entry of MODELS) {
    for (const field of ["deprecated", "shutdown"] as const) {
      const value = entry[field];
      if (value !== undefined && parseIsoDate(value) === null) {
        problems.push(`${entry.id}: invalid ${field} date "${value}"`);
      }
    }
    if (entry.deprecated && entry.shutdown && daysBetween(entry.deprecated, entry.shutdown) < 0) {
      problems.push(`${entry.id}: deprecated after shutdown`);
    }
    if (entry.resolvesTo && !BY_ID.has(entry.resolvesTo)) {
      problems.push(`${entry.id}: resolvesTo unknown id "${entry.resolvesTo}"`);
    }
    if (entry.replacement && !BY_ID.has(entry.replacement)) {
      problems.push(`${entry.id}: replacement unknown id "${entry.replacement}"`);
    }
  }
  return problems;
}
