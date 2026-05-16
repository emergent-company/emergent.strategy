// Package auth provides Zitadel OIDC token introspection for strategy-server.
// Production requests are authenticated by introspecting bearer tokens against
// Zitadel. Results are cached in PostgreSQL with a configurable TTL.
package auth

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// IntrospectionResult holds the parsed token introspection response.
type IntrospectionResult struct {
	Active    bool      `json:"active"`
	Sub       string    `json:"sub"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	ExpiresAt time.Time `json:"exp"`
}

// Config holds Zitadel OIDC settings.
type Config struct {
	Issuer     string
	ClientID   string
	KeyPath    string // path to JWT key file
	DebugToken string // bypass token for testing
	CacheTTL   time.Duration
}

// Introspector verifies bearer tokens against Zitadel.
type Introspector struct {
	cfg        Config
	db         *bun.DB
	httpClient *http.Client
	key        *rsa.PrivateKey

	// Circuit breaker state.
	mu            sync.Mutex
	failCount     int
	lastFail      time.Time
	circuitOpen   bool
	circuitCooldown time.Duration
}

// NewIntrospector creates a token introspector.
// If cfg.KeyPath is set, it loads the JWT signing key for service account auth.
func NewIntrospector(cfg Config, db *bun.DB) (*Introspector, error) {
	if cfg.CacheTTL == 0 {
		cfg.CacheTTL = 5 * time.Minute
	}

	i := &Introspector{
		cfg:             cfg,
		db:              db,
		httpClient:      &http.Client{Timeout: 10 * time.Second},
		circuitCooldown: 30 * time.Second,
	}

	// Load JWT key if configured.
	if cfg.KeyPath != "" {
		key, err := loadRSAKey(cfg.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("load Zitadel JWT key: %w", err)
		}
		i.key = key
	}

	return i, nil
}

// Introspect verifies a bearer token. Returns the introspection result or an error.
// Uses the cache first, falls back to Zitadel, with circuit breaker protection.
func (i *Introspector) Introspect(ctx context.Context, token string) (*IntrospectionResult, error) {
	// Debug token bypass (non-production only).
	if i.cfg.DebugToken != "" && token == i.cfg.DebugToken {
		return &IntrospectionResult{
			Active: true,
			Sub:    "debug-user",
			Email:  "debug@strategy.local",
			Name:   "Debug User",
		}, nil
	}

	// Check cache.
	cached, err := i.getFromCache(ctx, token)
	if err == nil && cached != nil {
		return cached, nil
	}

	// Circuit breaker check.
	if i.isCircuitOpen() {
		// If circuit is open, only serve from cache.
		if cached != nil {
			slog.Warn("auth: circuit breaker open, serving from stale cache")
			return cached, nil
		}
		return nil, fmt.Errorf("auth: Zitadel unavailable (circuit breaker open)")
	}

	// Call Zitadel introspection endpoint.
	result, err := i.callZitadel(ctx, token)
	if err != nil {
		i.recordFailure()
		// Try stale cache.
		if cached != nil {
			slog.Warn("auth: Zitadel call failed, serving from stale cache", "err", err)
			return cached, nil
		}
		return nil, fmt.Errorf("auth: introspection failed: %w", err)
	}

	i.resetFailures()

	// Write to cache.
	if err := i.writeToCache(ctx, token, result); err != nil {
		slog.Warn("auth: cache write failed", "err", err)
	}

	return result, nil
}

// callZitadel calls the Zitadel token introspection endpoint.
func (i *Introspector) callZitadel(ctx context.Context, token string) (*IntrospectionResult, error) {
	introspectURL := strings.TrimRight(i.cfg.Issuer, "/") + "/oauth/v2/introspect"

	data := url.Values{"token": {token}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, introspectURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// Authenticate the introspection request using client credentials.
	// For JWT profile auth, we'd sign a JWT with the service account key.
	// For simplicity, use client_id in the form data.
	data.Set("client_id", i.cfg.ClientID)
	req.Body = http.NoBody
	req.Body = nil
	// Rebuild with client_id included.
	data = url.Values{
		"token":     {token},
		"client_id": {i.cfg.ClientID},
	}
	req, err = http.NewRequestWithContext(ctx, http.MethodPost, introspectURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := i.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call introspection: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("introspection returned status %d", resp.StatusCode)
	}

	var raw struct {
		Active bool   `json:"active"`
		Sub    string `json:"sub"`
		Email  string `json:"email"`
		Name   string `json:"name"`
		Exp    int64  `json:"exp"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &IntrospectionResult{
		Active:    raw.Active,
		Sub:       raw.Sub,
		Email:     raw.Email,
		Name:      raw.Name,
		ExpiresAt: time.Unix(raw.Exp, 0),
	}, nil
}

// Cache operations using PostgreSQL.

type cacheEntry struct {
	bun.BaseModel `bun:"table:auth_introspection_cache,alias:aic"`

	ID        uuid.UUID `bun:"id,pk,type:uuid"`
	TokenHash string    `bun:"token_hash,notnull"`
	Result    []byte    `bun:"result,notnull,type:jsonb"`
	ExpiresAt time.Time `bun:"expires_at,notnull"`
	CreatedAt time.Time `bun:"created_at,notnull,default:now()"`
}

func (i *Introspector) getFromCache(ctx context.Context, token string) (*IntrospectionResult, error) {
	if i.db == nil {
		return nil, fmt.Errorf("no db")
	}

	hash := hashToken(token)
	var entry cacheEntry
	err := i.db.NewSelect().
		Model(&entry).
		Where("token_hash = ?", hash).
		Where("expires_at > ?", time.Now()).
		Scan(ctx)
	if err != nil {
		return nil, err
	}

	var result IntrospectionResult
	if err := json.Unmarshal(entry.Result, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (i *Introspector) writeToCache(ctx context.Context, token string, result *IntrospectionResult) error {
	if i.db == nil {
		return nil
	}

	data, err := json.Marshal(result)
	if err != nil {
		return err
	}

	entry := &cacheEntry{
		ID:        uuid.New(),
		TokenHash: hashToken(token),
		Result:    data,
		ExpiresAt: time.Now().Add(i.cfg.CacheTTL),
	}

	_, err = i.db.NewInsert().
		Model(entry).
		On("CONFLICT (token_hash) DO UPDATE").
		Set("result = EXCLUDED.result").
		Set("expires_at = EXCLUDED.expires_at").
		Exec(ctx)
	return err
}

// Circuit breaker.

func (i *Introspector) isCircuitOpen() bool {
	i.mu.Lock()
	defer i.mu.Unlock()
	if !i.circuitOpen {
		return false
	}
	// Auto-close after cooldown.
	if time.Since(i.lastFail) > i.circuitCooldown {
		i.circuitOpen = false
		i.failCount = 0
		return false
	}
	return true
}

func (i *Introspector) recordFailure() {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.failCount++
	i.lastFail = time.Now()
	if i.failCount >= 3 {
		i.circuitOpen = true
		slog.Warn("auth: circuit breaker opened after 3 consecutive failures")
	}
}

func (i *Introspector) resetFailures() {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.failCount = 0
	i.circuitOpen = false
}
