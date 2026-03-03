// Bearer token authentication middleware for HTTP transport.
//
// The middleware extracts a JWT from the Authorization header, validates it
// via the SessionManager, and injects the authenticated SessionUser into the
// request context. Behavior depends on the server mode:
//
//   - ModeMultiTenant: bearer token is required. Missing or invalid tokens
//     result in 401 Unauthorized.
//   - ModeSingleTenant / ModeLocal: middleware is a no-op passthrough. No
//     authentication is required.
//
// Public endpoints (health, auth) should NOT be wrapped by this middleware.
// Only MCP transport endpoints (/mcp, /sse, /message) are protected.
package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// contextKey is a private type for context keys to avoid collisions.
type contextKey int

const (
	// userContextKey is the context key for the authenticated SessionUser.
	userContextKey contextKey = iota
)

// UserFromContext extracts the authenticated SessionUser from a request context.
// Returns nil if no user is present (e.g., in local/single-tenant mode).
func UserFromContext(ctx context.Context) *SessionUser {
	user, _ := ctx.Value(userContextKey).(*SessionUser)
	return user
}

// AuthMiddleware provides bearer token authentication for HTTP handlers.
type AuthMiddleware struct {
	session   *SessionManager
	mode      ServerMode
	serverURL string // External base URL for WWW-Authenticate header (e.g., "https://epf.example.com")
}

// NewAuthMiddleware creates a new bearer token middleware.
//
// When mode is ModeMultiTenant, the middleware enforces authentication.
// For all other modes, the middleware passes requests through without
// checking for a bearer token.
//
// serverURL is the external base URL of the server (e.g., "https://epf.example.com").
// It is used to construct the WWW-Authenticate header pointing to the
// Protected Resource Metadata URL (RFC 9728). If empty, the WWW-Authenticate
// header is omitted (backward compatible).
func NewAuthMiddleware(session *SessionManager, mode ServerMode, serverURL string) *AuthMiddleware {
	return &AuthMiddleware{
		session:   session,
		mode:      mode,
		serverURL: strings.TrimRight(serverURL, "/"),
	}
}

// Wrap returns an http.Handler that enforces bearer token authentication
// before delegating to the given handler.
//
// In multi-tenant mode:
//   - Missing Authorization header -> 401
//   - Malformed Authorization header (not "Bearer <token>") -> 401
//   - Invalid or expired token -> 401
//   - Valid token -> injects SessionUser into context, delegates to next
//
// In local/single-tenant mode:
//   - Passes through to next handler without checking for a token.
func (m *AuthMiddleware) Wrap(next http.Handler) http.Handler {
	if m.mode != ModeMultiTenant {
		// No authentication required — passthrough.
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			m.writeUnauthorized(w, "missing Authorization header")
			return
		}

		// Expect "Bearer <token>" format.
		token, ok := parseBearerToken(authHeader)
		if !ok {
			m.writeUnauthorized(w, "invalid Authorization header format, expected: Bearer <token>")
			return
		}

		user, err := m.session.ValidateToken(token)
		if err != nil {
			m.writeUnauthorized(w, "invalid or expired token")
			return
		}

		// Inject the authenticated user into the request context.
		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// writeUnauthorized writes a 401 response with an optional WWW-Authenticate header.
//
// When serverURL is configured (multi-tenant with MCP OAuth), the header
// includes a resource_metadata URL pointing to the Protected Resource Metadata
// endpoint (RFC 9728). This tells MCP clients where to discover the OAuth
// authorization server.
func (m *AuthMiddleware) writeUnauthorized(w http.ResponseWriter, message string) {
	if m.serverURL != "" {
		w.Header().Set("WWW-Authenticate", fmt.Sprintf(
			`Bearer resource_metadata="%s/.well-known/oauth-protected-resource"`,
			m.serverURL,
		))
	}
	writeJSONError(w, http.StatusUnauthorized, message)
}

// parseBearerToken extracts the token from a "Bearer <token>" header value.
// Returns ("", false) if the header is malformed.
func parseBearerToken(header string) (string, bool) {
	// Case-insensitive "Bearer " prefix per RFC 6750.
	if len(header) < 7 {
		return "", false
	}
	prefix := header[:7]
	if !strings.EqualFold(prefix, "bearer ") {
		return "", false
	}
	token := header[7:]
	if token == "" {
		return "", false
	}
	return token, true
}
