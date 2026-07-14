#!/usr/bin/env bash
# Smoke test for modelsweep: exercises the real CLI end to end against the
# bundled example project and freshly written temp trees. No network,
# idempotent, runs from a clean checkout (after `npm install`).
# Prints "SMOKE OK" on success.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

AT="2026-07-12" # fixed reference date: keeps every assertion reproducible

# 1. Build (idempotent).
npm run build >/dev/null 2>&1 || fail "npm run build failed"
CLI="node $ROOT/dist/cli.js"
echo "[smoke] build ok"

# 2. --version matches package.json; --help documents the surface.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
CLI_VERSION="$($CLI --version)"
[ "$CLI_VERSION" = "$PKG_VERSION" ] || fail "--version mismatch: $CLI_VERSION != $PKG_VERSION"
HELP="$($CLI --help)"
for word in scan models explain --at --within --strict --allow --format; do
  echo "$HELP" | grep -q -- "$word" || fail "--help missing $word"
done
echo "[smoke] --help/--version ok ($CLI_VERSION)"

# 3. Error handling: usage and unreadable paths exit 2 (distinct from scan's 1).
set +e
$CLI sweep >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown command should exit 2"; }
$CLI scan --at not-a-date >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "bad --at should exit 2"; }
$CLI scan "$WORKDIR/nope" >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "missing path should exit 2"; }
$CLI explain gpt-9000 >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown explain id should exit 2"; }
set -e
echo "[smoke] error handling ok (exit 2)"

# 4. The bundled legacy app fails with the seeded findings and fixes.
set +e
SCAN_OUT="$($CLI scan examples/legacy-app --at "$AT")"; SCAN_CODE=$?
set -e
[ "$SCAN_CODE" -eq 1 ] || fail "legacy app should exit 1, got $SCAN_CODE"
echo "$SCAN_OUT" | grep -q 'FAIL (10 error(s), 4 warning(s))' || fail "legacy app counts wrong"
echo "$SCAN_OUT" | grep -q 'scanned 3 file(s), 6 model reference(s)' || fail "legacy app reference count wrong"
for needle in E101 E102 E103 E104 E105 W202 W204 W205; do
  echo "$SCAN_OUT" | grep -q "$needle" || fail "report missing $needle"
done
echo "$SCAN_OUT" | grep -q 'fix: migrate to gpt-4o' || fail "missing migration fix"
echo "$SCAN_OUT" | grep -q 'fix: pin claude-3-5-sonnet-20241022 explicitly' || fail "missing alias pin fix"
echo "$SCAN_OUT" | grep -q '24 day(s) after 2026-07-12' || fail "missing horizon day math"
echo "[smoke] legacy app scan ok (10 errors, 4 warnings, fixes suggested)"

# 5. Dated tables: the identical reference is clean when evaluated in early
#    2024 — lifecycle verdicts come from the date, not a hardcoded status.
printf 'const M = "gpt-4-32k";\n' > "$WORKDIR/pinned.ts"
$CLI scan "$WORKDIR/pinned.ts" --at 2024-01-01 -q >/dev/null \
  || fail "time-traveled reference should exit 0"
set +e
$CLI scan "$WORKDIR/pinned.ts" --at "$AT" -q >/dev/null; NOW_CODE=$?
set -e
[ "$NOW_CODE" -eq 1 ] || fail "same reference today should exit 1"
echo "[smoke] time travel ok (--at 2024-01-01 clean, --at $AT fails)"

# 6. JSON output is valid and machine-checkable.
set +e
JSON_OUT="$($CLI scan examples/legacy-app --at "$AT" --format json)"; JSON_CODE=$?
set -e
[ "$JSON_CODE" -eq 1 ] || fail "json scan should exit 1"
echo "$JSON_OUT" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const j = JSON.parse(s);
  if (j.tool !== "modelsweep" || j.errors !== 10 || j.warnings !== 4 || j.findings.length !== 14) {
    console.error("unexpected json payload");
    process.exit(1);
  }
});' || fail "--format json payload wrong"
echo "[smoke] json output ok"

# 7. --strict and --allow flip exit codes as documented.
mkdir -p "$WORKDIR/repo"
printf 'const M = "chatgpt-4o-latest";\n' > "$WORKDIR/repo/alias.ts"
$CLI scan "$WORKDIR/repo" --at "$AT" >/dev/null || fail "warnings-only scan should exit 0"
set +e
$CLI scan "$WORKDIR/repo" --at "$AT" --strict >/dev/null; STRICT_CODE=$?
set -e
[ "$STRICT_CODE" -eq 1 ] || fail "--strict should exit 1 on warnings, got $STRICT_CODE"
printf 'const M = "gpt-4-32k";\n' > "$WORKDIR/repo/legacy.ts"
$CLI scan "$WORKDIR/repo" --at "$AT" --allow gpt-4-32k --allow chatgpt-4o-latest >/dev/null \
  || fail "--allow should suppress both ids"
echo "[smoke] --strict/--allow ok"

# 8. Parameter linting catches an invalid combo written seconds ago.
cat > "$WORKDIR/repo/fresh.py" <<'EOF'
resp = client.messages.create(
    model="claude-sonnet-5",
    temperature=0.7,
    max_tokens=1024,
)
EOF
set +e
PARAM_OUT="$($CLI scan "$WORKDIR/repo/fresh.py" --at "$AT")"; PARAM_CODE=$?
set -e
[ "$PARAM_CODE" -eq 1 ] || fail "unsupported param should exit 1"
echo "$PARAM_OUT" | grep -q 'error E103: "temperature" is not supported by claude-sonnet-5' \
  || fail "missing E103 for adaptive family"
echo "[smoke] parameter linting ok (E103)"

# 9. models and explain surface the vendored dataset.
MODELS_OUT="$($CLI models --provider openai --status retired --at "$AT")"
echo "$MODELS_OUT" | grep -q '^gpt-4-32k ' || fail "models table missing gpt-4-32k"
echo "$MODELS_OUT" | grep -q 'dataset snapshot' || fail "models table missing snapshot line"
EXPLAIN_OUT="$($CLI explain o1-mini --at "$AT")"
echo "$EXPLAIN_OUT" | grep -q 'shutdown:     2025-10-27' || fail "explain missing shutdown date"
echo "$EXPLAIN_OUT" | grep -q 'replacement:  o4-mini' || fail "explain missing replacement"
echo "[smoke] models/explain ok"

# 10. Determinism: two runs over the same tree are byte-identical.
$CLI scan examples/legacy-app --at "$AT" > "$WORKDIR/run1.txt" 2>/dev/null || true
$CLI scan examples/legacy-app --at "$AT" > "$WORKDIR/run2.txt" 2>/dev/null || true
cmp -s "$WORKDIR/run1.txt" "$WORKDIR/run2.txt" || fail "repeat runs differ"
echo "[smoke] determinism ok"

echo "SMOKE OK"
