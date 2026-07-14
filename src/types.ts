/**
 * Shared types for modelsweep. Everything here is pure data — the modules
 * that produce and consume these values (extract, check, report) stay
 * unit-testable because none of them touch the filesystem.
 */

/** Vendors covered by the vendored deprecation dataset. */
export type Provider = "openai" | "anthropic" | "google" | "mistral" | "cohere";

/**
 * A parameter-rule family. Models in the same family share the same request
 * surface: which parameters exist, their valid ranges, and which
 * combinations conflict.
 */
export type Family =
  | "openai-chat"
  | "openai-reasoning"
  | "openai-completions"
  | "anthropic-legacy"
  | "anthropic-4"
  | "anthropic-adaptive"
  | "google"
  | "mistral"
  | "cohere";

/** One row of the vendored deprecation table. */
export interface ModelEntry {
  /** The exact model id as sent over the wire. */
  id: string;
  provider: Provider;
  family: Family;
  /** ISO date the vendor announced the deprecation, if any. */
  deprecated?: string;
  /** ISO date the model stops serving (or stopped serving), if announced. */
  shutdown?: string;
  /** Recommended successor id, when the vendor names one. */
  replacement?: string;
  /** Set when this id is a floating alias; the id it currently resolves to. */
  resolvesTo?: string;
  /** Short free-form note surfaced by `modelsweep explain`. */
  note?: string;
}

/** Lifecycle status of a model, derived from its dates at a reference date. */
export type ModelStatus = "active" | "deprecated" | "retired";

/** How a model reference was detected in source. */
export type ReferenceSource = "model-key" | "string-literal" | "plain-text";

/** Normalized value of an extracted request parameter. */
export type ParamValue =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "unknown" };

/** One request parameter found next to a model reference. */
export interface ExtractedParam {
  /** Canonical snake_case name (`topP`/`TopP` both normalize to `top_p`). */
  key: string;
  /** The spelling as written in the file. */
  raw: string;
  line: number;
  col: number;
  value: ParamValue;
}

/** One model id found in a scanned file. */
export interface ModelReference {
  model: string;
  line: number;
  col: number;
  source: ReferenceSource;
  /** Request parameters found in the same call/object/block, if any. */
  params: ExtractedParam[];
}

/** Severity of a finding. Errors fail the run; warnings only with --strict. */
export type Severity = "error" | "warning";

/** A single diagnostic produced by the checker. */
export interface Finding {
  file: string;
  line: number;
  col: number;
  model: string;
  code: string;
  severity: Severity;
  message: string;
  fix?: string;
}

/** Findings for one file, grouped for reporting. */
export interface FileReport {
  file: string;
  references: ModelReference[];
  findings: Finding[];
}

/** The full result of a scan run. */
export interface ScanReport {
  /** Reference date the lifecycle checks were evaluated against. */
  at: string;
  /** Snapshot date of the vendored dataset. */
  snapshot: string;
  files: FileReport[];
  scannedFiles: number;
  referenceCount: number;
  errorCount: number;
  warningCount: number;
  ok: boolean;
}

/** Options controlling lifecycle evaluation. */
export interface CheckOptions {
  /** ISO reference date; defaults to today. */
  at: string;
  /** Days-until-shutdown horizon that escalates W201 to E102. */
  withinDays: number;
  /** Model ids whose model-level findings are suppressed. */
  allow: ReadonlySet<string>;
}
