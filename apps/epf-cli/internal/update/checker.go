// Package update provides update checking and self-update functionality for epf-cli.
// It queries GitHub Releases to detect newer versions and can download+replace the binary.
package update

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	// GitHubOwner is the GitHub org that owns the repo.
	GitHubOwner = "emergent-company"

	// GitHubRepo is the repository name.
	GitHubRepo = "emergent.strategy"

	// releasesURL is the GitHub API endpoint for the latest release.
	releasesURL = "https://api.github.com/repos/" + GitHubOwner + "/" + GitHubRepo + "/releases/latest"
)

// ReleaseInfo holds information about a GitHub release.
type ReleaseInfo struct {
	TagName     string         `json:"tag_name"`
	Name        string         `json:"name"`
	HTMLURL     string         `json:"html_url"`
	PublishedAt time.Time      `json:"published_at"`
	Assets      []ReleaseAsset `json:"assets"`
}

// ReleaseAsset holds information about a release asset (binary download).
type ReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// CheckResult is the result of a version check.
type CheckResult struct {
	CurrentVersion  string
	LatestVersion   string
	LatestURL       string
	UpdateAvailable bool
	CheckedAt       time.Time
}

// FetchLatestRelease queries the GitHub API for the latest release.
// Uses a short timeout to avoid slowing down CLI startup.
func FetchLatestRelease() (*ReleaseInfo, error) {
	client := &http.Client{Timeout: 5 * time.Second}

	req, err := http.NewRequest("GET", releasesURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "epf-cli")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch latest release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release ReleaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to decode release info: %w", err)
	}

	return &release, nil
}

// CompareVersions returns true if latest is newer than current.
// Both versions should be in semver format (with or without "v" prefix).
func CompareVersions(current, latest string) bool {
	current = strings.TrimPrefix(current, "v")
	latest = strings.TrimPrefix(latest, "v")

	if current == "dev" || current == "" {
		return false // dev builds never show update notices
	}

	currentParts := parseVersion(current)
	latestParts := parseVersion(latest)

	for i := 0; i < 3; i++ {
		if latestParts[i] > currentParts[i] {
			return true
		}
		if latestParts[i] < currentParts[i] {
			return false
		}
	}
	return false
}

// parseVersion parses a semver string into [major, minor, patch].
// Returns [0, 0, 0] for unparseable input.
func parseVersion(v string) [3]int {
	var parts [3]int
	fmt.Sscanf(v, "%d.%d.%d", &parts[0], &parts[1], &parts[2])
	return parts
}

// Check performs a version check against the latest GitHub release.
func Check(currentVersion string) (*CheckResult, error) {
	release, err := FetchLatestRelease()
	if err != nil {
		return nil, err
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")

	return &CheckResult{
		CurrentVersion:  strings.TrimPrefix(currentVersion, "v"),
		LatestVersion:   latestVersion,
		LatestURL:       release.HTMLURL,
		UpdateAvailable: CompareVersions(currentVersion, latestVersion),
		CheckedAt:       time.Now(),
	}, nil
}
