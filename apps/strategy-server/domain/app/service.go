// Package app manages strategy app installation and invocation.
//
// Strategy apps are HTTP microservices that receive a pushed artifact context
// and return a document and optional staged mutations.
//
// Robustness guarantees per the design spec:
//   - Payload size cap: 2 MB default (APP_PUSH_MAX_BYTES env var)
//   - Call timeout: 30s default (APP_CALL_TIMEOUT_S env var)
//   - HMAC-SHA256 request signing via X-Strategy-Signature header
//   - 3-strike degraded rule: app marked degraded after 3 consecutive failures
//   - Content-Type: application/vnd.strategy-app-request+json; version=1
package app

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Contract version sent in Content-Type header.
const contractVersion = "1"

// degradedThreshold is the number of consecutive failures before an app is
// marked degraded.
const degradedThreshold = 3

// defaultPushMaxBytes is the default maximum serialised payload size (2 MB).
const defaultPushMaxBytes = 2 * 1024 * 1024

// defaultCallTimeoutSeconds is the default HTTP call timeout.
const defaultCallTimeoutSeconds = 30

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service manages strategy app installation and invocation.
type Service struct {
	db *bun.DB
}

// NewService creates a new app Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// AppManifest is the parsed app.yaml structure.
type AppManifest struct {
	Name               string      `yaml:"name"`
	Version            string      `yaml:"version"`
	URL                string      `yaml:"url"`
	MinContractVersion int         `yaml:"min_contract_version"`
	Display            AppDisplay  `yaml:"display"`
	Inputs             []AppInput  `yaml:"inputs"`
	Output             AppOutput   `yaml:"output"`
	Requires           AppRequires `yaml:"requires"`
}

// AppDisplay holds the card metadata for UI rendering.
type AppDisplay struct {
	Name        string   `yaml:"name"        json:"name"`
	Description string   `yaml:"description" json:"description"`
	Icon        string   `yaml:"icon"        json:"icon"`
	Category    string   `yaml:"category"    json:"category"`
	Tags        []string `yaml:"tags"        json:"tags,omitempty"`
}

// AppInput describes one form field for the app's input form.
type AppInput struct {
	Name     string      `yaml:"name"     json:"name"`
	Type     string      `yaml:"type"     json:"type"`
	Label    string      `yaml:"label"    json:"label"`
	Options  []string    `yaml:"options"  json:"options,omitempty"`
	Default  interface{} `yaml:"default"  json:"default,omitempty"`
	Multiple bool        `yaml:"multiple" json:"multiple,omitempty"`
	Required bool        `yaml:"required" json:"required,omitempty"`
}

// AppOutput describes what the app produces.
type AppOutput struct {
	Format            string `yaml:"format"            json:"format"`
	CanStageMutations bool   `yaml:"can_stage_mutations" json:"can_stage_mutations"`
}

// AppRequires lists artifact types the app needs pushed to it.
type AppRequires struct {
	Artifacts []string `yaml:"artifacts" json:"artifacts"`
}

// AppSummary is the public view of an installed app (signing_secret omitted).
type AppSummary struct {
	ID          uuid.UUID  `json:"id"`
	PackName    string     `json:"pack_name"`
	PackVersion string     `json:"pack_version"`
	AppName     string     `json:"app_name"`
	AppURL      string     `json:"app_url"`
	Status      string     `json:"status"`
	Trusted     bool       `json:"trusted"`
	Display     AppDisplay `json:"display"`
	Inputs      []AppInput `json:"inputs"`
	InstalledAt time.Time  `json:"installed_at"`
}

// AppRunResult is the result of invoking an app.
type AppRunResult struct {
	Document AppDocument `json:"document"`
	BatchID  *uuid.UUID  `json:"batch_id,omitempty"`
}

// AppDocument is the document returned by an app.
type AppDocument struct {
	Format  string `json:"format"`
	Content string `json:"content"`
}

// StagedMutation is a mutation proposed by an app.
type StagedMutation struct {
	ArtifactKey  string          `json:"artifact_key"`
	ArtifactType string          `json:"artifact_type"`
	Payload      json.RawMessage `json:"payload"`
}

