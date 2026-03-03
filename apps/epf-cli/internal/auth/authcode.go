// In-memory authorization code store for the MCP OAuth authorization server.
//
// Authorization codes are single-use, short-lived tokens issued during the
// OAuth authorization code flow. When the user completes GitHub authentication,
// the server generates a code, stores it here with the associated PKCE and
// redirect metadata, then redirects the MCP client to its callback URL with
// the code. The client exchanges the code for an access token via POST /token.
//
// Codes are:
//   - Single-use: consumed on first exchange attempt
//   - Time-limited: expire after 10 minutes (per OAuth 2.1 recommendation)
//   - Bound to PKCE: code_challenge stored at issuance, code_verifier checked at exchange
//
// This follows the same in-memory pattern as the CSRF state map in handlers.go.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

// authCodeTTL is how long an authorization code is valid.
const authCodeTTL = 10 * time.Minute

// maxPendingCodes is the maximum number of pending authorization codes.
const maxPendingCodes = 10_000

// AuthCodeEntry stores the metadata associated with an authorization code.
type AuthCodeEntry struct {
	// ClientID is the DCR-registered client that requested the code.
	ClientID string

	// RedirectURI is the MCP client's callback URL.
	RedirectURI string

	// CodeChallenge is the PKCE S256 challenge from the authorization request.
	CodeChallenge string

	// State is the client-provided state parameter (returned on redirect).
	State string

	// SessionID is the server session created during GitHub authentication.
	SessionID string

	// UserID is the GitHub user ID.
	UserID int64

	// Username is the GitHub username.
	Username string

	// ExpiresAt is when this code expires.
	ExpiresAt time.Time
}

// AuthCodeStore is a thread-safe in-memory store for authorization codes.
type AuthCodeStore struct {
	mu    sync.Mutex
	codes map[string]*AuthCodeEntry
}

// NewAuthCodeStore creates a new authorization code store.
func NewAuthCodeStore() *AuthCodeStore {
	return &AuthCodeStore{
		codes: make(map[string]*AuthCodeEntry),
	}
}

// Issue generates a new authorization code and stores the associated metadata.
// Returns the code string.
func (s *AuthCodeStore) Issue(entry AuthCodeEntry) (string, error) {
	code, err := generateAuthCode()
	if err != nil {
		return "", fmt.Errorf("generate auth code: %w", err)
	}

	entry.ExpiresAt = time.Now().Add(authCodeTTL)

	s.mu.Lock()
	defer s.mu.Unlock()

	s.cleanExpired()
	s.codes[code] = &entry

	return code, nil
}

// Consume validates and removes an authorization code.
//
// Returns the associated entry if the code is valid and not expired.
// Returns nil if the code is invalid, expired, or already consumed.
// This enforces single-use semantics.
func (s *AuthCodeStore) Consume(code string) *AuthCodeEntry {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, exists := s.codes[code]
	if !exists {
		return nil
	}

	// Always delete — single-use regardless of validity.
	delete(s.codes, code)

	if time.Now().After(entry.ExpiresAt) {
		return nil
	}

	return entry
}

// PendingCount returns the number of pending codes (for monitoring/testing).
func (s *AuthCodeStore) PendingCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.codes)
}

// cleanExpired removes expired codes. Must be called with s.mu held.
func (s *AuthCodeStore) cleanExpired() {
	now := time.Now()
	for code, entry := range s.codes {
		if now.After(entry.ExpiresAt) {
			delete(s.codes, code)
		}
	}
}

// generateAuthCode creates a cryptographically random authorization code.
func generateAuthCode() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// VerifyCodeChallenge validates a PKCE code_verifier against a stored code_challenge.
//
// Only S256 is supported (SHA-256 hash of the verifier, base64url-encoded without padding).
// Returns true if the verifier matches the challenge.
func VerifyCodeChallenge(verifier, challenge string) bool {
	if verifier == "" || challenge == "" {
		return false
	}
	h := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(h[:])
	return computed == challenge
}
