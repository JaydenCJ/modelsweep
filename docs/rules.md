# Rule catalog

Codes are stable API: a code is never renumbered or repurposed, only added.
Errors (E1xx) mean the request will fail or already fails against the
vendor's API; warnings (W2xx) mean it degrades, drifts, or deserves review.
Exit code is 1 when any error is present (warnings too, under `--strict`).

## Lifecycle rules (dated)

These are evaluated against the reference date (`--at`, default today) using
the vendored table in `src/registry.ts`. The same file can be clean at one
date and failing at another — that is the feature.

| Rule | Severity | Fires when |
|---|---|---|
| E101 | error | the model's announced shutdown date is on or before the reference date — requests 404/400 in production |
| E102 | error | a shutdown is scheduled within the `--within` horizon (default 90 days) — the clock is running |
| W201 | warning | the model is deprecated but its shutdown is beyond the horizon, or unscheduled |
| W202 | warning | the id is a floating alias that re-points over time — pin the dated snapshot for reproducibility |
| W206 | warning | a `model:`-style key holds an id with a covered provider's prefix that is not in the dataset — usually a typo (a did-you-mean is attached when one is close) |

Floating aliases inherit their target's lifecycle: an alias whose current
target is retired raises both W202 and E101.

## Parameter rules (undated)

These come from each family's request surface and are checked whenever
parameters are found next to a model reference (same call, object literal,
or YAML block). Values that cannot be resolved statically (variables) are
skipped rather than guessed.

| Rule | Severity | Fires when |
|---|---|---|
| E103 | error | a parameter the family rejects outright is set — e.g. `temperature` on reasoning models, `budget_tokens` on the adaptive-thinking family, `max_tokens` on reasoning models (use `max_completion_tokens`) |
| E104 | error | a literal value is out of range or invalid — `temperature` above 1 on Claude models or above 2 on OpenAI chat models, `n` below 1, `budget_tokens` below 1024, an unknown `reasoning_effort` level |
| E105 | error | a conflicting combination the API rejects — `temperature` + `top_p` together on Claude 4.x, `budget_tokens >= max_tokens` |
| W203 | warning | `temperature` and `top_p` are both set where the vendor merely advises tuning one |
| W204 | warning | a deprecated parameter name is used — `max_tokens` on the OpenAI Chat Completions API |
| W205 | warning | a required parameter is absent from a visible call — `max_tokens` on Anthropic Messages requests (only raised when other request parameters were extracted, to keep bare constants quiet) |

## Severity philosophy

Nothing is skipped silently, but noise is treated as a bug: comments never
produce findings, unknown strings without a model-like key are ignored, and
suggestions are only attached when they can be derived confidently. If a
rule cannot decide safely, it stays quiet rather than crying wolf — CI tools
that over-report get removed from CI.
