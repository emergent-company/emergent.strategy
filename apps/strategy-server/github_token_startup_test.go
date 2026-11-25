package main

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/seal"
)

// Start-up encrypts what is stored before any request is served, and says so when
// there is no key.
func TestSetupUsersSealsStoredTokens(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	id := uuid.New()
	if _, err := db.Exec("INSERT INTO users (id, sub, email, github_access_token) VALUES (?, 's', 'e@example.com', 'gho_plain')", id); err != nil {
		t.Fatal(err)
	}
	column := func() string {
		var v string
		if err := db.QueryRow("SELECT github_access_token FROM users WHERE id = ?", id).Scan(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	var logs bytes.Buffer
	log := slog.New(slog.NewTextHandler(&logs, nil))

	if _, err := setupUsers(ctx, log, db, nil, false); err != nil {
		t.Fatal(err)
	}
	if column() != "gho_plain" || !strings.Contains(logs.String(), "stored unencrypted") {
		t.Errorf("without a key: column %q, log %q", column(), logs.String())
	}

	keys, err := seal.ParseKeyring("k1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	logs.Reset()
	users, err := setupUsers(ctx, log, db, keys, true)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(column(), "enc:v1:k1:") || !strings.Contains(logs.String(), "sealed=1") {
		t.Errorf("with a key: column %q, log %q", column(), logs.String())
	}
	if got, err := users.GetGithubToken(ctx, id); err != nil || got != "gho_plain" {
		t.Errorf("the returned service reads %q, %v", got, err)
	}
	// The returned service carries the refusal setting.
	if _, err := db.Exec("UPDATE users SET github_access_token = 'gho_plain' WHERE id = ?", id); err != nil {
		t.Fatal(err)
	}
	if got, err := users.GetGithubToken(ctx, id); err == nil {
		t.Errorf("plain text was read although refused: %q", got)
	}
}