// appRunRequest is the JSON body sent to an app's /run endpoint.
type appRunRequest struct {
	InstanceID    string                   `json:"instance_id"`
	Artifacts     []map[string]interface{} `json:"artifacts"`
	Relationships []map[string]interface{} `json:"relationships"`
	Params        map[string]interface{}   `json:"params"`
}

// appRunResponse is the parsed response from an app's /run endpoint.
type appRunResponse struct {
	Document        AppDocument      `json:"document"`
	StagedMutations []StagedMutation `json:"staged_mutations,omitempty"`
}

// ---------------------------------------------------------------------------
// ParseAppManifest
// ---------------------------------------------------------------------------

// serverContractVersion is the highest contract version this server supports.
const serverContractVersion = 1

// ParseAppManifest parses and validates an app.yaml manifest string.
// Returns an error if required fields are absent or if min_contract_version
// exceeds the server-supported version.
func ParseAppManifest(manifestYAML string) (*AppManifest, error) {
	var m AppManifest
	if err := yaml.Unmarshal([]byte(manifestYAML), &m); err != nil {
		return nil, fmt.Errorf("invalid app.yaml: %w", err)
	}
	if m.Name == "" {
		return nil, fmt.Errorf("app.yaml missing required field: name")
	}
	if m.Version == "" {
		return nil, fmt.Errorf("app.yaml missing required field: version")
	}
	if m.URL == "" {
		return nil, fmt.Errorf("app.yaml missing required field: url")
	}
	if m.Display.Name == "" {
		return nil, fmt.Errorf("app.yaml missing required field: display.name")
	}
	if m.Output.Format == "" {
		return nil, fmt.Errorf("app.yaml missing required field: output.format")
	}
	// Default contract version is 1.
	if m.MinContractVersion == 0 {
		m.MinContractVersion = 1
	}
	if m.MinContractVersion > serverContractVersion {
		return nil, fmt.Errorf(
			"app %q requires contract version %d but server supports up to %d",
			m.Name, m.MinContractVersion, serverContractVersion)
	}
	return &m, nil
}

// ---------------------------------------------------------------------------
// InstallApp
// ---------------------------------------------------------------------------

