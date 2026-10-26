package ingest

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/binary"
	"fmt"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// instanceLock is a Postgres session-level advisory lock on one strategy
// instance. It serialises ingests of that instance across processes (several
// Cloud Run replicas, the CLI), while different instances run in parallel.
//
// A session lock lives on a single connection, so the lock owns a dedicated
// *sql.Conn. It holds one connection from the pool for as long as it is held.
type instanceLock struct {
	conn *sql.Conn
	key  int64
}

// instanceLockKey derives the advisory lock key from the instance UUID.
func instanceLockKey(id uuid.UUID) int64 {
	return int64(binary.BigEndian.Uint64(id[:8])) //nolint:gosec // bit pattern reinterpretation is intended
}

// lockInstance blocks until it holds the lock for id.
func lockInstance(ctx context.Context, db *bun.DB, id uuid.UUID) (*instanceLock, error) {
	conn, err := db.DB.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("lock instance %s: acquire connection: %w", id, err)
	}
	key := instanceLockKey(id)
	if _, err := conn.ExecContext(ctx, "SELECT pg_advisory_lock($1)", key); err != nil {
		discard(conn)
		return nil, fmt.Errorf("lock instance %s: %w", id, err)
	}
	return &instanceLock{conn: conn, key: key}, nil
}

// tryLockInstance returns the lock if it is free, or (nil, nil) if another
// session holds it.
func tryLockInstance(ctx context.Context, db *bun.DB, id uuid.UUID) (*instanceLock, error) {
	conn, err := db.DB.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("try lock instance %s: acquire connection: %w", id, err)
	}
	key := instanceLockKey(id)
	var got bool
	if err := conn.QueryRowContext(ctx, "SELECT pg_try_advisory_lock($1)", key).Scan(&got); err != nil {
		discard(conn)
		return nil, fmt.Errorf("try lock instance %s: %w", id, err)
	}
	if !got {
		_ = conn.Close()
		return nil, nil //nolint:nilnil // nil lock without error means "held elsewhere"
	}
	return &instanceLock{conn: conn, key: key}, nil
}

// release unlocks and returns the connection to the pool. Closing a *sql.Conn
// does not end the Postgres session, so a connection whose unlock failed is
// discarded instead of pooled: pooling it would leave the lock held by an idle
// connection and block every later ingest of the instance.
func (l *instanceLock) release(ctx context.Context) error {
	var unlocked bool
	err := l.conn.QueryRowContext(ctx, "SELECT pg_advisory_unlock($1)", l.key).Scan(&unlocked)
	if err != nil || !unlocked {
		discard(l.conn)
		if err != nil {
			return fmt.Errorf("unlock instance: %w", err)
		}
		return fmt.Errorf("unlock instance: lock was not held by this session")
	}
	return l.conn.Close()
}

// discard closes conn and marks it bad so database/sql drops it from the pool.
func discard(conn *sql.Conn) {
	_ = conn.Raw(func(any) error { return driver.ErrBadConn })
	_ = conn.Close()
}
