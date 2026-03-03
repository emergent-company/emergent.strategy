// Session management for multi-tenant authentication.
//
// The session system has two parts:
//
//  1. JWT issuance and validation — the client receives a signed JWT containing
//     user identity (GitHub user ID, username, expiry). The JWT is signed with
//     HMAC-SHA256 using a server-side secret. The client presents this JWT as
//     a bearer token on subsequent requests.
//
//  2. Session map — the server stores OAuth access tokens in an in-memory map
//     keyed by a random session ID (embedded in the JWT). This keeps OAuth
//     tokens server-side (never sent to the client). The map uses LRU eviction
//     to bound memory usage.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

// SessionConfig configures the session manager.
type SessionConfig struct {
	// Secret is the HMAC signing key for JWTs.
	// Should be at least 32 bytes of random data.
	Secret []byte

	// TTL is the session lifetime. Default: 24 hours.
	TTL time.Duration

	// MaxSessions is the maximum number of sessions stored in memory.
	// When exceeded, the least-recently-used session is evicted.
	// Default: 10,000.
	MaxSessions int
}

// Environment variable names for session configuration.
const (
	EnvSessionSecret = "EPF_SESSION_SECRET"
	EnvSessionTTL    = "EPF_SESSION_TTL"
)

// DefaultSessionTTL is 24 hours.
const DefaultSessionTTL = 24 * time.Hour

// DefaultMaxSessions is the maximum number of concurrent sessions.
const DefaultMaxSessions = 10_000

// SessionConfigFromEnv reads session configuration from environment variables.
//
// EPF_SESSION_SECRET is required when OAuth is configured. It should be a
// hex-encoded string of at least 32 bytes.
//
// EPF_SESSION_TTL is optional, specified as a Go duration string (e.g., "24h", "12h").
func SessionConfigFromEnv() (*SessionConfig, error) {
	secretHex := os.Getenv(EnvSessionSecret)
	if secretHex == "" {
		return nil, nil
	}

	secret, err := hex.DecodeString(secretHex)
	if err != nil {
		return nil, fmt.Errorf("auth: %s must be hex-encoded: %w", EnvSessionSecret, err)
	}
	if len(secret) < 32 {
		return nil, fmt.Errorf("auth: %s must be at least 32 bytes (64 hex chars), got %d bytes", EnvSessionSecret, len(secret))
	}

	cfg := &SessionConfig{
		Secret:      secret,
		TTL:         DefaultSessionTTL,
		MaxSessions: DefaultMaxSessions,
	}

	if ttlStr := os.Getenv(EnvSessionTTL); ttlStr != "" {
		ttl, err := time.ParseDuration(ttlStr)
		if err != nil {
			return nil, fmt.Errorf("auth: %s must be a valid duration (e.g., '24h'): %w", EnvSessionTTL, err)
		}
		if ttl < 1*time.Minute {
			return nil, fmt.Errorf("auth: %s must be at least 1 minute", EnvSessionTTL)
		}
		cfg.TTL = ttl
	}

	return cfg, nil
}

// SessionManager manages user sessions with JWT issuance, validation,
// and an in-memory LRU session store for OAuth tokens.
//
// It is safe for concurrent use.
type SessionManager struct {
	secret      []byte
	ttl         time.Duration
	maxSessions int

	mu       sync.Mutex
	sessions map[string]*sessionEntry // sessionID -> entry
	order    []string                 // LRU order: most recent at end

	// nowFunc is used for testing time-dependent behavior.
	nowFunc func() time.Time
}

// sessionEntry stores server-side session data.
type sessionEntry struct {
	UserID      int64
	Username    string
	AccessToken string // GitHub OAuth access token (server-side only)
	CreatedAt   time.Time
	LastUsed    time.Time
}

// SessionUser represents the authenticated user extracted from a JWT.
type SessionUser struct {
	SessionID string
	UserID    int64
	Username  string
}

