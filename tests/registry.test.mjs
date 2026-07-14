// Dataset invariants. The vendored table is the product; these tests keep a
// bad row (typo'd date, dangling replacement, retired successor) from ever
// shipping in a release.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DATA_SNAPSHOT,
  MODELS,
  findModel,
  resolveAlias,
  statusAt,
  suggestModel,
  validateDataset,
} from "../dist/registry.js";
import { looksLikeKnownProviderId, KNOWN_IDS, editDistance } from "../dist/registry.js";
import { isValidIsoDate } from "../dist/dates.js";

test("every model id is unique", () => {
  const seen = new Set();
  for (const entry of MODELS) {
    assert.ok(!seen.has(entry.id), `duplicate id ${entry.id}`);
    seen.add(entry.id);
  }
});

test("validateDataset passes: valid dates, ordered lifecycles, resolvable links", () => {
  assert.deepEqual(validateDataset(), []);
  assert.equal(isValidIsoDate(DATA_SNAPSHOT), true);
});

test("every replacement is itself active at the snapshot date", () => {
  // Recommending a migration target that is also dying would be a trap.
  for (const entry of MODELS) {
    if (!entry.replacement) continue;
    const target = findModel(entry.replacement);
    assert.ok(target, `${entry.id}: replacement missing`);
    assert.equal(
      statusAt(target, DATA_SNAPSHOT),
      "active",
      `${entry.id}: replacement ${entry.replacement} is not active at ${DATA_SNAPSHOT}`
    );
  }
});

test("aliases resolve in one hop and never chain", () => {
  for (const entry of MODELS) {
    if (!entry.resolvesTo) continue;
    const target = resolveAlias(entry);
    assert.notEqual(target.id, entry.id, `${entry.id}: alias resolves to itself`);
    assert.equal(target.resolvesTo, undefined, `${entry.id}: alias chains through ${target.id}`);
  }
});

test("statusAt derives the lifecycle from dates at the reference date", () => {
  const entry = findModel("gpt-4-32k"); // deprecated 2024-06-06, shutdown 2025-06-06
  assert.equal(statusAt(entry, "2024-01-01"), "active");
  assert.equal(statusAt(entry, "2024-06-06"), "deprecated"); // inclusive boundary
  assert.equal(statusAt(entry, "2025-06-05"), "deprecated");
  assert.equal(statusAt(entry, "2025-06-06"), "retired"); // shutdown day counts
  assert.equal(statusAt(entry, "2026-07-12"), "retired");
});

test("every provider ships at least one active model and one dated deprecation", () => {
  const providers = new Set(MODELS.map((m) => m.provider));
  for (const provider of providers) {
    const rows = MODELS.filter((m) => m.provider === provider);
    assert.ok(
      rows.some((m) => !m.resolvesTo && statusAt(m, DATA_SNAPSHOT) === "active"),
      `${provider}: no active model`
    );
    assert.ok(
      rows.some((m) => m.deprecated || m.shutdown),
      `${provider}: no dated deprecation entries`
    );
  }
});

test("looksLikeKnownProviderId accepts id shapes and rejects prose", () => {
  for (const good of ["gpt-9-huge", "claude-omega-1", "gemini-3.0-pro", "o1-2024-12-17", "command-x"]) {
    assert.equal(looksLikeKnownProviderId(good), true, good);
  }
  for (const bad of ["default", "the gpt- model", "gpt-", "/tmp/model", "x", "claude model v2"]) {
    assert.equal(looksLikeKnownProviderId(bad), false, bad);
  }
});

test("suggestModel finds near-miss typos and stays silent when far", () => {
  assert.equal(suggestModel("gpt-4o-mimi"), "gpt-4o-mini");
  assert.equal(suggestModel("claude-sonet-5"), "claude-sonnet-5");
  assert.equal(suggestModel("totally-novel-model-name-9000"), undefined);
});

test("KNOWN_IDS covers the table and is ordered longest-first", () => {
  assert.equal(KNOWN_IDS.length, MODELS.length);
  for (let i = 1; i < KNOWN_IDS.length; i++) {
    assert.ok(KNOWN_IDS[i - 1].length >= KNOWN_IDS[i].length);
  }
  assert.equal(editDistance("gpt-4o", "gpt-4o"), 0);
  assert.equal(editDistance("gpt-4o", "gpt-4"), 1);
});