// InstallApp registers an app from a pack into strategy_apps for the instance.
// A new signing_secret is generated at install time and stored; it is never
// returned to callers.
func (s *Service) InstallApp(ctx context.Context, instanceID uuid.UUID, packName, packVersion, manifestYAML, installedBy string, trusted bool) error {
	if _, err := ParseAppManifest(manifestYAML); err != nil {
		return fmt.Errorf("install app: %w", err)
	}

	secret, err := generateSigningSecret()
	if err != nil {
		return fmt.Errorf("install app: generate signing secret: %w", err)
	}

	// Extract app_name from manifest for the unique constraint.
	var m AppManifest
	_ = yaml.Unmarshal([]byte(manifestYAML), &m) // already validated above

	app := &domain.StrategyApp{
		InstanceID:    instanceID,
		PackName:      packName,
		PackVersion:   packVersion,
		AppName:       m.Name,
		AppURL:        m.URL,
		ManifestYAML:  manifestYAML,
		Status:        domain.AppStatusActive,
		Trusted:       trusted,
		SigningSecret: secret,
		InstalledBy:   installedBy,
	}
	if _, err := s.db.NewInsert().Model(app).Exec(ctx); err != nil {
		return fmt.Errorf("install app %q: %w", m.Name, err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// UninstallApps
// ---------------------------------------------------------------------------

// UninstallApps removes all strategy_apps rows for packName from the instance.
// Returns the number of apps removed.
func (s *Service) UninstallApps(ctx context.Context, instanceID uuid.UUID, packName string) (int, error) {
	res, err := s.db.NewDelete().Model((*domain.StrategyApp)(nil)).
		Where("instance_id = ? AND pack_name = ?", instanceID, packName).
		Exec(ctx)
	if err != nil {
		return 0, fmt.Errorf("uninstall apps for pack %q: %w", packName, err)
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// ---------------------------------------------------------------------------
// ListApps
// ---------------------------------------------------------------------------

// ListApps returns all installed apps for the instance with parsed display metadata.
func (s *Service) ListApps(ctx context.Context, instanceID uuid.UUID) ([]*AppSummary, error) {
	var rows []domain.StrategyApp
	if err := s.db.NewSelect().Model(&rows).
		Where("instance_id = ?", instanceID).
		OrderExpr("installed_at ASC").
		Scan(ctx); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("list apps: %w", err)
	}

	out := make([]*AppSummary, 0, len(rows))
	for _, row := range rows {
		m, err := ParseAppManifest(row.ManifestYAML)
		if err != nil {
			// Skip apps whose manifest is no longer parseable (shouldn't happen).
			continue
		}
		out = append(out, &AppSummary{
			ID:          row.ID,
			PackName:    row.PackName,
			PackVersion: row.PackVersion,
			AppName:     row.AppName,
			AppURL:      row.AppURL,
			Status:      row.Status,
			Trusted:     row.Trusted,
			Display:     m.Display,
			Inputs:      m.Inputs,
			InstalledAt: row.InstalledAt,
		})
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// RunApp
// ---------------------------------------------------------------------------

// ArtifactFetcher fetches artifacts and relationships for push payload construction.
// The strategy.Service implements this interface.
type ArtifactFetcher interface {
	ListArtifacts(ctx context.Context, instanceID uuid.UUID, artifactTypes []string) ([]map[string]interface{}, error)
	ListAllRelationships(ctx context.Context, instanceID uuid.UUID) ([]map[string]interface{}, error)
}

// MutationStager stages a single mutation and returns the batch_id.
type MutationStager interface {
	StageAppMutation(ctx context.Context, instanceID uuid.UUID, appName string, mutations []StagedMutation) (*uuid.UUID, error)
}

// RunApp invokes the named app for the instance.
//
// Enforcement order:
//  1. Load app row; return error if not found or status != active
//  2. Fetch declared artifact types
//  3. Serialise push payload; reject if > APP_PUSH_MAX_BYTES
//  4. POST to {app_url}/run with HMAC signature and Content-Type version header
//  5. On non-2xx or timeout: increment health_fail_count; degrade after 3 strikes
//  6. On staged_mutations in response: stage via stager; return batch_id
func (s *Service) RunApp(ctx context.Context, instanceID uuid.UUID, appName string, params map[string]interface{}, fetcher ArtifactFetcher, stager MutationStager) (*AppRunResult, error) { //nolint:gocyclo
	// 1. Load app.
	var app domain.StrategyApp
	err := s.db.NewSelect().Model(&app).
		Where("instance_id = ? AND app_name = ?", instanceID, appName).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrNotFound.WithDetail(fmt.Sprintf("app %q not installed", appName))
	}
	if err != nil {
		return nil, fmt.Errorf("load app %q: %w", appName, err)
	}
	if app.Status != domain.AppStatusActive {
		return nil, apperror.ErrConflict.WithDetail(
			fmt.Sprintf("app %q is %s and cannot be invoked", appName, app.Status))
	}

	// Parse manifest for required artifact types.
	manifest, err := ParseAppManifest(app.ManifestYAML)
	if err != nil {
		return nil, fmt.Errorf("parse app manifest: %w", err)
	}

	// 2. Fetch artifacts.
	artifacts, err := fetcher.ListArtifacts(ctx, instanceID, manifest.Requires.Artifacts)
	if err != nil {
		return nil, fmt.Errorf("fetch artifacts for app %q: %w", appName, err)
	}
	relationships, err := fetcher.ListAllRelationships(ctx, instanceID)
	if err != nil {
		return nil, fmt.Errorf("fetch relationships for app %q: %w", appName, err)
	}

	if params == nil {
		params = map[string]interface{}{}
	}

	reqBody := appRunRequest{
		InstanceID:    instanceID.String(),
		Artifacts:     artifacts,
		Relationships: relationships,
		Params:        params,
	}

	// 3. Serialise and check payload size.
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("serialise push payload: %w", err)
	}
	maxBytes := pushMaxBytes()
	if len(bodyBytes) > maxBytes {
		return nil, apperror.ErrUnprocessable.WithDetail(
			fmt.Sprintf("push payload is %d bytes, exceeds limit of %d bytes (%d MB); archive stale artifacts to reduce payload size",
				len(bodyBytes), maxBytes, maxBytes/(1024*1024)))
	}

	// 4. Build and send HTTP request.
	sig := computeHMAC(app.SigningSecret, bodyBytes)
	timeout := callTimeout()
	httpClient := &http.Client{Timeout: timeout}

	runURL := strings.TrimRight(app.AppURL, "/") + "/run"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, runURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("build request for app %q: %w", appName, err)
	}
	req.Header.Set("Content-Type", "application/vnd.strategy-app-request+json; version="+contractVersion)
	req.Header.Set("X-Strategy-Signature", "sha256="+sig)

	resp, err := httpClient.Do(req)
	if err != nil {
		if recordErr := s.recordFailure(ctx, &app); recordErr != nil {
			// log but don't mask the original error
			_ = recordErr
		}
		return nil, fmt.Errorf("call app %q: %w", appName, err)
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if recordErr := s.recordFailure(ctx, &app); recordErr != nil {
			_ = recordErr
		}
		return nil, fmt.Errorf("app %q returned HTTP %d", appName, resp.StatusCode)
	}

	// Success — reset fail count.
	_ = s.resetFailures(ctx, &app)

	// Parse response.
	var appResp appRunResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16*1024*1024)).Decode(&appResp); err != nil {
		return nil, fmt.Errorf("decode app %q response: %w", appName, err)
	}

	result := &AppRunResult{Document: appResp.Document}

	// 6. Stage mutations if present.
	if len(appResp.StagedMutations) > 0 && stager != nil {
		batchID, err := stager.StageAppMutation(ctx, instanceID, appName, appResp.StagedMutations)
		if err != nil {
			return nil, fmt.Errorf("stage app mutations: %w", err)
		}
		result.BatchID = batchID
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// HealthCheckApp
// ---------------------------------------------------------------------------

// HealthCheckApp pings {app_url}/health with a 5s timeout.
// On failure: increments health_fail_count; sets status=degraded after 3 strikes.
// On success: resets health_fail_count=0 and status=active.
func (s *Service) HealthCheckApp(ctx context.Context, appID uuid.UUID) error {
	var app domain.StrategyApp
	if err := s.db.NewSelect().Model(&app).Where("id = ?", appID).Scan(ctx); err != nil {
		return fmt.Errorf("health check load app: %w", err)
	}

	healthURL := strings.TrimRight(app.AppURL, "/") + "/health"
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(healthURL) //nolint:noctx
	now := time.Now()

	if err != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp != nil {
			resp.Body.Close() //nolint:errcheck
		}
		return s.recordFailure(ctx, &app)
	}
	resp.Body.Close() //nolint:errcheck

	// Success.
	_, dbErr := s.db.NewUpdate().Model(&app).
		Set("health_fail_count = 0").
		Set("status = ?", domain.AppStatusActive).
		Set("last_health_at = ?", now).
		Where("id = ?", appID).
		Exec(ctx)
	return dbErr
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (s *Service) recordFailure(ctx context.Context, app *domain.StrategyApp) error {
	newCount := app.HealthFailCount + 1
	newStatus := app.Status
	if newCount >= degradedThreshold {
		newStatus = domain.AppStatusDegraded
	}
	now := time.Now()
	_, err := s.db.NewUpdate().Model(app).
		Set("health_fail_count = ?", newCount).
		Set("status = ?", newStatus).
		Set("last_health_at = ?", now).
		Where("id = ?", app.ID).
		Exec(ctx)
	return err
}

func (s *Service) resetFailures(ctx context.Context, app *domain.StrategyApp) error {
	if app.HealthFailCount == 0 && app.Status == domain.AppStatusActive {
		return nil // nothing to reset
	}
	_, err := s.db.NewUpdate().Model(app).
		Set("health_fail_count = 0").
		Set("status = ?", domain.AppStatusActive).
		Where("id = ?", app.ID).
		Exec(ctx)
	return err
}

func generateSigningSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func computeHMAC(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body) //nolint:errcheck
	return hex.EncodeToString(mac.Sum(nil))
}

func pushMaxBytes() int {
	if v := os.Getenv("APP_PUSH_MAX_BYTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultPushMaxBytes
}

func callTimeout() time.Duration {
	if v := os.Getenv("APP_CALL_TIMEOUT_S"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return defaultCallTimeoutSeconds * time.Second
}
