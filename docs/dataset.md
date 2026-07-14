# The vendored dataset

modelsweep deliberately ships its deprecation data inside the package
(`src/registry.ts`) instead of fetching it. That is a trade, made on
purpose:

- **Offline and deterministic.** A scan needs no network, no API key, and
  produces the same output on every machine for the same `--at` date. CI
  runs cannot be broken by a vendor's status page being down.
- **Auditable.** The data is a plain TypeScript array in version control.
  Every row change is a reviewable diff, and `modelsweep models` prints
  exactly what the binary believes.
- **Dated, not labeled.** Rows carry the vendor-announced `deprecated` and
  `shutdown` dates rather than a status string. Status is *derived* at scan
  time from the reference date, which is what makes `--at` time travel and
  the `--within` horizon possible — and means a scheduled shutdown flips
  from warning to error on the right day without a modelsweep release.

The cost of vendoring is staleness, which is handled honestly rather than
hidden: every report prints `dataset snapshot <date>` so a reader always
knows how fresh the table is, and ids that look like a covered provider's
models but are missing from the table surface as W206 instead of being
silently treated as fine.

## Snapshot and provenance

The current snapshot is **2026-06-30** (`DATA_SNAPSHOT`). Rows were compiled
from the vendors' public deprecation announcements, migration guides and
model documentation as of that date, for five providers: OpenAI, Anthropic,
Google, Mistral and Cohere. Where a vendor announced a deprecation without a
shutdown date, the row carries only `deprecated` and scans emit W201 with
"no shutdown announced yet".

Dates are calendar dates in UTC. A model counts as retired *on* its shutdown
date, and deprecated *on* its announcement date (both boundaries inclusive).

## Row schema

```ts
interface ModelEntry {
  id: string;          // exact wire id
  provider: Provider;  // openai | anthropic | google | mistral | cohere
  family: Family;      // selects the parameter rule set (docs/rules.md)
  deprecated?: string; // ISO announcement date
  shutdown?: string;   // ISO retirement date
  replacement?: string;// vendor-recommended successor (must be active)
  resolvesTo?: string; // set on floating aliases
  note?: string;       // shown by `modelsweep explain`
}
```

Invariants are enforced by the test suite (`tests/registry.test.mjs`):
unique ids, valid calendar dates, `deprecated <= shutdown`, aliases resolve
in one hop, and — the one that matters most — every `replacement` is itself
active at the snapshot date, so a fix suggestion can never point at another
dying model.

## Updating the table

1. Edit `src/registry.ts`: add or amend rows, citing the vendor
   announcement in the PR description.
2. Bump `DATA_SNAPSHOT` to the date you reconciled against.
3. `npm test` — the invariants above must hold.
4. `bash scripts/smoke.sh` — must print `SMOKE OK`. If your change alters
   the bundled example's findings, update `examples/README.md` and the
   smoke assertions in the same PR; they are deliberately coupled.

Corrections are welcome even for historical dates — the table is only as
good as its receipts.

## Known limits (v0.1.0)

- The table does not model *release* dates, so `--at` earlier than a
  model's existence simply reports it as active.
- Region- and platform-specific schedules (e.g. a cloud marketplace
  retiring a model on a different date than the vendor) are out of scope;
  the row carries the vendor's own date.
- Fine-tuned model ids (`ft:gpt-…`) are not yet matched to their base rows.