// NewSessionManager creates a new session manager.
func NewSessionManager(cfg SessionConfig) *SessionManager {
	if cfg.TTL == 0 {
		cfg.TTL = DefaultSessionTTL
	}
	if cfg.MaxSessions == 0 {
		cfg.MaxSessions = DefaultMaxSessions
	}
	return &SessionManager{
		secret:      cfg.Secret,
		ttl:         cfg.TTL,
		maxSessions: cfg.MaxSessions,
		sessions:    make(map[string]*sessionEntry),
		nowFunc:     time.Now,
	}
}

// CreateSession stores an OAuth token and returns a signed JWT for the client.
//
// The JWT contains: session_id, user_id, username, issued_at, expires_at.
// The OAuth access token is stored server-side only.
func (sm *SessionManager) CreateSession(user *GitHubUser, accessToken string) (string, error) {
	sessionID, err := generateSessionID()
	if err != nil {
		return "", fmt.Errorf("auth: generate session ID: %w", err)
	}

	now := sm.nowFunc()

	// Store the session server-side.
	sm.mu.Lock()
	sm.sessions[sessionID] = &sessionEntry{
		UserID:      user.ID,
		Username:    user.Login,
		AccessToken: accessToken,
		CreatedAt:   now,
		LastUsed:    now,
	}
	sm.touchLRU(sessionID)
	sm.evictIfNeeded()
	sm.mu.Unlock()

	// Issue a JWT for the client.
	jwt, err := sm.signSessionJWT(sessionID, user.ID, user.Login, now)
	if err != nil {
		return "", err
	}

	return jwt, nil
}

// ValidateToken validates a JWT and returns the session user.
//
// Returns an error if the JWT is invalid, expired, or the session has been evicted.
func (sm *SessionManager) ValidateToken(token string) (*SessionUser, error) {
	claims, err := sm.verifySessionJWT(token)
	if err != nil {
		return nil, err
	}

	sessionID, ok := claims["sid"].(string)
	if !ok || sessionID == "" {
		return nil, fmt.Errorf("auth: invalid JWT: missing session ID")
	}

	userIDFloat, ok := claims["uid"].(float64)
	if !ok {
		return nil, fmt.Errorf("auth: invalid JWT: missing user ID")
	}
	userID := int64(userIDFloat)

	username, _ := claims["sub"].(string)

	// Verify the session still exists (not evicted or expired).
	sm.mu.Lock()
	entry, exists := sm.sessions[sessionID]
	if exists {
		entry.LastUsed = sm.nowFunc()
		sm.touchLRU(sessionID)
	}
	sm.mu.Unlock()

	if !exists {
		return nil, fmt.Errorf("auth: session expired or evicted")
	}

	return &SessionUser{
		SessionID: sessionID,
		UserID:    userID,
		Username:  username,
	}, nil
}

// GetAccessToken returns the stored OAuth access token for a session.
// Returns ("", false) if the session doesn't exist.
func (sm *SessionManager) GetAccessToken(sessionID string) (string, bool) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	entry, exists := sm.sessions[sessionID]
	if !exists {
		return "", false
	}
	return entry.AccessToken, true
}

// RevokeSession removes a session from the store.
func (sm *SessionManager) RevokeSession(sessionID string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	delete(sm.sessions, sessionID)
	sm.removeLRU(sessionID)
}

// SessionCount returns the number of active sessions (for monitoring).
func (sm *SessionManager) SessionCount() int {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return len(sm.sessions)
}

// --- JWT signing and verification (HMAC-SHA256) ---

// sessionJWTHeader is the static JWT header for session tokens.
var sessionJWTHeader = map[string]string{
	"alg": "HS256",
	"typ": "JWT",
}

