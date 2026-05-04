package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// auditLogRow matches the audit_log table for bun insertion.
type auditLogRow struct {
	bun.BaseModel `bun:"table:audit_log"`

	ID         uuid.UUID  `bun:"id,pk,type:uuid"`
	EntityType string     `bun:"entity_type,notnull"`
	EntityID   *uuid.UUID `bun:"entity_id,type:uuid"`
	Action     string     `bun:"action,notnull"`
	Source     string     `bun:"source,notnull"`
	ActorID    *uuid.UUID `bun:"actor_id,type:uuid"`
	Details    []byte     `bun:"details,type:jsonb"`
	CreatedAt  time.Time  `bun:"created_at,notnull"`
}

// dbWriter persists audit entries to PostgreSQL.
type dbWriter struct {
	db *bun.DB
}

// NewDBWriter returns an audit Writer that persists entries to the audit_log table.
func NewDBWriter(db *bun.DB) Writer {
	return &dbWriter{db: db}
}

func (w *dbWriter) Write(ctx context.Context, e Entry) {
	var detailsJSON []byte
	if e.Details != nil {
		var err error
		detailsJSON, err = json.Marshal(e.Details)
		if err != nil {
			slog.WarnContext(ctx, "audit: failed to marshal details", "err", err)
		}
	}

	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now().UTC()
	}

	row := &auditLogRow{
		ID:         uuid.New(),
		EntityType: e.EntityType,
		EntityID: func() *uuid.UUID {
			if e.EntityID == uuid.Nil {
				return nil
			}
			id := e.EntityID
			return &id
		}(),
		Action:    e.Action,
		Source:    string(e.Source),
		ActorID:   e.ActorID,
		Details:   detailsJSON,
		CreatedAt: e.CreatedAt,
	}

	if _, err := w.db.NewInsert().Model(row).Exec(ctx); err != nil {
		slog.WarnContext(ctx, "audit: failed to write entry", "entity", e.EntityType, "action", e.Action, "err", err)
	}
}
