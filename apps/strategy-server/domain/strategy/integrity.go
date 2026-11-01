package strategy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity/embeddedclassifier"
)

// SetIntegrityClassifier replaces the classifier used when artifacts are
// indexed. It exists for tests and for callers that load a newer manifest.
func (s *Service) SetIntegrityClassifier(c *integrity.Classifier) {
	s.classifier = c
}

// integrityColumns classifies a payload for the integrity_* columns.
func (s *Service) integrityColumns(payload json.RawMessage) (class, ref, checkedWith *string) {
	c := s.classifier
	if c == nil {
		c = embeddedclassifier.Default()
	}
	return c.Columns(payload)
}

const reclassifyPageSize = 200

// ReclassifyIntegrity classifies every artifact row that was not checked with
// the current classifier: rows that predate the integrity columns, and rows
// checked against an older manifest. A nil instanceID covers all instances.
// It returns the number of rows examined. It does not change updated_at.
//
// The decomposed layer in Memory carries the class of its artifact, but the
// ingest's content hash covers key and payload only. An instance with a row whose
// class or ref changed is therefore marked changed, in the same transaction as
// the update, so that its graph is re-ingested. Rows that were only re-checked
// leave the instance alone.
func (s *Service) ReclassifyIntegrity(ctx context.Context, instanceID *uuid.UUID) (int, error) {
	c := s.classifier
	if c == nil {
		c = embeddedclassifier.Default()
	}
	if c == nil {
		return 0, errors.New("integrity classifier unavailable")
	}
	version := c.Version()

	total := 0
	lastID := uuid.Nil
	for {
		var rows []domain.StrategyArtifact
		q := s.db.NewSelect().
			Model(&rows).
			Column("id", "instance_id", "payload", "integrity_class", "integrity_ref").
			Where("integrity_checked_with IS DISTINCT FROM ?", version).
			Where("id > ?", lastID).
			OrderExpr("id ASC").
			Limit(reclassifyPageSize)
		if instanceID != nil {
			q = q.Where("instance_id = ?", *instanceID)
		}
		if err := q.Scan(ctx); err != nil {
			return total, fmt.Errorf("load artifacts to reclassify: %w", err)
		}
		if len(rows) == 0 {
			return total, nil
		}
		changed, err := s.reclassifyPage(ctx, c, rows)
		if err != nil {
			return total, err
		}
		for _, id := range changed {
			s.marker.Notify(ctx, id)
		}
		lastID = rows[len(rows)-1].ID
		total += len(rows)
	}
}

// reclassifyPage updates one page of rows and marks, in the same transaction,
// every instance with a row whose class or ref changed. It returns those instances.
func (s *Service) reclassifyPage(ctx context.Context, c *integrity.Classifier, rows []domain.StrategyArtifact) ([]uuid.UUID, error) {
	var changed []uuid.UUID
	seen := map[uuid.UUID]bool{}
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		changed, seen = changed[:0], map[uuid.UUID]bool{}
		for _, r := range rows {
			class, ref, checkedWith := c.Columns(r.Payload)
			if _, err := tx.NewUpdate().
				Model((*domain.StrategyArtifact)(nil)).
				Set("integrity_class = ?", class).
				Set("integrity_ref = ?", ref).
				Set("integrity_checked_with = ?", checkedWith).
				Where("id = ?", r.ID).
				Exec(ctx); err != nil {
				return fmt.Errorf("update integrity of artifact %s: %w", r.ID, err)
			}
			if !seen[r.InstanceID] && (!sameString(r.IntegrityClass, class) || !sameString(r.IntegrityRef, ref)) {
				seen[r.InstanceID] = true
				changed = append(changed, r.InstanceID)
			}
		}
		for _, id := range changed {
			if err := s.marker.Mark(ctx, tx, id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return changed, nil
}

func sameString(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
