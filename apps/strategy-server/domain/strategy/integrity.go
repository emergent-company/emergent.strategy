package strategy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"

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
			Column("id", "payload").
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
		for _, r := range rows {
			class, ref, checkedWith := c.Columns(r.Payload)
			if _, err := s.db.NewUpdate().
				Model((*domain.StrategyArtifact)(nil)).
				Set("integrity_class = ?", class).
				Set("integrity_ref = ?", ref).
				Set("integrity_checked_with = ?", checkedWith).
				Where("id = ?", r.ID).
				Exec(ctx); err != nil {
				return total, fmt.Errorf("update integrity of artifact %s: %w", r.ID, err)
			}
			lastID = r.ID
			total++
		}
	}
}
