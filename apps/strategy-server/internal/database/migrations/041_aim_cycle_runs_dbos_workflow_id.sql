-- +goose Up

-- dbos_workflow_id tracks which DBOS-internal workflow is *currently live*
-- for a run — a real bug, found by manual testing, that this column fixes.
--
-- aim_cycle_runs.id is a stable identity for a run and is what StartRun
-- first passes to dbos.RunWorkflow via dbos.WithWorkflowID, so initially
-- id == the live DBOS workflow ID. But DBOSEngine.Retry uses
-- dbos.ForkWorkflow, which always mints a *new* DBOS workflow ID for the
-- retried attempt (confirmed by direct probe, design.md) — after even one
-- retry, id no longer identifies the workflow that is actually executing.
--
-- Every engine operation that addresses a specific DBOS workflow from
-- outside it — Resume's dbos.Send, Replan's dbos.Send, Abort's
-- dbos.CancelWorkflow, and Retry's own dbos.ForkWorkflow /
-- dbos.GetWorkflowSteps lookups on a *second* retry — was using runID
-- (aim_cycle_runs.id) unconditionally instead of the current live workflow
-- ID. The practical symptom: resuming a gate on a run that had been
-- retried even once silently did nothing — the message was durably sent,
-- with no error, to a workflow ID that was already ERROR/dead, while the
-- actually-parked live workflow waited on Recv until AbandonGatesAfter
-- elapsed, having never received it.
--
-- Backfilled to id for every existing row: every run created before this
-- migration has never been retried under the buggy code (retry-then-resume
-- was the exact untested combination), so id is already correct for all of
-- them.
ALTER TABLE aim_cycle_runs ADD COLUMN dbos_workflow_id TEXT NOT NULL DEFAULT '';
UPDATE aim_cycle_runs SET dbos_workflow_id = id::text WHERE dbos_workflow_id = '';
ALTER TABLE aim_cycle_runs ALTER COLUMN dbos_workflow_id DROP DEFAULT;

-- +goose Down

ALTER TABLE aim_cycle_runs DROP COLUMN dbos_workflow_id;
