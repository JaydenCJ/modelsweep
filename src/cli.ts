#!/usr/bin/env node
/**
 * The modelsweep CLI. Thin by design: parses arguments, walks the
 * filesystem, delegates to the pure extract/check/report modules, prints,
 * and sets the exit code. Exit codes are stable API: 0 clean, 1 findings,
 * 2 usage/IO error.
 */
import { checkContent } from "./check.js";
import { CliError, HELP_TEXT, parseCliArgs, type ModelsCommand, type ExplainCommand, type ScanCommand } from "./cliargs.js";
import { describeFamilyRules } from "./rules.js";
import { buildReport, renderJson, renderText } from "./report.js";
import { DATA_SNAPSHOT, MODELS, findModel, resolveAlias, statusAt } from "./registry.js";
import { collectFiles, ScanError } from "./scanner.js";
import { VERSION } from "./version.js";
import type { CheckOptions, FileReport } from "./types.js";

function runScan(options: ScanCommand): number {
  const checkOptions: CheckOptions = {
    at: options.at,
    withinDays: options.withinDays,
    allow: options.allow,
  };
  const files = collectFiles(options.paths);
  const reports: FileReport[] = [];
  for (const file of files) {
    const report = checkContent(file.path, file.content, checkOptions);
    if (report.references.length > 0) reports.push(report);
  }
  const report = buildReport(reports, files.length, checkOptions);
  process.stdout.write(
    (options.format === "json" ? renderJson(report) : renderText(report, { quiet: options.quiet })) + "\n"
  );
  if (report.errorCount > 0) return 1;
  if (options.strict && report.warningCount > 0) return 1;
  return 0;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function runModels(options: ModelsCommand): number {
  const rows = MODELS.filter((entry) => {
    if (options.provider && entry.provider !== options.provider) return false;
    if (options.status && statusAt(entry, options.at) !== options.status) return false;
    return true;
  });
  const lines = [
    `${pad("MODEL", 30)} ${pad("PROVIDER", 10)} ${pad("STATUS", 11)} ${pad("DEPRECATED", 11)} ${pad("SHUTDOWN", 11)} REPLACEMENT`,
  ];
  for (const entry of rows) {
    const target = resolveAlias(entry);
    const status = entry.resolvesTo ? `alias` : statusAt(entry, options.at);
    lines.push(
      `${pad(entry.id, 30)} ${pad(entry.provider, 10)} ${pad(status, 11)} ` +
        `${pad(target.deprecated ?? "-", 11)} ${pad(target.shutdown ?? "-", 11)} ${target.replacement ?? "-"}`
    );
  }
  lines.push("");
  lines.push(`${rows.length} model(s), dataset snapshot ${DATA_SNAPSHOT}, statuses derived at ${options.at}`);
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

function runExplain(options: ExplainCommand): number {
  const entry = findModel(options.model);
  if (!entry) {
    process.stderr.write(`modelsweep: unknown model id "${options.model}" — try "modelsweep models"\n`);
    return 2;
  }
  const target = resolveAlias(entry);
  const lines = [entry.id];
  lines.push(`  provider:     ${entry.provider}`);
  lines.push(`  family:       ${entry.family}`);
  if (entry.resolvesTo) lines.push(`  resolves to:  ${entry.resolvesTo} (floating alias)`);
  lines.push(`  status:       ${statusAt(entry, options.at)} (as of ${options.at})`);
  lines.push(`  deprecated:   ${target.deprecated ?? "-"}`);
  lines.push(`  shutdown:     ${target.shutdown ?? "-"}`);
  lines.push(`  replacement:  ${target.replacement ?? "-"}`);
  if (entry.note) lines.push(`  note:         ${entry.note}`);
  lines.push(`  parameter rules (${entry.family}):`);
  for (const rule of describeFamilyRules(entry.family)) {
    lines.push(`    - ${rule}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

export function main(argv: string[]): number {
  let command;
  try {
    command = parseCliArgs(argv);
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`modelsweep: ${error.message}\n`);
      process.stderr.write(`Run "modelsweep --help" for usage.\n`);
      return 2;
    }
    throw error;
  }

  if (command.command === "help") {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (command.command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  try {
    if (command.command === "scan") return runScan(command);
    if (command.command === "models") return runModels(command);
    return runExplain(command);
  } catch (error) {
    if (error instanceof ScanError) {
      process.stderr.write(`modelsweep: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
