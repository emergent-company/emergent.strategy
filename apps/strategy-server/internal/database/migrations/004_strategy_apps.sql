-- +goose Up
-- +goose StatementBegin
CREATE TABLE strategy_apps (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id       UUID        NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
    pack_name         TEXT        NOT NULL,
    pack_version      TEXT        NOT NULL,
    app_name          TEXT        NOT NULL,
    app_url           TEXT        NOT NULL,
    manifest_yaml     TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'active',
    trusted           BOOLEAN     NOT NULL DEFAULT false,
    signing_secret    TEXT        NOT NULL,
    health_fail_count INT         NOT NULL DEFAULT 0,
    installed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    installed_by      TEXT        NOT NULL,
    last_health_at    TIMESTAMPTZ,
    UNIQUE (instance_id, pack_name, app_name)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX strategy_apps_instance ON strategy_apps (instance_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS strategy_apps;
-- +goose StatementEnd
