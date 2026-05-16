// Package web provides HTTP middleware and route registration for strategy-server.
package web

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
)

// User represents the authenticated caller on a request.
type User struct {
	ID    uuid.UUID
	Sub   string
	Email string
	Name  string
}

type userKey struct{}

// UserFromContext returns the authenticated user from ctx, or nil if not authenticated.
func UserFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userKey{}).(*User)
	return u
}

// ContextWithUser returns a context carrying the given User.
func ContextWithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, userKey{}, u)
}

// DevUser is the user injected in dev mode (auth disabled).
var DevUser = &User{
	ID:    uuid.MustParse("00000000-0000-0000-0000-000000000001"),
	Sub:   "dev",
	Email: "dev@strategy.local",
	Name:  "Dev User",
}

// EnsureUserFunc is called after successful token introspection to
// create or update the user record in the database. Set by cmd_serve.go.
type EnsureUserFunc func(ctx context.Context, sub, email, name string) (uuid.UUID, error)

// AuthMiddleware returns an Echo middleware that enforces authentication.
//
// When authEnabled is false (development), requests pass through with DevUser injected.
// When authEnabled is true, the middleware validates the Bearer token via Zitadel
// introspection and rejects unauthenticated requests with 401.
func AuthMiddleware(authEnabled bool, introspector *auth.Introspector, ensureUser EnsureUserFunc) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Skip auth for health check.
			if c.Request().URL.Path == "/health" {
				return next(c)
			}

			if !authEnabled {
				// Dev pass-through: inject a stable dev user so handlers always have a user.
				ctx := ContextWithUser(c.Request().Context(), DevUser)
				ctx = audit.ContextWithActor(ctx, DevUser.ID)
				c.SetRequest(c.Request().WithContext(ctx))
				return next(c)
			}

			// Extract bearer token.
			authHeader := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				return echo.ErrUnauthorized
			}
			token := strings.TrimPrefix(authHeader, "Bearer ")

			if introspector == nil {
				return echo.ErrUnauthorized
			}

			// Introspect the token.
			result, err := introspector.Introspect(c.Request().Context(), token)
			if err != nil || !result.Active {
				return echo.ErrUnauthorized
			}

			// Ensure user record exists.
			var userID uuid.UUID
			if ensureUser != nil {
				uid, err := ensureUser(c.Request().Context(), result.Sub, result.Email, result.Name)
				if err != nil {
					return echo.ErrUnauthorized
				}
				userID = uid
			}

			user := &User{
				ID:    userID,
				Sub:   result.Sub,
				Email: result.Email,
				Name:  result.Name,
			}

			ctx := ContextWithUser(c.Request().Context(), user)
			ctx = audit.ContextWithActor(ctx, user.ID)
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}

// AuditMiddleware returns an Echo middleware that sets the audit source from the
// request path prefix. MCP requests arrive at /mcp, web requests at everything else.
func AuditMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			source := audit.SourceWeb
			if len(c.Request().URL.Path) >= 4 && c.Request().URL.Path[:4] == "/mcp" {
				source = audit.SourceMCP
			}
			ctx := audit.ContextWithSource(c.Request().Context(), source)
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}

// LangMiddleware returns the i18n locale detection middleware.
func LangMiddleware() echo.MiddlewareFunc {
	return langs.Middleware()
}
