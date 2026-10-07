package mcpserver

import (
	"errors"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// TestForbiddenDetectionSurvivesWithDetail guards the error-shape collapse in
// assertInstanceAccess.
//
// assertWorkspaceAccess returns ErrForbidden.WithDetail(...), and WithDetail
// returns a *copy*. AppError defines no Is method, so errors.Is falls back to
// pointer equality and would never match the ErrForbidden sentinel against
// that copy. Detection therefore compares Code.
//
// If someone later "simplifies" the check to errors.Is(err, ErrForbidden) it
// will compile, pass review, and silently stop collapsing forbidden into
// not-found — reopening the instance enumeration oracle with no visible
// symptom. This test fails in that case.
func TestForbiddenDetectionSurvivesWithDetail(t *testing.T) {
	wrapped := apperror.ErrForbidden.WithDetail("you do not have access to this workspace")

	if errors.Is(wrapped, apperror.ErrForbidden) {
		t.Fatal("errors.Is now matches a WithDetail copy — AppError must have gained an Is " +
			"method. Re-check assertInstanceAccess: the code comparison is still correct, " +
			"but this test's premise has changed and the comment there is now misleading.")
	}

	var ae *apperror.AppError
	if !errors.As(wrapped, &ae) {
		t.Fatal("errors.As failed to extract *AppError from a WithDetail copy")
	}
	if ae.Code != apperror.ErrForbidden.Code {
		t.Fatalf("code comparison broken: got %d, want %d", ae.Code, apperror.ErrForbidden.Code)
	}
}

// TestNotFoundAndForbiddenAreIndistinguishable records the contract that a
// caller cannot tell an inaccessible instance from a nonexistent one.
func TestNotFoundAndForbiddenAreIndistinguishable(t *testing.T) {
	// What assertInstanceAccess returns for a real-but-inaccessible instance.
	collapsed := apperror.ErrInstanceNotFound
	// What the instance service returns for a UUID that does not exist.
	genuine := apperror.ErrInstanceNotFound

	if collapsed.Code != genuine.Code {
		t.Errorf("codes differ: %d vs %d — a caller could distinguish the two cases",
			collapsed.Code, genuine.Code)
	}
	if collapsed.HTTPStatus != genuine.HTTPStatus {
		t.Errorf("HTTP statuses differ: %d vs %d", collapsed.HTTPStatus, genuine.HTTPStatus)
	}
	if collapsed.MsgKey != genuine.MsgKey {
		t.Errorf("message keys differ: %q vs %q", collapsed.MsgKey, genuine.MsgKey)
	}
}
