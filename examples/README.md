# Examples

`legacy-app/` is a three-file slice of a fictional production service, the
way it actually looks eighteen months after somebody shipped it: a Python
job, a TypeScript client and a YAML pipeline config, each pinning model ids
that were perfectly reasonable choices at the time. Nothing in these files
is broken *syntax* — that is the point. Every finding below only exists
because a vendor published a date.

The test suite and `scripts/smoke.sh` both run against these files, so the
counts here are guaranteed to stay accurate.

## Try it

```bash
# from the repository root, after `npm install && npm run build`
node dist/cli.js scan examples/legacy-app                    # today's verdict
node dist/cli.js scan examples/legacy-app --at 2026-07-12    # the captured run
node dist/cli.js scan examples/legacy-app --at 2024-01-01    # mostly clean back then
node dist/cli.js explain claude-opus-4-1                     # why one id is flagged
```

## What the seeded rot demonstrates (at `--at 2026-07-12`)

| File | Reference | Findings |
|---|---|---|
| `chat.py` | `gpt-4-32k` | E101 retired 2025-06-06; W204 `max_tokens` deprecated on Chat Completions |
| `chat.py` | `o1-mini` | E101 retired 2025-10-27; E103 `temperature` and E103 `max_tokens` rejected by reasoning models |
| `client.ts` | `claude-opus-4-1` | E102 shutdown 2026-08-05 is 24 days out; W202 floating alias; E105 `temperature` + `top_p` conflict |
| `client.ts` | `claude-3-5-sonnet-latest` | E101 the alias target retired 2025-10-28; W202 pin a dated snapshot |
| `config.yaml` | `claude-3-opus-20240229` | E101 retired 2026-01-05; E104 `temperature: 1.2` exceeds the 0..1 range; W205 `max_tokens` missing |
| `config.yaml` | `gemini-1.5-pro` | E101 retired 2025-09-24 |

Total: **10 errors, 4 warnings** across 6 model references — exit code 1,
ready to fail a CI job. Re-run with `--at 2024-01-01` and the lifecycle
findings vanish; only the undated parameter mistakes remain.
