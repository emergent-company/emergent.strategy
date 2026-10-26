package database

import (
	"errors"
	"strings"

	"github.com/uptrace/bun/driver/pgdriver"
)

// keyPrefixIndex is the unique index that keeps the 8-character instance key
// prefix collision-free (migration 045). Memory object keys are scoped by that
// prefix, so two instances sharing one would overwrite each other's objects.
const keyPrefixIndex = "strategy_instances_key_prefix_uq"

// IsKeyPrefixCollision reports whether err is a violation of the instance key
// prefix unique index, so the caller can retry with a new UUID.
func IsKeyPrefixCollision(err error) bool {
	var pgErr pgdriver.Error
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Field('C') == "23505" && strings.Contains(pgErr.Field('n'), keyPrefixIndex)
}
