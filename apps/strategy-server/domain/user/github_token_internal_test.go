package user

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/seal"
)

// Re-sealing replaces only the value it read: a token stored or cleared in the
// meantime stays as it is.
func TestResealDoesNotOverwriteAChangedValue(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	keys, err := seal.ParseKeyring("k1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(db).WithTokenKeys(keys, false)
	for name, now := range map[string]any{"replaced": "gho_newer", "cleared": nil} {
		id := uuid.New()
		if _, err := db.Exec("INSERT INTO users (id, sub, email, github_access_token) VALUES (?, ?, ?, ?)",
			id, name, name+"@example.com", now); err != nil {
			t.Fatal(err)
		}
		if err := svc.reseal(ctx, id, "gho_older", "gho_older"); err != nil {
			t.Fatal(err)
		}
		var got *string
		if err := db.QueryRow("SELECT github_access_token FROM users WHERE id = ?", id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if (now == nil && got != nil) || (now != nil && (got == nil || *got != now)) {
			t.Errorf("%s: the later value was overwritten", name)
		}
	}
}
