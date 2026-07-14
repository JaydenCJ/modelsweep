// Shared test helpers: run the built CLI, create throwaway trees, and call
// checkContent with the fixed reference date every lifecycle test uses.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkContent } from "../dist/check.js";

export const ROOT = resolve(import.meta.dirname, "..");
export const CLI = join(ROOT, "dist", "cli.js");

/** The reference date used by deterministic lifecycle assertions. */
export const AT = "2026-07-12";

/** Run the compiled CLI from the repository root. */
export function runCli(...args) {
  const result = spawnSync("node", [CLI, ...args], { encoding: "utf8", cwd: ROOT });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Fresh temp directory per call. */
export function tempDir() {
  return mkdtempSync(join(tmpdir(), "modelsweep-test-"));
}

/** Write a { relativePath: content } tree under dir and return dir. */
export function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

/** checkContent with deterministic defaults (AT, 90-day horizon, no allows). */
export function check(file, content, overrides = {}) {
  return checkContent(file, content, {
    at: AT,
    withinDays: 90,
    allow: new Set(),
    ...overrides,
  });
}

/** Convenience: the finding codes of a FileReport, in report order. */
export function codes(report) {
  return report.findings.map((f) => f.code);
}
