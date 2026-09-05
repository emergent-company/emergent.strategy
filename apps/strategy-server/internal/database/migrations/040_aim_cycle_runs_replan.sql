-- +goose Up

-- replan_requested backs DBOSEngine.Replan (openspec/changes/adopt-dbos-dynamic-aim,
-- Part C4): a cheap boolean flag cycleWorkflow's checkReplan reads at every
-- step boundary, so a cycle nobody ever asks to replan never pays for a
-- dbos.Recv-with-timeout call (and the WARN-level "timeout reached" log
-- DBOS itself emits on every such call) at every boundary of every run,
-- forever. Only set true between DBOSEngine.Replan sending its signal and
-- cycleWorkflow consuming (or giving up waiting for) it.
ALTER TABLE aim_cycle_runs
    ADD COLUMN replan_requested BOOLEAN NOT NULL DEFAULT false;

-- +goose Down

ALTER TABLE aim_cycle_runs
    DROP COLUMN replan_requested;
