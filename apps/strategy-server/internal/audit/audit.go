// Package audit provides audit logging context propagation for strategy-server.
//
// Usage in services:
//
//	writer := audit.FromContext(ctx)
//	writer.Write(ctx, audit.Entry{...})
//
// Usage in middleware (to set the source):
//
//	ctx = audit.ContextWithSource(ctx, "mcp")
package audit

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// Source identifies where a mutation or event originated.
type Source string

const (
	SourceMCP    Source = "mcp"
	SourceWeb    Source = "web"
	SourceImport Source = "import"
	SourceSystem Source = "system"
)

// Entry represents an auditable event.
type Entry struct {
	EntityType string
	EntityID   uuid.UUID
	Action     string
	Source     Source
	ActorID    *uuid.UUID
	Details    map[string]any
	CreatedAt  time.Time
}

// Writer is the interface for persisting audit entries.
// Services receive a Writer from context; the concrete implementation writes to the DB.
type Writer interface {
	Write(ctx context.Context, entry Entry)
}

// noopWriter silently discards all entries. Used in dev when no audit writer is configured.
type noopWriter struct{}

func (noopWriter) Write(_ context.Context, _ Entry) {}

type writerKey struct{}
type sourceKey struct{}
type actorKey struct{}

// ContextWithAudit returns a context carrying the given audit Writer.
func ContextWithAudit(ctx context.Context, w Writer) context.Context {
	return context.WithValue(ctx, writerKey{}, w)
}

// FromContext returns the audit Writer stored in ctx.
// Returns a no-op writer if none is set — always safe to call.
func FromContext(ctx context.Context) Writer {
	if w, ok := ctx.Value(writerKey{}).(Writer); ok && w != nil {
		return w
	}
	return noopWriter{}
}

// ContextWithSource returns a context with the audit source set.
func ContextWithSource(ctx context.Context, source Source) context.Context {
	return context.WithValue(ctx, sourceKey{}, source)
}

// SourceFromContext returns the audit source from ctx, defaulting to System.
func SourceFromContext(ctx context.Context) Source {
	if s, ok := ctx.Value(sourceKey{}).(Source); ok {
		return s
	}
	return SourceSystem
}

// ContextWithActor returns a context with the acting user's ID.
func ContextWithActor(ctx context.Context, actorID uuid.UUID) context.Context {
	return context.WithValue(ctx, actorKey{}, actorID)
}

// ActorFromContext returns the actor UUID from ctx, or nil if not set.
func ActorFromContext(ctx context.Context) *uuid.UUID {
	if id, ok := ctx.Value(actorKey{}).(uuid.UUID); ok {
		return &id
	}
	return nil
}

// slogWriter is an audit Writer that logs to slog (for dev / testing).
type slogWriter struct{}

func (slogWriter) Write(ctx context.Context, e Entry) {
	slog.InfoContext(ctx, "audit",
		"entity_type", e.EntityType,
		"entity_id", e.EntityID,
		"action", e.Action,
		"source", e.Source,
	)
}

// NewSlogWriter returns an audit Writer that logs entries to slog.
// Use in development or tests where no DB writer is available.
func NewSlogWriter() Writer {
	return slogWriter{}
}
