-- +goose Up
-- Organisation invitations: pending invites by email.
-- Automatically accepted when the invited user first authenticates.

CREATE TABLE org_invitations (
    id         UUID        PRIMARY KEY,
    org_id     UUID        NOT NULL REFERENCES orgs (id),
    email      TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT 'org_viewer'
                            CHECK (role IN ('org_admin', 'org_viewer')),
    status     TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'revoked')),
    invited_by UUID        REFERENCES users (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX org_invitations_email_idx ON org_invitations (email) WHERE status = 'pending';
CREATE UNIQUE INDEX org_invitations_org_email_uidx ON org_invitations (org_id, email) WHERE status = 'pending';

-- +goose Down
DROP TABLE IF EXISTS org_invitations;
