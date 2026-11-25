package user_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/seal"
)

const ghToken = "gho_a_token_that_must_never_be_stored_readably"

func keyring(t *testing.T, ids ...string) *seal.Keyring {
	t.Helper()
	entries := make([]string, len(ids))
	for i, id := range ids {
		material := (id + strings.Repeat("-", 32))[:32]
		entries[i] = id + ":" + base64.StdEncoding.EncodeToString([]byte(material))
	}
	k, err := seal.ParseKeyring(strings.Join(entries, ","))
	if err != nil {
		t.Fatalf("keyring: %v", err)
	}
	return k
}

func newUser(t *testing.T, db *bun.DB, sub string) uuid.UUID {
	t.Helper()
	u, err := user.NewService(db).EnsureUser(newCtx(), sub, sub+"@example.com", sub)
	if err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	return u.ID
}

// stored reads the column as it is in the database.
func stored(t *testing.T, db *bun.DB, id uuid.UUID) string {
	t.Helper()
	var v *string
	if err := db.QueryRow("SELECT github_access_token FROM users WHERE id = ?", id).Scan(&v); err != nil {
		t.Fatalf("read column: %v", err)
	}
	if v == nil {
		return ""
	}
	return *v
}

func put(t *testing.T, db *bun.DB, id uuid.UUID, value string) {
	t.Helper()
	if _, err := db.Exec("UPDATE users SET github_access_token = ? WHERE id = ?", value, id); err != nil {
		t.Fatalf("write column: %v", err)
	}
}

func get(t *testing.T, svc *user.Service, id uuid.UUID) string {
	t.Helper()
	got, err := svc.GetGithubToken(context.Background(), id)
	if err != nil {
		t.Fatalf("GetGithubToken: %v", err)
	}
	return got
}

func TestStoredGithubTokenIsSealed(t *testing.T) {
	db := database.TestDB(t)
	id := newUser(t, db, "alice")
	svc := user.NewService(db).WithTokenKeys(keyring(t, "k1"), false)

	if err := svc.StoreGithubToken(newCtx(), id, ghToken); err != nil {
		t.Fatal(err)
	}
	raw := stored(t, db, id)
	if !strings.HasPrefix(raw, "enc:v1:k1:") || strings.Contains(raw, ghToken) {
		t.Errorf("the column holds %q, want an envelope without the token", raw)
	}
	if got := get(t, svc, id); got != ghToken {
		t.Errorf("GetGithubToken = %q", got)
	}
}

func TestASealedValueCopiedToAnotherUserDoesNotOpen(t *testing.T) {
	db := database.TestDB(t)
	alice, bob := newUser(t, db, "alice"), newUser(t, db, "bob")
	svc := user.NewService(db).WithTokenKeys(keyring(t, "k1"), false)
	if err := svc.StoreGithubToken(newCtx(), alice, ghToken); err != nil {
		t.Fatal(err)
	}
	put(t, db, bob, stored(t, db, alice))

	got, err := svc.GetGithubToken(context.Background(), bob)
	if !errors.Is(err, user.ErrTokenUnreadable) || got != "" {
		t.Errorf("bob read %q, %v; want ErrTokenUnreadable", got, err)
	}
}

// A value that cannot be read is neither handed out as a token nor destroyed:
// a wrong key setting must be recoverable.
func TestAnUnreadableValueIsKept(t *testing.T) {
	db := database.TestDB(t)
	id := newUser(t, db, "alice")
	if err := user.NewService(db).WithTokenKeys(keyring(t, "k1"), false).StoreGithubToken(newCtx(), id, ghToken); err != nil {
		t.Fatal(err)
	}
	before := stored(t, db, id)

	for name, svc := range map[string]*user.Service{
		"another key": user.NewService(db).WithTokenKeys(keyring(t, "k2"), false),
		"no key":      user.NewService(db),
	} {
		got, err := svc.GetGithubToken(context.Background(), id)
		if !errors.Is(err, user.ErrTokenUnreadable) || got != "" {
			t.Errorf("%s: %q, %v; want ErrTokenUnreadable", name, got, err)
		}
		if _, err := svc.SealStoredTokens(context.Background()); err != nil {
			t.Errorf("%s: backfill: %v", name, err)
		}
		if stored(t, db, id) != before {
			t.Errorf("%s: the stored value changed", name)
		}
	}
}

