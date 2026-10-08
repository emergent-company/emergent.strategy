-- +goose Up
-- Allow 'mcp_token' as a mutation source.
--
-- Why this is needed
-- ------------------
-- audit.Source is persisted on strategy_mutations.source, which carries a
-- CHECK constraint enumerating the permitted values (001_initial, widened by
-- 016 to add 'ripple_auto'). Adding the SourceMCPToken constant in Go is
-- therefore only half the change: without this migration every write made by
-- a token-authenticated caller fails at insert time with a constraint
-- violation.
--
-- 'mcp_token' is distinct from 'mcp' deliberately. These are the mutations
-- made by external parties holding a credential we issued, and recording them
-- identically to internal MCP traffic would make the audit log unable to
-- answer "what did the outside party change?" — the first question asked
-- after a token leaks.
ALTER TABLE strategy_mutations DROP CONSTRAINT IF EXISTS strategy_mutations_source_check;
ALTER TABLE strategy_mutations ADD CONSTRAINT strategy_mutations_source_check
    CHECK (source IN ('mcp', 'web', 'import', 'system', 'ripple_auto', 'mcp_token'));

-- +goose Down
-- Rows written by a token-authenticated caller would violate the narrower
-- constraint, so rewrite them to the closest surviving value before
-- reinstating it. They remain identifiable as MCP traffic; only the
-- distinction between internal and token-authenticated callers is lost,
-- which is unavoidable when the value itself is no longer representable.
UPDATE strategy_mutations SET source = 'mcp' WHERE source = 'mcp_token';

ALTER TABLE strategy_mutations DROP CONSTRAINT IF EXISTS strategy_mutations_source_check;
ALTER TABLE strategy_mutations ADD CONSTRAINT strategy_mutations_source_check
    CHECK (source IN ('mcp', 'web', 'import', 'system', 'ripple_auto'));
