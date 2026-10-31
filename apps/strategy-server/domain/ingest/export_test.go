package ingest

import (
	"context"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// HoldInstanceLock takes the instance lock the way an ingest does and returns
// the function that releases it.
func HoldInstanceLock(ctx context.Context, db *bun.DB, id uuid.UUID) (func(), error) {
	l, err := lockInstance(ctx, db, id)
	if err != nil {
		return nil, err
	}
	return func() { _ = l.release(ctx) }, nil
}
