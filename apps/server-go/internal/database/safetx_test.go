//go:build integration

package database_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/emergent/emergent-core/internal/database"
	"github.com/emergent/emergent-core/internal/testutil"
)

func TestSafeTx_CommitThenRollback(t *testing.T) {
	// Setup test database
	ctx := context.Background()
	testDB, err := testutil.SetupTestDB(ctx, "safetx")
	require.NoError(t, err)
	defer testDB.Close()

	// Begin a SafeTx
	tx, err := database.BeginSafeTx(ctx, testDB.DB)
	require.NoError(t, err)

	// Commit should succeed
	err = tx.Commit()
	assert.NoError(t, err)

	// Rollback after commit should be a no-op (not error)
	err = tx.Rollback()
	assert.NoError(t, err)
}

func TestSafeTx_RollbackWithoutCommit(t *testing.T) {
	ctx := context.Background()
	testDB, err := testutil.SetupTestDB(ctx, "safetx")
	require.NoError(t, err)
	defer testDB.Close()

	// Begin a SafeTx
	tx, err := database.BeginSafeTx(ctx, testDB.DB)
	require.NoError(t, err)

	// Rollback without commit should work
	err = tx.Rollback()
	assert.NoError(t, err)
}

func TestSafeTx_DoubleCommit(t *testing.T) {
	ctx := context.Background()
	testDB, err := testutil.SetupTestDB(ctx, "safetx")
	require.NoError(t, err)
	defer testDB.Close()

	// Begin a SafeTx
	tx, err := database.BeginSafeTx(ctx, testDB.DB)
	require.NoError(t, err)

	// First commit should succeed
	err = tx.Commit()
	assert.NoError(t, err)

	// Second commit should be a no-op (not error)
	err = tx.Commit()
	assert.NoError(t, err)
}

func TestSafeTx_DeferPattern(t *testing.T) {
	ctx := context.Background()
	testDB, err := testutil.SetupTestDB(ctx, "safetx")
	require.NoError(t, err)
	defer testDB.Close()

	// This test verifies the common defer pattern works correctly
	var commitCalled bool
	var rollbackErr error

	func() {
		tx, err := database.BeginSafeTx(ctx, testDB.DB)
		require.NoError(t, err)
		defer func() {
			rollbackErr = tx.Rollback()
		}()

		// Do some work...
		_, err = tx.Tx.ExecContext(ctx, "SELECT 1")
		require.NoError(t, err)

		// Commit
		err = tx.Commit()
		require.NoError(t, err)
		commitCalled = true
	}()

	assert.True(t, commitCalled)
	assert.NoError(t, rollbackErr, "Rollback after commit should not error")
}

func TestSafeTx_DeferPatternWithoutCommit(t *testing.T) {
	ctx := context.Background()
	testDB, err := testutil.SetupTestDB(ctx, "safetx")
	require.NoError(t, err)
	defer testDB.Close()

	// This test verifies the defer pattern rolls back on early return
	var rollbackErr error

	func() {
		tx, err := database.BeginSafeTx(ctx, testDB.DB)
		require.NoError(t, err)
		defer func() {
			rollbackErr = tx.Rollback()
		}()

		// Do some work but don't commit (simulating early return)
		_, err = tx.Tx.ExecContext(ctx, "SELECT 1")
		require.NoError(t, err)

		// Early return without commit
	}()

	assert.NoError(t, rollbackErr, "Rollback should succeed when commit wasn't called")
}

func TestSafeTx_TransactionIsolation(t *testing.T) {
	ctx := context.Background()
	testDB, err := testutil.SetupTestDB(ctx, "safetx")
	require.NoError(t, err)
	defer testDB.Close()

	// Create a temp table for testing
	_, err = testDB.DB.ExecContext(ctx, `CREATE TEMP TABLE safetx_test (id serial primary key, value text)`)
	require.NoError(t, err)

	// Insert in a transaction that gets rolled back
	tx, err := database.BeginSafeTx(ctx, testDB.DB)
	require.NoError(t, err)

	_, err = tx.Tx.ExecContext(ctx, `INSERT INTO safetx_test (value) VALUES ('should_not_exist')`)
	require.NoError(t, err)

	// Rollback (not commit)
	err = tx.Rollback()
	require.NoError(t, err)

	// Verify the insert was rolled back
	var count int
	err = testDB.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM safetx_test WHERE value = 'should_not_exist'`).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "Rolled back insert should not be visible")

	// Now insert in a transaction that gets committed
	tx2, err := database.BeginSafeTx(ctx, testDB.DB)
	require.NoError(t, err)
	defer tx2.Rollback()

	_, err = tx2.Tx.ExecContext(ctx, `INSERT INTO safetx_test (value) VALUES ('should_exist')`)
	require.NoError(t, err)

	err = tx2.Commit()
	require.NoError(t, err)

	// Verify the insert was committed
	err = testDB.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM safetx_test WHERE value = 'should_exist'`).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "Committed insert should be visible")
}
