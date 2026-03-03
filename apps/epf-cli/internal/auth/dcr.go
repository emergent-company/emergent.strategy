// In-memory Dynamic Client Registration (DCR) store for the MCP OAuth server.
//
// MCP clients (Claude Cowork, OpenCode, Cursor) use RFC 7591 Dynamic Client
// Registration to obtain a client_id before starting the authorization flow.
// The server stores these registrations in-memory with a TTL.
//
// We implement the minimum viable subset of RFC 7591:
//   - Public clients only (no client_secret)
//   - Stores client_name, redirect_uris
//   - Returns a generated client_id
//   - Registrations expire after 24 hours (re-registration is automatic)
//
// In-memory storage is intentional: registrations are ephemeral and MCP
// clients re-register automatically on server restart.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

// dcrTTL is how long a client registration is valid.
const dcrTTL = 24 * time.Hour

// maxDCRClients is the maximum number of registered clients.
const maxDCRClients = 10_000

// DCRClient represents a dynamically registered OAuth client.
type DCRClient struct {
	// ClientID is the server-generated unique client identifier.
	ClientID string `json:"client_id"`

	// ClientName is an optional human-readable name from the registration request.
	ClientName string `json:"client_name,omitempty"`

	// RedirectURIs are the allowed callback URLs for this client.
	RedirectURIs []string `json:"redirect_uris"`

	// CreatedAt is when this client was registered.
	CreatedAt time.Time `json:"client_id_issued_at,omitempty"`

	// ExpiresAt is when this registration expires (0 means no expiry in response).
	ExpiresAt time.Time `json:"-"`
}

// DCRStore is a thread-safe in-memory store for dynamically registered clients.
type DCRStore struct {
	mu      sync.Mutex
	clients map[string]*DCRClient
}

// NewDCRStore creates a new DCR client store.
func NewDCRStore() *DCRStore {
	return &DCRStore{
		clients: make(map[string]*DCRClient),
	}
}

// Register creates a new client registration.
//
// The clientName and redirectURIs come from the registration request body.
// Returns the registered client with a generated client_id.
func (s *DCRStore) Register(clientName string, redirectURIs []string) (*DCRClient, error) {
	clientID, err := generateClientID()
	if err != nil {
		return nil, fmt.Errorf("generate client ID: %w", err)
	}

	now := time.Now()
	client := &DCRClient{
		ClientID:     clientID,
		ClientName:   clientName,
		RedirectURIs: redirectURIs,
		CreatedAt:    now,
		ExpiresAt:    now.Add(dcrTTL),
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.cleanExpired()
	s.clients[clientID] = client

	return client, nil
}

// Lookup returns a registered client by ID.
// Returns nil if the client doesn't exist or has expired.
func (s *DCRStore) Lookup(clientID string) *DCRClient {
	s.mu.Lock()
	defer s.mu.Unlock()

	client, exists := s.clients[clientID]
	if !exists {
		return nil
	}

	if time.Now().After(client.ExpiresAt) {
		delete(s.clients, clientID)
		return nil
	}

	return client
}

// ValidateRedirectURI checks if a redirect URI is registered for the given client.
// Returns true if the URI matches one of the client's registered redirect URIs.
func (s *DCRStore) ValidateRedirectURI(clientID, redirectURI string) bool {
	client := s.Lookup(clientID)
	if client == nil {
		return false
	}

	for _, uri := range client.RedirectURIs {
		if uri == redirectURI {
			return true
		}
	}
	return false
}

// ClientCount returns the number of registered clients (for monitoring/testing).
func (s *DCRStore) ClientCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.clients)
}

// cleanExpired removes expired client registrations. Must be called with s.mu held.
func (s *DCRStore) cleanExpired() {
	now := time.Now()
	for id, client := range s.clients {
		if now.After(client.ExpiresAt) {
			delete(s.clients, id)
		}
	}
}

// generateClientID creates a cryptographically random client identifier.
func generateClientID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "epf-" + hex.EncodeToString(b), nil
}
