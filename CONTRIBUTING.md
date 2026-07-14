# Contributing to modelsweep

Issues, discussions and pull requests are all welcome — dataset corrections
most of all: the vendored table is only as good as its receipts.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/modelsweep.git
cd modelsweep
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 90 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/legacy-app
```

`scripts/smoke.sh` exercises the real CLI (scan, models, explain, exit
codes, --at time travel, --strict, --allow, JSON output, determinism)
against the bundled example project and must print `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable
   modules (lexing, extraction, lifecycle checks and rules all take values,
   not file handles — only the CLI and scanner touch the filesystem).
5. Dataset changes must cite the vendor announcement in the PR description,
   bump `DATA_SNAPSHOT`, and keep every invariant in
   `tests/registry.test.mjs` green — including "every replacement is itself
   active at the snapshot".
6. New diagnostics need a row in `docs/rules.md`, a stable code that is
   never reused, and at least one test.

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually be
  declined.
- No network calls, ever — the tool reads local files and prints. That is
  the whole I/O surface, and it is why the dataset is vendored.
- Rule codes (`E1xx`/`W2xx`) are stable API: never renumber or repurpose
  an existing code; add new ones instead.
- Lifecycle verdicts must stay date-derived: rows carry vendor dates, never
  a hardcoded status, so `--at` time travel keeps working.
- Suggestions must be safe: when a fix cannot be derived confidently,
  suggest nothing rather than something wrong.
- Code comments and doc comments are written in English.

## Reporting bugs

Please include: `modelsweep --version` output, the exact command line
(including `--at` if you set it), and the smallest file that reproduces the
problem — one call with one model id is usually enough. If a lifecycle
verdict is wrong, add the vendor announcement you believe the table should
reflect; if extraction is wrong, the file's language matters, so keep the
original extension.

## Security

Do not open public issues for security problems; use GitHub private
vulnerability reporting on this repository instead.
