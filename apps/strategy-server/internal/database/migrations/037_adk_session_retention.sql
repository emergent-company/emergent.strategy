-- +goose Up

-- Tracks whether a terminal run's ADK session has been reclaimed by the
-- retention sweep (harden-aim-execution, Part A3). NULL means "not yet
-- reaped, or not eligible" — a run awaiting human review is never eligible,
-- however old, so its session_reaped_at stays NULL for the run's entire
-- resumable lifetime.
--
-- Recording this on the run row (rather than inferring "reaped" from the
-- session simply being absent) keeps the sweep idempotent and cheap: without
-- it, every pass would re-select every old terminal run forever and call
-- Delete again on a session that no longer exists, which is harmless but
-- makes the "sessions reaped" count meaningless after the first sweep.
ALTER TABLE adk_run_metadata
    ADD COLUMN session_reaped_at TIMESTAMPTZ;

-- +goose Down

ALTER TABLE adk_run_metadata
    DROP COLUMN IF EXISTS session_reaped_at;