func TestLegacyPlainTextIsReadAndSealed(t *testing.T) {
	db := database.TestDB(t)
	id := newUser(t, db, "alice")
	put(t, db, id, ghToken)
	svc := user.NewService(db).WithTokenKeys(keyring(t, "k1"), false)

	if got := get(t, svc, id); got != ghToken {
		t.Errorf("GetGithubToken = %q", got)
	}
	if raw := stored(t, db, id); !strings.HasPrefix(raw, "enc:v1:k1:") {
		t.Errorf("the plain value was not replaced: %q", raw)
	}
	if got := get(t, svc, id); got != ghToken {
		t.Errorf("after re-sealing: %q", got)
	}
}

func TestPlainTextIsRefusedWhenTheSettingSaysSo(t *testing.T) {
	db := database.TestDB(t)
	id := newUser(t, db, "alice")
	put(t, db, id, ghToken)
	svc := user.NewService(db).WithTokenKeys(keyring(t, "k1"), true)

	got, err := svc.GetGithubToken(context.Background(), id)
	if !errors.Is(err, user.ErrTokenUnreadable) || got != "" {
		t.Errorf("%q, %v; want ErrTokenUnreadable", got, err)
	}
	if stored(t, db, id) != ghToken {
		t.Error("a refused read must not change the value")
	}
}

// Without a key (development) the token is stored and read as before.
func TestWithoutAKeyTheTokenIsStoredAsBefore(t *testing.T) {
	db := database.TestDB(t)
	id := newUser(t, db, "alice")
	svc := user.NewService(db)
	if err := svc.StoreGithubToken(newCtx(), id, ghToken); err != nil {
		t.Fatal(err)
	}
	if stored(t, db, id) != ghToken || get(t, svc, id) != ghToken {
		t.Error("without a key the value must round-trip unchanged")
	}
}

func TestClearAndMissingToken(t *testing.T) {
	db := database.TestDB(t)
	id := newUser(t, db, "alice")
	svc := user.NewService(db).WithTokenKeys(keyring(t, "k1"), true)
	if got := get(t, svc, id); got != "" {
		t.Errorf("no token stored: %q", got)
	}
	if err := svc.StoreGithubToken(newCtx(), id, ghToken); err != nil {
		t.Fatal(err)
	}
	if err := svc.ClearGithubToken(newCtx(), id); err != nil {
		t.Fatal(err)
	}
	if get(t, svc, id) != "" || stored(t, db, id) != "" {
		t.Error("the token was not cleared")
	}
}

// Signing in must not write the token column: it would undo a token cleared or
// re-sealed between the read and the write.
func TestEnsureUserDoesNotWriteTheTokenColumn(t *testing.T) {
	db := database.TestDB(t)
	id := newUser(t, db, "alice")
	put(t, db, id, ghToken)
	// The trigger fires for any UPDATE that assigns the column, whatever the value.
	if _, err := db.Exec(`
		CREATE FUNCTION refuse_token_write() RETURNS trigger AS $$
		BEGIN RAISE EXCEPTION 'sign-in assigned github_access_token'; END
		$$ LANGUAGE plpgsql;
		CREATE TRIGGER refuse_token_write BEFORE UPDATE OF github_access_token ON users
		FOR EACH ROW EXECUTE FUNCTION refuse_token_write();`); err != nil {
		t.Fatal(err)
	}
	if _, err := user.NewService(db).EnsureUser(newCtx(), "alice", "new@example.com", "Alice"); err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	if stored(t, db, id) != ghToken {
		t.Error("the token changed")
	}
}

