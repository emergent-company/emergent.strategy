// Package changemark records that an instance's artifacts changed in Postgres
// and tells the ingest service to reconcile the Memory graph.
//
// Postgres is the source of truth and the Memory graph is a projection of it.
// Every writer of strategy_artifacts or strategy_relationships calls Mark (or
// Changed) once per operation, after the write. The mark is durable: if the
// notification is lost, the heartbeat finds the instance through
// memory_dirty_since and re-enqueues it.
package changemark

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// Notifier is told after commit that an instance needs reconciling. It is
// implemented by the ingest service and must not block.
type Notifier interface {
	InstanceChanged(ctx context.Context, instanceID uuid.UUID)
}

// Marker marks instances dirty and notifies the ingest service. A nil *Marker
// is valid and does nothing, so services work unchanged where Memory is not
// configured.
type Marker struct {
	db       *bun.DB
	notifier Notifier
}

// New creates a Marker backed by db.
func New(db *bun.DB) *Marker {
	return &Marker{db: db}
}

// SetNotifier wires the ingest service. Must be called before the Marker is
// used concurrently.
func (m *Marker) SetNotifier(n Notifier) {
	if m != nil {
		m.notifier = n
	}
}

// Mark flags the instance as changed using q, which may be the database or an
// open transaction. memory_dirty_since keeps the oldest unprocessed change;
// memory_change_seq increases on every call, which lets an ingest tell whether
// a change arrived while it ran.
//
// Call Mark after the write it describes. An ingest that read the sequence
// before an uncommitted write would otherwise clear the flag over that write.
// An unknown instance is not an error: there is nothing to reconcile.
func (m *Marker) Mark(ctx context.Context, q bun.IDB, instanceID uuid.UUID) error {
	if m == nil {
		return nil
	}
	if q == nil {
		q = m.db
	}
	_, err := q.NewUpdate().
		TableExpr("strategy_instances").
		Set("memory_dirty_since = COALESCE(memory_dirty_since, now())").
		Set("memory_change_seq = memory_change_seq + 1").
		Where("id = ?", instanceID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark instance %s changed: %w", instanceID, err)
	}
	return nil
}

// Notify tells the ingest service the instance changed. Call it after the
// transaction that contained the matching Mark has committed.
func (m *Marker) Notify(ctx context.Context, instanceID uuid.UUID) {
	if m == nil || m.notifier == nil {
		return
	}
	m.notifier.InstanceChanged(ctx, instanceID)
}

// Changed marks the instance and notifies in one step, for writers that are not
// inside a transaction. The write being described has already succeeded, so a
// failed mark is logged rather than returned and the instance is still
// notified. The startup sweep's content-hash comparison is the backstop for a
// mark that was lost.
func (m *Marker) Changed(ctx context.Context, instanceID uuid.UUID) {
	if m == nil {
		return
	}
	if err := m.Mark(ctx, nil, instanceID); err != nil {
		logMarkFailure(ctx, instanceID, err)
	}
	m.Notify(ctx, instanceID)
}
