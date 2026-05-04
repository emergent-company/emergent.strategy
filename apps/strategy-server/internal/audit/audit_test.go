package audit_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
)

func TestAuditContext_NilSafe(t *testing.T) {
	// FromContext with an empty context must not panic and must return a non-nil Writer.
	ctx := context.Background()
	w := audit.FromContext(ctx)
	if w == nil {
		t.Fatal("expected non-nil Writer from empty context")
	}
	// Writing to the noop writer must not panic.
	w.Write(ctx, audit.Entry{
		EntityType: "test",
		EntityID:   uuid.New(),
		Action:     "test",
		Source:     audit.SourceSystem,
	})
}

func TestAuditContext_SetAndGet(t *testing.T) {
	ctx := context.Background()
	w := audit.NewSlogWriter()
	ctx = audit.ContextWithAudit(ctx, w)
	got := audit.FromContext(ctx)
	if got == nil {
		t.Fatal("expected to retrieve the writer from context")
	}
}

func TestAuditSource_DefaultIsSystem(t *testing.T) {
	ctx := context.Background()
	if s := audit.SourceFromContext(ctx); s != audit.SourceSystem {
		t.Errorf("expected default source %q, got %q", audit.SourceSystem, s)
	}
}

func TestAuditSource_Set(t *testing.T) {
	ctx := audit.ContextWithSource(context.Background(), audit.SourceMCP)
	if s := audit.SourceFromContext(ctx); s != audit.SourceMCP {
		t.Errorf("expected source %q, got %q", audit.SourceMCP, s)
	}
}

func TestAuditActor_NilSafe(t *testing.T) {
	ctx := context.Background()
	actor := audit.ActorFromContext(ctx)
	if actor != nil {
		t.Error("expected nil actor from empty context")
	}
}

func TestAuditActor_Set(t *testing.T) {
	id := uuid.New()
	ctx := audit.ContextWithActor(context.Background(), id)
	got := audit.ActorFromContext(ctx)
	if got == nil {
		t.Fatal("expected non-nil actor")
	}
	if *got != id {
		t.Errorf("expected actor %v, got %v", id, *got)
	}
}
