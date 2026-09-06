# Change: Make human-gate duration measurable, and stop parked runs holding slots

## Why

We are deciding whether a human review gate should **pause** an AIM cycle (as
today) or **end** it, with approval opening a new cycle — the bounded-cycle
pattern in `openspec/AGENT_RUNTIME_PATTERN.md`. That decision turns on how long
gates actually take. A gate that clears in minutes and a gate that takes days
call for different designs.

We cannot answer it, and the reason is a defect rather than a lack of usage.

### The data says nothing, because the schema cannot record it

Querying the dev database (204 runs, 2026-05-20 → 2026-06-09):

- **22 runs entered a human gate. Zero were ever cleared.** 21 terminated at the
  gate; 1 has been parked since 2026-06-02 — **91 days** — holding its
  instance's concurrency slot.
- Inter-step gaps *look* measurable (p50 1s after `draft_assessment`, 25s after
  `draft_calibration`) but every one of them follows a step recorded as `done`.
  There is no way to tell a gate that a human cleared from a step that never
  gated at all.

The cause is in `pkg/orchestration/pg/pool.go`:

- `run.Steps[i].FinishedAt` is set when the **step body** returns (:272),
  *before* the gate opens. It does not mark the step complete.
- The step is then marked `awaiting_human` (:331) and the worker blocks in
  memory on `waitForResume`.
- On resume the status is overwritten with `done`. **Nothing records that a gate
  was ever entered, when it opened, when it cleared, or how it was decided.**

So the single most important operational metric in this system is structurally
unmeasurable, and no amount of waiting for more usage will change that.

### Parked runs are also an operational problem in their own right

`markStaleFailed` (`pkg/orchestration/pg/store.go:88`) sweeps `pending` and
`running` on startup but **deliberately excludes `awaiting_human`**, because
those runs are re-registered by `listAwaitingHuman`. A run parked at a gate
therefore survives every restart indefinitely. One has survived three months,
and because concurrency is keyed on instance id it has blocked every subsequent
cycle for that instance the whole time.

## What Changes

1. **Record the gate lifecycle explicitly.** Add `gate_opened_at`,
   `gate_cleared_at` and `gate_outcome` to `StepLog`, written at gate entry and
   at resume. `StepLog` is serialised into an existing JSONB column, so this
   needs no migration.
2. **Log gate duration on clearance**, so the number is visible in operations
   without querying JSONB.
3. **Sweep runs parked beyond a threshold**, releasing the concurrency slot
   with an explicit terminal status rather than leaving them to rot. Threshold
   configurable; the instrumentation above is what will tell us the right value.
4. **Surface gate wait in the run panel**, distinct from step execution time —
   the two are currently indistinguishable to an operator.

## Impact

- `pkg/orchestration` — `StepLog` gains three fields; the gate path writes them.
- No database migration. `orchestration_runs.steps` is already JSONB, and runs
  written before this change simply lack the fields.
- One new config value for the parked-run threshold.
- `internal/handler` — run panel renders gate wait where present.

Deliberately small. This is instrumentation to make a decision answerable, not
the decision itself.

## Out of Scope (deferred)

- The bounded-cycle redesign. This change exists to inform it, and is useful
  under either outcome.
- The ADK engine swap — withdrawn, see
  `openspec/changes/adopt-adk-runtime-and-provider-seam/tasks.md`.
- Per-attempt gate history. Retry resets `StartedAt`/`FinishedAt` to nil
  (`pool.go:461`) and will reset the gate fields the same way, so a retried step
  keeps only its most recent gate. An append-only run-event log would fix that
  and is the right follow-up **if** retries of gated steps turn out to matter.
- Backfilling gate data for existing runs. It is not recoverable.
