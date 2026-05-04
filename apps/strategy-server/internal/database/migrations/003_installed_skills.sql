-- +goose Up
-- +goose StatementBegin

CREATE TABLE installed_skills (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id  UUID        NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    pack_name    TEXT        NOT NULL,
    pack_version TEXT        NOT NULL,
    skill_name   TEXT        NOT NULL,
    skill_yaml   TEXT        NOT NULL,
    prompt_md    TEXT,
    script_src   TEXT,
    script_lang  TEXT,                          -- py | sh | ts | js
    trusted      BOOLEAN     NOT NULL DEFAULT false,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    installed_by TEXT        NOT NULL,
    UNIQUE (instance_id, pack_name, skill_name)
);

CREATE INDEX installed_skills_instance_skill ON installed_skills (instance_id, skill_name);
CREATE INDEX installed_skills_instance_pack  ON installed_skills (instance_id, pack_name);

-- Track which version of the standard pack is installed per instance.
-- NULL means EnsureStandardPack has not yet succeeded for this instance.
ALTER TABLE strategy_instances
    ADD COLUMN standard_pack_version TEXT;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE strategy_instances
    DROP COLUMN IF EXISTS standard_pack_version;

DROP TABLE IF EXISTS installed_skills;

-- +goose StatementEnd
