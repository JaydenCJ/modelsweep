// Argument parsing: defaults, validation, and the errors that map to exit
// code 2. Pure functions — no processes spawned here.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseCliArgs, CliError, HELP_TEXT } from "../dist/cliargs.js";
import { isValidIsoDate } from "../dist/dates.js";

test("scan defaults: current dir, 90-day horizon, text format, today", () => {
  const cmd = parseCliArgs(["scan"]);
  assert.equal(cmd.command, "scan");
  assert.deepEqual(cmd.paths, ["."]);
  assert.equal(cmd.withinDays, 90);
  assert.equal(cmd.format, "text");
  assert.equal(cmd.strict, false);
  assert.equal(cmd.quiet, false);
  assert.equal(isValidIsoDate(cmd.at), true);
});

test("scan accepts multiple paths and every flag", () => {
  const cmd = parseCliArgs([
    "scan", "src", "config", "--at", "2026-07-12", "--within", "30",
    "--format", "json", "--strict", "-q",
  ]);
  assert.deepEqual(cmd.paths, ["src", "config"]);
  assert.equal(cmd.at, "2026-07-12");
  assert.equal(cmd.withinDays, 30);
  assert.equal(cmd.format, "json");
  assert.equal(cmd.strict, true);
  assert.equal(cmd.quiet, true);
});

test("--allow is repeatable and accumulates into a set", () => {
  const cmd = parseCliArgs(["scan", "--allow", "gpt-4-32k", "--allow", "claude-2.1"]);
  assert.deepEqual([...cmd.allow].sort(), ["claude-2.1", "gpt-4-32k"]);
});

test("bad values are CliErrors: format, within, at", () => {
  assert.throws(() => parseCliArgs(["scan", "--format", "xml"]), CliError);
  assert.throws(() => parseCliArgs(["scan", "--within", "ninety"]), CliError);
  assert.throws(() => parseCliArgs(["scan", "--within", "-1"]), CliError);
  assert.throws(() => parseCliArgs(["scan", "--at", "2026-02-30"]), CliError);
  assert.throws(() => parseCliArgs(["scan", "--at"]), CliError); // missing value
});

test("unknown flags and unknown commands are CliErrors", () => {
  assert.throws(() => parseCliArgs(["scan", "--frobnicate"]), CliError);
  assert.throws(() => parseCliArgs(["sweep"]), CliError);
  assert.throws(() => parseCliArgs(["models", "--status", "vaporware"]), CliError);
  assert.throws(() => parseCliArgs(["models", "--provider", "azure"]), CliError);
});

test("explain requires exactly one model id", () => {
  const cmd = parseCliArgs(["explain", "gpt-4-32k", "--at", "2025-01-01"]);
  assert.equal(cmd.command, "explain");
  assert.equal(cmd.model, "gpt-4-32k");
  assert.equal(cmd.at, "2025-01-01");
  assert.throws(() => parseCliArgs(["explain"]), CliError);
  assert.throws(() => parseCliArgs(["explain", "a", "b"]), CliError);
});

test("help and version shortcuts resolve; HELP_TEXT documents the surface", () => {
  assert.equal(parseCliArgs([]).command, "help");
  assert.equal(parseCliArgs(["--help"]).command, "help");
  assert.equal(parseCliArgs(["-v"]).command, "version");
  for (const needle of ["scan", "models", "explain", "--at", "--within", "--strict", "--allow", "--format"]) {
    assert.ok(HELP_TEXT.includes(needle), `help missing ${needle}`);
  }
});
