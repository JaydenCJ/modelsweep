/**
 * Lifecycle evaluation. Given a model reference and a reference date, decide
 * whether the model is retired (E101), inside the shutdown horizon (E102),
 * deprecated (W201), a floating alias (W202), or unknown (W206) — then fold
 * in the family parameter rules from rules.ts.
 */
import { daysBetween, dayCount } from "./dates.js";
import { extOf, extractReferences } from "./extract.js";
import { findModel, resolveAlias, suggestModel } from "./registry.js";
import { evaluateParams } from "./rules.js";
import type { CheckOptions, FileReport, Finding, ModelEntry, ModelReference } from "./types.js";

function lifecycleFindings(
  entry: ModelEntry,
  reference: ModelReference,
  options: CheckOptions
): Omit<Finding, "file">[] {
  const findings: Omit<Finding, "file">[] = [];
  const base = { line: reference.line, col: reference.col, model: reference.model };
  const target = resolveAlias(entry);
  const via = entry.resolvesTo ? `${entry.id} resolves to ${target.id}, which ` : `${entry.id} `;

  if (entry.resolvesTo) {
    findings.push({
      ...base,
      code: "W202",
      severity: "warning",
      message: `floating alias: ${entry.id} points at a different snapshot over time (currently ${target.id})`,
      fix: target.id === entry.id ? "pin a dated snapshot" : `pin ${target.id} explicitly`,
    });
  }

  const migrate = target.replacement ? `migrate to ${target.replacement}` : undefined;

  if (target.shutdown) {
    const days = daysBetween(options.at, target.shutdown);
    if (days <= 0) {
      findings.push({
        ...base,
        code: "E101",
        severity: "error",
        message: `retired model: ${via}was shut down on ${target.shutdown} (${dayCount(-days)} before ${options.at})`,
        fix: migrate,
      });
      return findings;
    }
    if (days <= options.withinDays) {
      findings.push({
        ...base,
        code: "E102",
        severity: "error",
        message: `shutdown imminent: ${via}is scheduled for shutdown on ${target.shutdown} — ${dayCount(days)} after ${options.at}`,
        fix: migrate,
      });
      return findings;
    }
  }

  if (target.deprecated && daysBetween(target.deprecated, options.at) >= 0) {
    const tail = target.shutdown
      ? `shutdown scheduled for ${target.shutdown}`
      : "no shutdown announced yet";
    findings.push({
      ...base,
      code: "W201",
      severity: "warning",
      message: `deprecated model: ${via}was deprecated on ${target.deprecated}; ${tail}`,
      fix: migrate,
    });
  }

  return findings;
}

function unknownModelFinding(reference: ModelReference): Omit<Finding, "file"> {
  const suggestion = suggestModel(reference.model);
  return {
    line: reference.line,
    col: reference.col,
    model: reference.model,
    code: "W206",
    severity: "warning",
    message: `unknown model id "${reference.model}" — not in the vendored dataset`,
    fix: suggestion ? `did you mean ${suggestion}?` : undefined,
  };
}

/** Check one file's content and return its references and findings. */
export function checkContent(
  file: string,
  content: string,
  options: CheckOptions
): FileReport {
  const references = extractReferences(content, extOf(file));
  const findings: Finding[] = [];

  for (const reference of references) {
    if (options.allow.has(reference.model)) continue;
    const entry = findModel(reference.model);
    if (!entry) {
      // Only key-value detections can be unknown ids; the string channel
      // matches known ids exclusively.
      findings.push({ file, ...unknownModelFinding(reference) });
      continue;
    }
    for (const finding of lifecycleFindings(entry, reference, options)) {
      findings.push({ file, ...finding });
    }
    for (const finding of evaluateParams(entry, reference.params, reference)) {
      findings.push({ file, model: reference.model, ...finding });
    }
  }

  findings.sort((a, b) => a.line - b.line || a.col - b.col || a.code.localeCompare(b.code));
  return { file, references, findings };
}
