# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-12

### Added

- `modelsweep scan`: recursive repository scan for model-id references in
  code (JS/TS, Python, Go, Java, Rust, Ruby, shell, and more via language
  comment/string profiles), JSON, YAML and prose files — two detection
  channels: `model:`-style key assignments (any plausible id, typos
  included) and known ids inside any string literal; comments never match.
- Vendored, dated deprecation table covering OpenAI, Anthropic, Google,
  Mistral and Cohere (snapshot 2026-06-30): 91 rows carrying the
  vendor-announced deprecation and shutdown dates, recommended
  replacements, floating-alias targets, and notes.
- Date-derived lifecycle verdicts instead of hardcoded statuses: retired
  models (E101), shutdowns inside a configurable `--within` horizon (E102,
  default 90 days), deprecations (W201), floating aliases with pin
  suggestions (W202), and unknown ids under covered provider prefixes with
  did-you-mean suggestions (W206). `--at YYYY-MM-DD` time-travels the
  whole evaluation.
- Parameter linting driven by per-family rule sets: rejected parameters
  such as `temperature` on reasoning models or `budget_tokens` on the
  adaptive-thinking family (E103), out-of-range literals like
  `temperature: 1.2` on Claude models (E104), conflicting combinations
  like `temperature` + `top_p` on Claude 4.x or `budget_tokens >=
  max_tokens` (E105), advisory pairs (W203), deprecated names such as
  `max_tokens` on Chat Completions (W204), and missing required
  parameters (W205). Parameters are extracted from the same call, object
  literal or YAML block as the model id, including nested `budget_tokens`.
- `modelsweep models`: prints the vendored table with statuses derived at
  `--at`, filterable by `--provider` and `--status`.
- `modelsweep explain <id>`: lifecycle, dates, replacement, alias target
  and the full parameter rule set for one model id.
- CI-ready reporting: deterministic text output grouped by file,
  `--format json` with a stable shape, `--strict`, `--quiet`, repeatable
  `--allow`, and exit codes that separate findings (1) from usage/IO
  errors (2). Every report prints the dataset snapshot date.
- Scanner hygiene: skips `node_modules`/`dist`/dot-directories, lockfiles,
  binaries (by extension and NUL sniffing) and files over 1 MB; explicitly
  named files bypass the skip rules.
- Public programmatic API (`checkContent`, `extractReferences`,
  `evaluateParams`, `buildReport`, renderers, dataset accessors) with type
  declarations.
- Test suite: 90 node:test tests (unit + CLI integration in fresh temp
  dirs) and an end-to-end `scripts/smoke.sh` against the bundled
  `examples/legacy-app` project.

[0.1.0]: https://github.com/JaydenCJ/modelsweep/releases/tag/v0.1.0
