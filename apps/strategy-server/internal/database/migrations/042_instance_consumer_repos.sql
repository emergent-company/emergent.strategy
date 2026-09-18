-- +goose Up
-- instance_consumer_repos: the repositories that CONSUME a strategy instance.
--
-- Why this table exists
-- ---------------------
-- strategy_instances.github_repo is the instance's *home* — the single repo the
-- server imports EPF YAML from and pushes AIM results back to (domain/sync).
-- It is deliberately one value, because there can only be one source of truth.
--
-- Consumption is many-to-one and always has been. An EPF instance is typically
-- mounted as a git submodule into several sibling repos, and the EPF anchor
-- file has modelled that from the start:
--
--     deployment:
--       consumers:
--         - repo: "emergent-company/emergent"
--           path: "docs/EPF/_instances/emergent"
--
-- The server had no equivalent, so "which instance does this repo use?" had no
-- answer, and the field that looked closest — github_repo — got overwritten with
-- a consumer's slug to make discovery work. That silently repointed sync and AIM
-- auto-push at the wrong repository. This table gives consumption its own home so
-- the two concepts stop competing for one column.

CREATE TABLE instance_consumer_repos (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID        NOT NULL REFERENCES strategy_instances (id) ON DELETE CASCADE,
    github_repo TEXT        NOT NULL,
    base_path   TEXT        NOT NULL DEFAULT '',
    note        TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- base_path is NOT NULL DEFAULT '' rather than nullable on purpose: it is part
-- of the identity of a mount, and a nullable column cannot carry its weight in
-- a UNIQUE constraint (NULLs never compare equal, so duplicates slip through).
CREATE UNIQUE INDEX instance_consumer_repos_uidx
    ON instance_consumer_repos (instance_id, github_repo, base_path);

-- The lookup this table is for: repo slug → instance.
CREATE INDEX instance_consumer_repos_github_repo_idx
    ON instance_consumer_repos (github_repo);

-- Deliberately NOT backfilled from strategy_instances.github_repo. The lookup
-- (instance.Service.FindByRepo) searches the home column and this table and
-- reports which one matched, so a home repo needs no row here. Copying it in
-- would duplicate a fact that already has an owner, and every write path that
-- touches github_repo would then have to remember to keep the copy in step.
-- This table holds only the links that have nowhere else to live.

-- +goose Down
DROP TABLE IF EXISTS instance_consumer_repos;
