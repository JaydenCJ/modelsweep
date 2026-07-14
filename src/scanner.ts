/**
 * Filesystem walking. The only module besides the CLI that touches disk —
 * everything downstream operates on (path, content) pairs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Directories never descended into. */
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "venv",
  "coverage",
  "__pycache__",
]);

/** Lockfiles and machine-generated manifests are skipped by name. */
const IGNORED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "composer.lock",
  "Gemfile.lock",
]);

/** Extensions that are always binary; skipped without reading. */
const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
  ".tar", ".bz2", ".xz", ".7z", ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".jar", ".class", ".so", ".dylib", ".dll", ".exe", ".bin", ".wasm",
  ".mp3", ".mp4", ".mov", ".avi", ".sqlite", ".db",
]);

/** Files larger than this are skipped (generated bundles, data dumps). */
export const MAX_FILE_BYTES = 1_000_000;

export interface ScannedFile {
  path: string;
  content: string;
}

export class ScanError extends Error {}

function extLower(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

function shouldSkipFile(path: string, size: number): boolean {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (IGNORED_FILES.has(base)) return true;
  if (BINARY_EXTS.has(extLower(base))) return true;
  if (size > MAX_FILE_BYTES) return true;
  return false;
}

function walkDir(dir: string, into: ScannedFile[]): void {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walkDir(path, into);
      continue;
    }
    if (!entry.isFile()) continue;
    const size = statSync(path).size;
    if (shouldSkipFile(path, size)) continue;
    const content = readFileSync(path, "utf8");
    if (content.includes("\u0000")) continue; // binary despite the extension
    into.push({ path, content });
  }
}

/**
 * Collect scannable files under each path. Explicit file arguments bypass
 * the skip rules (naming a file means scan it) with two exceptions: NUL
 * bytes still mark it binary, and an over-limit file raises a ScanError
 * instead of being silently skipped.
 */
export function collectFiles(paths: readonly string[]): ScannedFile[] {
  const out: ScannedFile[] = [];
  for (const path of paths) {
    let stats;
    try {
      stats = statSync(path);
    } catch {
      throw new ScanError(`${path}: cannot read path`);
    }
    if (stats.isDirectory()) {
      walkDir(path, out);
      continue;
    }
    if (stats.size > MAX_FILE_BYTES) {
      throw new ScanError(`${path}: file exceeds the ${MAX_FILE_BYTES} byte scan limit`);
    }
    const content = readFileSync(path, "utf8");
    if (!content.includes("\u0000")) out.push({ path, content });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
