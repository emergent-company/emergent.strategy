// Package apperror provides typed HTTP errors for strategy-server.
//
// Error codes are namespaced by domain:
//   - 100xxx — generic (not found, bad request, forbidden, unauthorized)
//   - 110xxx — workspace
//   - 111xxx — strategy instance
//   - 112xxx — strategy mutation / authoring
//   - 113xxx — semantic engine
package apperror

import (
	"errors"
	"fmt"
	"net/http"
)

// AppError is a typed HTTP error with an application-level error code.
// Use sentinel package variables and call .WithDetail() or .WithInternal() to add context.
type AppError struct {
	HTTPStatus int
	Code       int
	Message    string
	detail     string
	internal   error
}

// Error implements the error interface.
func (e *AppError) Error() string {
	if e.detail != "" {
		return fmt.Sprintf("[%d] %s: %s", e.Code, e.Message, e.detail)
	}
	return fmt.Sprintf("[%d] %s", e.Code, e.Message)
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

// NewHTTPDefinedError creates a new AppError sentinel.
// Call this once per error type at package level; do not call from hot paths.
func NewHTTPDefinedError(httpStatus, code int, message string) *AppError {
	return &AppError{
		HTTPStatus: httpStatus,
		Code:       code,
		Message:    message,
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
	ErrNotFound      = NewHTTPDefinedError(http.StatusNotFound, 100001, "resource not found")
	ErrBadRequest    = NewHTTPDefinedError(http.StatusBadRequest, 100002, "bad request")
	ErrForbidden     = NewHTTPDefinedError(http.StatusForbidden, 100003, "forbidden")
	ErrUnauthorized  = NewHTTPDefinedError(http.StatusUnauthorized, 100004, "unauthorized")
	ErrConflict      = NewHTTPDefinedError(http.StatusConflict, 100005, "conflict")
	ErrUnprocessable = NewHTTPDefinedError(http.StatusUnprocessableEntity, 100006, "unprocessable request")
	ErrInternal      = NewHTTPDefinedError(http.StatusInternalServerError, 100099, "internal server error")
)

// ---------------------------------------------------------------------------
// Sentinel errors — workspace (110xxx)
// ---------------------------------------------------------------------------

var (
	ErrWorkspaceNotFound = NewHTTPDefinedError(http.StatusNotFound, 110001, "workspace not found")
	ErrWorkspaceConflict = NewHTTPDefinedError(http.StatusConflict, 110002, "workspace already exists")
)

// ---------------------------------------------------------------------------
// Sentinel errors — strategy instance (111xxx)
// ---------------------------------------------------------------------------

var (
	ErrInstanceNotFound = NewHTTPDefinedError(http.StatusNotFound, 111001, "strategy instance not found")
	ErrInstanceArchived = NewHTTPDefinedError(http.StatusGone, 111002, "strategy instance is archived")
)

// ---------------------------------------------------------------------------
// Sentinel errors — strategy mutation / authoring (112xxx)
// ---------------------------------------------------------------------------

var (
	ErrMutationNotFound   = NewHTTPDefinedError(http.StatusNotFound, 112001, "mutation not found")
	ErrBatchNotFound      = NewHTTPDefinedError(http.StatusNotFound, 112002, "staging batch not found")
	ErrBatchAlreadyExists = NewHTTPDefinedError(http.StatusConflict, 112003, "staging batch already exists for this session")
	ErrValidationFailed   = NewHTTPDefinedError(http.StatusUnprocessableEntity, 112004, "artifact validation failed")
)

// ---------------------------------------------------------------------------
// Sentinel errors — semantic engine (113xxx)
// ---------------------------------------------------------------------------

var (
	ErrSemanticUnavailable = NewHTTPDefinedError(http.StatusServiceUnavailable, 113001, "semantic engine unavailable")
	ErrScenarioNotFound    = NewHTTPDefinedError(http.StatusNotFound, 113002, "scenario not found")
)
