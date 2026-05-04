// Package web provides HTTP middleware and route registration for strategy-server.
package web

import (
	"context"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
)

// User represents the authenticated caller on a request.
type User struct {
	ID          uuid.UUID
	GithubLogin string
	Name        string
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
	ID:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
	GithubLogin: "dev",
	Name:        "Dev User",
}

// AuthMiddleware returns an Echo middleware that enforces authentication.
//
// When authEnabled is false (development), requests pass through with DevUser injected.
// When authEnabled is true, the middleware validates the Bearer JWT and rejects
// unauthenticated requests with 401.
func AuthMiddleware(authEnabled bool) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if !authEnabled {
				// Dev pass-through: inject a stable dev user so handlers always have a user.
				ctx := ContextWithUser(c.Request().Context(), DevUser)
				ctx = audit.ContextWithActor(ctx, DevUser.ID)
				c.SetRequest(c.Request().WithContext(ctx))
				return next(c)
			}

			// TODO(Phase 2): validate Bearer JWT from Authorization header.
			// Extract user info from validated token, call ContextWithUser + ContextWithActor.
			// For now, return 401 to make auth-enabled mode safe but non-functional.
			return echo.ErrUnauthorized
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
