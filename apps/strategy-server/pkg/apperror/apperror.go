// Package apperror provides typed HTTP errors for strategy-server.
//
// Error codes are namespaced by domain:
//   - 100xxx — generic (not found, bad request, forbidden, unauthorized)
//   - 110xxx — workspace
//   - 111xxx — strategy instance
//   - 112xxx — strategy mutation / authoring
//   - 113xxx — semantic engine
//
// # i18n
//
// Each sentinel carries a MsgKey (a langs translation key) rather than a
// hard-coded English string. Call Localize(ctx, err) to render the message in
// the locale stored in ctx. The Error() method returns a locale-agnostic
// machine string "[code] key" suitable for logging — never show it to users.
package apperror

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
)

// AppError is a typed HTTP error with an application-level error code.
// Use sentinel package variables and call .WithDetail() or .WithInternal() to add context.
type AppError struct {
	HTTPStatus int
	Code       int
	// MsgKey is a langs translation key (e.g. "error.not_found").
	// Use Localize(ctx, err) to get the user-facing string.
	MsgKey   string
	detail   string
	internal error
}

// Error implements the error interface. Returns a machine-readable string
// suitable for logging. Do NOT display this to users — call Localize instead.
func (e *AppError) Error() string {
	if e.detail != "" {
		return fmt.Sprintf("[%d] %s: %s", e.Code, e.MsgKey, e.detail)
	}
	return fmt.Sprintf("[%d] %s", e.Code, e.MsgKey)
}

// Unwrap exposes the internal error for errors.Is/As.
func (e *AppError) Unwrap() error {
	return e.internal
}

// WithDetail returns a shallow copy of the error with an additional detail string.
func (e *AppError) WithDetail(detail string) *AppError {
	cp := *e
	cp.detail = detail
	return &cp
}

// WithInternal returns a shallow copy of the error with an internal cause attached.
// The internal error is not exposed to clients.
func (e *AppError) WithInternal(err error) *AppError {
	cp := *e
	cp.internal = err
	return &cp
}

// Localize returns the user-facing error message translated into the locale
// stored in ctx. Falls back to the MsgKey if no translation is found.
// If detail is set, it is appended after the translated message.
func Localize(ctx context.Context, err *AppError) string {
	msg := langs.T(ctx, err.MsgKey)
	if err.detail != "" {
		return msg + ": " + err.detail
	}
	return msg
}

// LocalizeErr is like Localize but accepts a plain error and returns the
// translated message if it is an *AppError, or the raw error string otherwise.
func LocalizeErr(ctx context.Context, err error) string {
	var ae *AppError
	if errors.As(err, &ae) {
		return Localize(ctx, ae)
	}
	return err.Error()
}

// NewHTTPDefinedError creates a new AppError sentinel.
// msgKey must match a key defined in internal/langs/langs.go.
// Call this once per error type at package level; do not call from hot paths.
func NewHTTPDefinedError(httpStatus, code int, msgKey string) *AppError {
	return &AppError{
		HTTPStatus: httpStatus,
		Code:       code,
		MsgKey:     msgKey,
	}
}

// IsAppError returns true if err is or wraps an *AppError.
func IsAppError(err error) bool {
	var ae *AppError
	return errors.As(err, &ae)
}

// AsAppError unwraps and returns the *AppError in err, or nil.
func AsAppError(err error) *AppError {
	var ae *AppError
	if errors.As(err, &ae) {
		return ae
	}
	return nil
}

// ---------------------------------------------------------------------------
// Sentinel errors — generic (100xxx)
// ---------------------------------------------------------------------------

var (
	ErrNotFound      = NewHTTPDefinedError(http.StatusNotFound, 100001, "error.not_found")
	ErrBadRequest    = NewHTTPDefinedError(http.StatusBadRequest, 100002, "error.bad_request")
	ErrForbidden     = NewHTTPDefinedError(http.StatusForbidden, 100003, "error.forbidden")
	ErrUnauthorized  = NewHTTPDefinedError(http.StatusUnauthorized, 100004, "error.unauthorized")
	ErrConflict      = NewHTTPDefinedError(http.StatusConflict, 100005, "error.conflict")
	ErrUnprocessable = NewHTTPDefinedError(http.StatusUnprocessableEntity, 100006, "error.unprocessable")
	ErrInternal      = NewHTTPDefinedError(http.StatusInternalServerError, 100099, "error.internal")
)

// ---------------------------------------------------------------------------
// Sentinel errors — workspace (110xxx)
// ---------------------------------------------------------------------------

var (
	ErrWorkspaceNotFound = NewHTTPDefinedError(http.StatusNotFound, 110001, "workspace.not_found")
	ErrWorkspaceConflict = NewHTTPDefinedError(http.StatusConflict, 110002, "workspace.conflict")
)

// ---------------------------------------------------------------------------
// Sentinel errors — strategy instance (111xxx)
// ---------------------------------------------------------------------------

var (
	ErrInstanceNotFound = NewHTTPDefinedError(http.StatusNotFound, 111001, "instance.not_found")
	ErrInstanceArchived = NewHTTPDefinedError(http.StatusGone, 111002, "instance.archived")
)

// ---------------------------------------------------------------------------
// Sentinel errors — strategy mutation / authoring (112xxx)
// ---------------------------------------------------------------------------

var (
	ErrMutationNotFound   = NewHTTPDefinedError(http.StatusNotFound, 112001, "mutation.not_found")
	ErrBatchNotFound      = NewHTTPDefinedError(http.StatusNotFound, 112002, "batch.not_found")
	ErrBatchAlreadyExists = NewHTTPDefinedError(http.StatusConflict, 112003, "batch.conflict")
	ErrValidationFailed   = NewHTTPDefinedError(http.StatusUnprocessableEntity, 112004, "validation.failed")
)

// ---------------------------------------------------------------------------
// Sentinel errors — semantic engine (113xxx)
// ---------------------------------------------------------------------------

var (
	ErrSemanticUnavailable = NewHTTPDefinedError(http.StatusServiceUnavailable, 113001, "semantic.unavailable")
	ErrScenarioNotFound    = NewHTTPDefinedError(http.StatusNotFound, 113002, "scenario.not_found")
)
