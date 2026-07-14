/**
 * Renderers. Text output is grouped by file and deterministic (files and
 * findings are pre-sorted); JSON output is a stable shape intended for CI
 * post-processing. Neither renderer computes anything — a ScanReport is the
 * single source of truth.
 */
import { DATA_SNAPSHOT } from "./registry.js";
import type { CheckOptions, FileReport, Finding, ScanReport } from "./types.js";

/** Assemble a ScanReport from per-file results. */
export function buildReport(files: FileReport[], scannedFiles: number, options: CheckOptions): ScanReport {
  const sorted = [...files].sort((a, b) => a.file.localeCompare(b.file));
  let errorCount = 0;
  let warningCount = 0;
  let referenceCount = 0;
  for (const file of sorted) {
    referenceCount += file.references.length;
    for (const finding of file.findings) {
      if (finding.severity === "error") errorCount++;
      else warningCount++;
    }
  }
  return {
    at: options.at,
    snapshot: DATA_SNAPSHOT,
    files: sorted,
    scannedFiles,
    referenceCount,
    errorCount,
    warningCount,
    ok: errorCount === 0,
  };
}

function findingLines(finding: Finding): string[] {
  const lines = [
    `    ${finding.severity} ${finding.code}: ${finding.message}`,
  ];
  if (finding.fix) lines.push(`        fix: ${finding.fix}`);
  return lines;
}

/** Render the human-readable report. */
export function renderText(report: ScanReport, opts: { quiet?: boolean } = {}): string {
  const lines: string[] = [];
  const verdict = report.ok ? "OK" : "FAIL";
  const summary =
    `scanned ${report.scannedFiles} file(s), ${report.referenceCount} model reference(s): ` +
    `${verdict} (${report.errorCount} error(s), ${report.warningCount} warning(s))`;

  if (!opts.quiet) {
    for (const file of report.files) {
      if (file.findings.length === 0) continue;
      lines.push(`${file.file}: ${file.findings.length} finding(s)`);
      let lastKey = "";
      for (const finding of file.findings) {
        const key = `${finding.line}:${finding.model}`;
        if (key !== lastKey) {
          lines.push("");
          lines.push(`  ${finding.line}:${finding.col}  ${finding.model}`);
          lastKey = key;
        }
        lines.push(...findingLines(finding));
      }
      lines.push("");
    }
  }
  lines.push(`dataset snapshot ${report.snapshot}, evaluated at ${report.at}`);
  lines.push(summary);
  return lines.join("\n");
}

/** Render the machine-readable report. */
export function renderJson(report: ScanReport): string {
  const findings = report.files.flatMap((file) => file.findings);
  return JSON.stringify(
    {
      tool: "modelsweep",
      snapshot: report.snapshot,
      at: report.at,
      scannedFiles: report.scannedFiles,
      references: report.referenceCount,
      errors: report.errorCount,
      warnings: report.warningCount,
      ok: report.ok,
      findings,
    },
    null,
    2
  );
}