// The backfill seals plain values, moves older keys to the first one, leaves the
// rest, and can be run again.
func TestSealStoredTokens(t *testing.T) {
	db := database.TestDB(t)
	plain, older, current, foreign, none, deleted := newUser(t, db, "plain"), newUser(t, db, "older"),
		newUser(t, db, "current"), newUser(t, db, "foreign"), newUser(t, db, "none"), newUser(t, db, "deleted")

	k1 := user.NewService(db).WithTokenKeys(keyring(t, "k1"), false)
	k2 := user.NewService(db).WithTokenKeys(keyring(t, "k2"), false)
	k9 := user.NewService(db).WithTokenKeys(keyring(t, "k9"), false)
	put(t, db, plain, ghToken+"-plain")
	put(t, db, deleted, ghToken+"-deleted")
	if _, err := db.Exec("UPDATE users SET deleted_at = NOW() WHERE id = ?", deleted); err != nil {
		t.Fatal(err)
	}
	for id, svc := range map[uuid.UUID]*user.Service{older: k1, current: k2, foreign: k9} {
		if err := svc.StoreGithubToken(newCtx(), id, ghToken); err != nil {
			t.Fatal(err)
		}
	}
	currentBefore, foreignBefore := stored(t, db, current), stored(t, db, foreign)

	rotating := user.NewService(db).WithTokenKeys(keyring(t, "k2", "k1"), true)
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	report, err := rotating.SealStoredTokens(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if want := (user.SealReport{Sealed: 2, Resealed: 1, Unreadable: 1}); report != want {
		t.Errorf("report = %+v, want %+v", report, want)
	}
	for name, id := range map[string]uuid.UUID{"plain": plain, "older": older, "current": current, "deleted": deleted} {
		if raw := stored(t, db, id); !strings.HasPrefix(raw, "enc:v1:k2:") {
			t.Errorf("%s: %q is not sealed with the first key", name, raw)
		}
	}
	if stored(t, db, current) != currentBefore {
		t.Error("a value already sealed with the first key must be left alone")
	}
	if stored(t, db, foreign) != foreignBefore || stored(t, db, none) != "" {
		t.Error("an unreadable value and an empty one must be left alone")
	}
	if !strings.Contains(logs.String(), foreign.String()) || strings.Contains(logs.String(), ghToken) {
		t.Errorf("the log must name the unreadable user and no token: %s", logs.String())
	}

	again, err := rotating.SealStoredTokens(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if want := (user.SealReport{Unreadable: 1}); again != want {
		t.Errorf("second run = %+v, want %+v", again, want)
	}

	// The old key can now be dropped.
	only := user.NewService(db).WithTokenKeys(keyring(t, "k2"), true)
	if got := get(t, only, older); got != ghToken {
		t.Errorf("after dropping the old key: %q", got)
	}
	if got := get(t, only, plain); got != ghToken+"-plain" {
		t.Errorf("a backfilled value: %q", got)
	}
}

// A run that stopped partway is finished by the next one.
func TestSealStoredTokensResumesAfterAPartialRun(t *testing.T) {
	db := database.TestDB(t)
	done, left := newUser(t, db, "done"), newUser(t, db, "left")
	svc := user.NewService(db).WithTokenKeys(keyring(t, "k1"), true)
	if err := svc.StoreGithubToken(newCtx(), done, ghToken); err != nil {
		t.Fatal(err)
	}
	put(t, db, left, ghToken)

	report, err := svc.SealStoredTokens(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if want := (user.SealReport{Sealed: 1}); report != want {
		t.Errorf("report = %+v, want %+v", report, want)
	}
	if get(t, svc, done) != ghToken || get(t, svc, left) != ghToken {
		t.Error("both values must read after the second run")
	}
}
