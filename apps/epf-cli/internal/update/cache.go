package update

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const (
	// cacheDir is the directory name under the user's home for epf-cli cache.
	cacheDir = ".epf-cli"

	// cacheFile is the filename for the update check cache.
	cacheFile = "update-check.json"

	// CheckInterval is how often to check for updates (24 hours).
	CheckInterval = 24 * time.Hour
)

// CachedCheck stores a cached version check result on disk.
type CachedCheck struct {
	LatestVersion string    `json:"latest_version"`
	LatestURL     string    `json:"latest_url"`
	CheckedAt     time.Time `json:"checked_at"`
}

// cachePath returns the full path to the cache file.
func cachePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	return filepath.Join(home, cacheDir, cacheFile), nil
}

// LoadCache reads the cached check result from disk.
// Returns nil if the cache doesn't exist or is unreadable.
func LoadCache() *CachedCheck {
	path, err := cachePath()
	if err != nil {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var cached CachedCheck
	if err := json.Unmarshal(data, &cached); err != nil {
		return nil
	}

	return &cached
}

// SaveCache writes the check result to the cache file.
func SaveCache(result *CheckResult) error {
	path, err := cachePath()
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create cache directory: %w", err)
	}

	cached := CachedCheck{
		LatestVersion: result.LatestVersion,
		LatestURL:     result.LatestURL,
		CheckedAt:     result.CheckedAt,
	}

	data, err := json.MarshalIndent(cached, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal cache: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write cache: %w", err)
	}

	return nil
}

// IsCacheValid returns true if the cache exists and was checked within CheckInterval.
func IsCacheValid(cached *CachedCheck) bool {
	if cached == nil {
		return false
	}
	return time.Since(cached.CheckedAt) < CheckInterval
}

// CheckWithCache performs a version check, using the cache to throttle API calls.
// Returns the check result and whether the result came from cache.
func CheckWithCache(currentVersion string) (*CheckResult, bool, error) {
	cached := LoadCache()

	if IsCacheValid(cached) {
		// Use cached result
		return &CheckResult{
			CurrentVersion:  currentVersion,
			LatestVersion:   cached.LatestVersion,
			LatestURL:       cached.LatestURL,
			UpdateAvailable: CompareVersions(currentVersion, cached.LatestVersion),
			CheckedAt:       cached.CheckedAt,
		}, true, nil
	}

	// Fetch fresh result
	result, err := Check(currentVersion)
	if err != nil {
		return nil, false, err
	}

	// Save to cache (best-effort, don't fail on cache write errors)
	_ = SaveCache(result)

	return result, false, nil
}
