package changemark

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
)

func logMarkFailure(ctx context.Context, instanceID uuid.UUID, err error) {
	slog.ErrorContext(ctx, "changemark: failed to mark instance dirty; relying on the startup sweep",
		"instance_id", instanceID, "err", err)
}
