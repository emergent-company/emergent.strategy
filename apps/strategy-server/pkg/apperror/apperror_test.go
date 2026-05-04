package apperror_test

import (
	"errors"
	"net/http"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

func TestAppError_Error(t *testing.T) {
	err := apperror.ErrNotFound
	if err.Error() == "" {
		t.Error("expected non-empty error string")
	}
	if err.HTTPStatus != http.StatusNotFound {
		t.Errorf("expected 404, got %d", err.HTTPStatus)
	}
}

func TestAppError_WithDetail(t *testing.T) {
	err := apperror.ErrNotFound.WithDetail("workspace 123 not found")
	if err == apperror.ErrNotFound {
		t.Error("WithDetail should return a new error, not mutate the sentinel")
	}
	if err.HTTPStatus != http.StatusNotFound {
		t.Errorf("expected 404, got %d", err.HTTPStatus)
	}
}

func TestAppError_WithInternal(t *testing.T) {
	cause := errors.New("db connection lost")
	err := apperror.ErrInternal.WithInternal(cause)
	if !errors.Is(err, cause) {
		t.Error("expected errors.Is to find the internal cause")
	}
}

func TestAsAppError(t *testing.T) {
	err := apperror.ErrWorkspaceNotFound.WithDetail("owner=acme")
	ae := apperror.AsAppError(err)
	if ae == nil {
		t.Fatal("expected non-nil AppError")
	}
	if ae.Code != 110001 {
		t.Errorf("expected code 110001, got %d", ae.Code)
	}
}

func TestIsAppError(t *testing.T) {
	if !apperror.IsAppError(apperror.ErrNotFound) {
		t.Error("IsAppError should return true for *AppError")
	}
	if apperror.IsAppError(errors.New("plain error")) {
		t.Error("IsAppError should return false for plain errors")
	}
}