// signSessionJWT creates a session JWT signed with HMAC-SHA256.
func (sm *SessionManager) signSessionJWT(sessionID string, userID int64, username string, now time.Time) (string, error) {
	headerJSON, err := json.Marshal(sessionJWTHeader)
	if err != nil {
		return "", fmt.Errorf("auth: marshal JWT header: %w", err)
	}

	payload := map[string]interface{}{
		"sid": sessionID,
		"uid": userID,
		"sub": username,
		"iat": now.Unix(),
		"exp": now.Add(sm.ttl).Unix(),
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("auth: marshal JWT payload: %w", err)
	}

	signingInput := base64URLEncode(headerJSON) + "." + base64URLEncode(payloadJSON)

	mac := hmac.New(sha256.New, sm.secret)
	mac.Write([]byte(signingInput))
	signature := mac.Sum(nil)

	return signingInput + "." + base64URLEncode(signature), nil
}

// verifySessionJWT verifies a session JWT and returns the claims.
func (sm *SessionManager) verifySessionJWT(token string) (map[string]interface{}, error) {
	parts := splitJWT(token)
	if parts == nil {
		return nil, fmt.Errorf("auth: malformed JWT")
	}

	// Verify signature.
	signingInput := parts[0] + "." + parts[1]
	signatureBytes, err := base64URLDecode(parts[2])
	if err != nil {
		return nil, fmt.Errorf("auth: invalid JWT signature encoding: %w", err)
	}

	mac := hmac.New(sha256.New, sm.secret)
	mac.Write([]byte(signingInput))
	expectedMAC := mac.Sum(nil)

	if !hmac.Equal(signatureBytes, expectedMAC) {
		return nil, fmt.Errorf("auth: invalid JWT signature")
	}

	// Decode payload.
	payloadBytes, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, fmt.Errorf("auth: invalid JWT payload encoding: %w", err)
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("auth: invalid JWT payload: %w", err)
	}

	// Check expiry.
	expFloat, ok := claims["exp"].(float64)
	if !ok {
		return nil, fmt.Errorf("auth: invalid JWT: missing exp claim")
	}
	expTime := time.Unix(int64(expFloat), 0)
	if sm.nowFunc().After(expTime) {
		return nil, fmt.Errorf("auth: JWT expired")
	}

	return claims, nil
}

// splitJWT splits a JWT into its three dot-separated parts.
// Returns nil if the token doesn't have exactly 3 parts.
func splitJWT(token string) []string {
	// Manual split to avoid importing strings just for this.
	first := -1
	second := -1
	for i := 0; i < len(token); i++ {
		if token[i] == '.' {
			if first == -1 {
				first = i
			} else if second == -1 {
				second = i
			} else {
				// More than 2 dots — invalid.
				return nil
			}
		}
	}
	if first == -1 || second == -1 {
		return nil
	}
	return []string{token[:first], token[first+1 : second], token[second+1:]}
}

// base64URLDecode decodes base64url-encoded data (no padding).
// Uses the same encoding as base64URLEncode in githubapp.go.
func base64URLDecode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}

// --- LRU eviction ---

// touchLRU moves a session to the end of the LRU order (most recent).
// Must be called with sm.mu held.
func (sm *SessionManager) touchLRU(sessionID string) {
	sm.removeLRU(sessionID)
	sm.order = append(sm.order, sessionID)
}

// removeLRU removes a session from the LRU order.
// Must be called with sm.mu held.
func (sm *SessionManager) removeLRU(sessionID string) {
	for i, id := range sm.order {
		if id == sessionID {
			sm.order = append(sm.order[:i], sm.order[i+1:]...)
			return
		}
	}
}

// evictIfNeeded removes the least-recently-used session if the map
// exceeds maxSessions. Must be called with sm.mu held.
func (sm *SessionManager) evictIfNeeded() {
	for len(sm.sessions) > sm.maxSessions && len(sm.order) > 0 {
		oldest := sm.order[0]
		sm.order = sm.order[1:]
		delete(sm.sessions, oldest)
	}
}

// generateSessionID creates a cryptographically random session identifier.
func generateSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// generateStateToken creates a random CSRF state token for OAuth.
func GenerateStateToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: generate state token: %w", err)
	}
	return hex.EncodeToString(b), nil
}
