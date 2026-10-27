package ingest

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func TestInstanceLock_SecondCallerBlocksUntilRelease(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	id := uuid.New()

	first, err := lockInstance(ctx, db, id)
	if err != nil {
		t.Fatalf("first lock: %v", err)
	}

	acquired := make(chan struct{})
	go func() {
		second, err := lockInstance(ctx, db, id)
		if err != nil {
			t.Errorf("second lock: %v", err)
			return
		}
		close(acquired)
		_ = second.release(ctx)
	}()

	select {
	case <-acquired:
		t.Fatal("second caller acquired the lock while the first held it")
	case <-time.After(300 * time.Millisecond):
	}

	if err := first.release(ctx); err != nil {
		t.Fatalf("release: %v", err)
	}
	select {
	case <-acquired:
	case <-time.After(5 * time.Second):
		t.Fatal("second caller never acquired the lock after release")
	}
}

func TestInstanceLock_DifferentInstancesDoNotBlock(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	a, err := lockInstance(ctx, db, uuid.New())
	if err != nil {
		t.Fatalf("lock a: %v", err)
	}
	defer func() { _ = a.release(ctx) }()

	done := make(chan error, 1)
	go func() {
		b, err := lockInstance(ctx, db, uuid.New())
		if err == nil {
			err = b.release(ctx)
		}
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("lock b: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("locking a different instance blocked")
	}
}

func TestInstanceLock_TryLockReportsContention(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	id := uuid.New()

	held, err := lockInstance(ctx, db, id)
	if err != nil {
		t.Fatalf("lock: %v", err)
	}
	got, err := tryLockInstance(ctx, db, id)
	if err != nil {
		t.Fatalf("try lock: %v", err)
	}
	if got != nil {
		t.Fatal("tryLockInstance acquired a lock that is held")
	}
	if err := held.release(ctx); err != nil {
		t.Fatalf("release: %v", err)
	}
	got, err = tryLockInstance(ctx, db, id)
	if err != nil || got == nil {
		t.Fatalf("try lock after release: lock=%v err=%v", got, err)
	}
	_ = got.release(ctx)
}

// If the session dies, unlocking fails. The connection must not go back into
// the pool still carrying a session-level lock, and the lock must be free.
func TestInstanceLock_FailedUnlockDoesNotLeakTheLock(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	id := uuid.New()

	l, err := lockInstance(ctx, db, id)
	if err != nil {
		t.Fatalf("lock: %v", err)
	}
	var pid int
	if err := l.conn.QueryRowContext(ctx, "SELECT pg_backend_pid()").Scan(&pid); err != nil {
		t.Fatalf("pid: %v", err)
	}
	if _, err := db.ExecContext(ctx, "SELECT pg_terminate_backend(?)", pid); err != nil {
		t.Fatalf("terminate: %v", err)
	}

	if err := l.release(ctx); err == nil {
		t.Log("release reported no error after the session was killed")
	}

	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("pool unhealthy after failed unlock: %v", err)
	}
	again, err := tryLockInstance(ctx, db, id)
	if err != nil || again == nil {
		t.Fatalf("lock still held after the session died: lock=%v err=%v", again, err)
	}
	_ = again.release(ctx)
}

func TestInstanceLockKey_IsStablePerInstance(t *testing.T) {
	id := uuid.New()
	first := instanceLockKey(id)
	if second := instanceLockKey(id); first != second {
		t.Fatal("key not deterministic")
	}
	if instanceLockKey(id) == instanceLockKey(uuid.New()) {
		t.Fatal("distinct instances share a lock key")
	}
}

// Unlocking a lock this session does not hold returns false on a healthy
// connection. release must report that and must not return the connection to
// the pool: here the pool is capped at one connection, so a pooled-but-bad
// connection would make the next lock attempt fail or hang.
func TestInstanceLock_ReleasingTwiceReportsAndDiscardsTheConnection(t *testing.T) {
	db := database.TestDB(t)
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	id := uuid.New()

	l, err := lockInstance(ctx, db, id)
	if err != nil {
		t.Fatalf("lock: %v", err)
	}
	if err := l.release(ctx); err != nil {
		t.Fatalf("first release: %v", err)
	}
	// Reuse the closed lock's key on a fresh lock, then break its invariant.
	l2, err := lockInstance(ctx, db, id)
	if err != nil {
		t.Fatalf("relock with a one-connection pool: %v", err)
	}
	if _, err := l2.conn.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", l2.key); err != nil {
		t.Fatalf("manual unlock: %v", err)
	}
	if err := l2.release(ctx); err == nil {
		t.Fatal("release must report that the lock was not held")
	}
	l3, err := tryLockInstance(ctx, db, id)
	if err != nil || l3 == nil {
		t.Fatalf("pool unusable after a failed release: lock=%v err=%v", l3, err)
	}
	_ = l3.release(ctx)
}
