package instance_test

import (
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func collidingWith(id uuid.UUID, tail string) uuid.UUID {
	return uuid.MustParse(id.String()[:8] + "-" + tail)
}

// An instance whose generated UUID shares its 8-character key prefix with an
// existing one would write to the same Memory keys, so creation retries with a
// new UUID (test 9.18).
func TestImportInstance_RetriesOnKeyPrefixCollision(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, wsSvc, ctx, "prefix-org")

	first, err := svc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: wsID, Name: "first"})
	if err != nil {
		t.Fatalf("first import: %v", err)
	}

	free := uuid.New()
	ids := []uuid.UUID{
		collidingWith(first.ID, "0000-4000-8000-000000000001"),
		collidingWith(first.ID, "0000-4000-8000-000000000002"),
		free,
	}
	calls := 0
	svc.SetIDGenerator(func() uuid.UUID {
		id := ids[calls]
		calls++
		return id
	})

	second, err := svc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: wsID, Name: "second"})
	if err != nil {
		t.Fatalf("second import should retry past the collisions: %v", err)
	}
	if second.ID != free {
		t.Errorf("second.ID = %s, want the first non-colliding UUID %s", second.ID, free)
	}
	if calls != 3 {
		t.Errorf("generator called %d times, want 3", calls)
	}
}

func TestImportInstance_GivesUpAfterRepeatedCollisions(t *testing.T) {
	db := database.TestDB(t)
	wsSvc := workspace.NewService(db)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, wsSvc, ctx, "prefix-org-2")

	first, err := svc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: wsID, Name: "first"})
	if err != nil {
		t.Fatalf("first import: %v", err)
	}

	n := 0
	svc.SetIDGenerator(func() uuid.UUID {
		n++
		return collidingWith(first.ID, "0000-4000-8000-0000000000"+string(rune('0'+n%10))+"0")
	})

	_, err = svc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: wsID, Name: "doomed"})
	if err == nil {
		t.Fatal("expected an error once retries are exhausted")
	}
	if !database.IsKeyPrefixCollision(errors.Unwrap(err)) && !database.IsKeyPrefixCollision(err) {
		t.Fatalf("error should wrap the prefix collision, got: %v", err)
	}
	if n > 10 {
		t.Errorf("generator called %d times; retries must be bounded", n)
	}
}
