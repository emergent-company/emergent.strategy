-- +goose Up
-- Organisation memberships: links users to orgs with roles.

CREATE TABLE org_memberships (
    id         UUID        PRIMARY KEY,
    org_id     UUID        NOT NULL REFERENCES orgs (id),
    user_id    UUID        NOT NULL REFERENCES users (id),
    role       TEXT        NOT NULL DEFAULT 'org_viewer'
                            CHECK (role IN ('org_admin', 'org_viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX org_memberships_org_user_uidx ON org_memberships (org_id, user_id);
CREATE INDEX org_memberships_user_id_idx ON org_memberships (user_id);

-- +goose Down
DROP TABLE IF EXISTS org_memberships;
