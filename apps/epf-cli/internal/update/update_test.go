package update

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		current string
		latest  string
		want    bool
	}{
		// Basic comparisons
		{"0.12.6", "0.12.7", true},
		{"0.12.6", "0.12.6", false},
		{"0.12.7", "0.12.6", false},

		// Major/minor bumps
		{"0.12.6", "0.13.0", true},
		{"0.12.6", "1.0.0", true},
		{"1.0.0", "0.99.99", false},

		// With v prefix
		{"v0.12.6", "v0.12.7", true},
		{"v0.12.6", "0.12.7", true},
		{"0.12.6", "v0.12.7", true},

		// Dev builds never update
		{"dev", "0.12.7", false},
		{"", "0.12.7", false},

		// Same version
		{"0.12.6", "0.12.6", false},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%s_vs_%s", tt.current, tt.latest), func(t *testing.T) {
			got := CompareVersions(tt.current, tt.latest)
			if got != tt.want {
				t.Errorf("CompareVersions(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.want)
			}
		})
	}
}

func TestParseVersion(t *testing.T) {
	tests := []struct {
		input string
		want  [3]int
	}{
		{"0.12.6", [3]int{0, 12, 6}},
		{"1.0.0", [3]int{1, 0, 0}},
		{"10.20.30", [3]int{10, 20, 30}},
		{"invalid", [3]int{0, 0, 0}},
		{"", [3]int{0, 0, 0}},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseVersion(tt.input)
			if got != tt.want {
				t.Errorf("parseVersion(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestAssetName(t *testing.T) {
	name := AssetName("0.12.7")
	// Should contain version, os, arch, and extension
	if name == "" {
		t.Error("AssetName returned empty string")
	}
	// Should start with epf-cli_
	if name[:8] != "epf-cli_" {
		t.Errorf("AssetName should start with 'epf-cli_', got %q", name)
	}
}

func TestParseChecksums(t *testing.T) {
	content := `abc123def456  epf-cli_0.12.7_darwin_arm64.tar.gz
789012345678  epf-cli_0.12.7_linux_amd64.tar.gz
deadbeef1234  epf-cli_0.12.7_windows_amd64.zip
`
	tmpDir := t.TempDir()
	checksumFile := filepath.Join(tmpDir, "checksums.txt")
	if err := os.WriteFile(checksumFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	checksums, err := ParseChecksums(checksumFile)
	if err != nil {
		t.Fatal(err)
	}

	if len(checksums) != 3 {
		t.Errorf("expected 3 checksums, got %d", len(checksums))
	}

	if checksums["epf-cli_0.12.7_darwin_arm64.tar.gz"] != "abc123def456" {
		t.Error("checksum mismatch for darwin_arm64")
	}
}

func TestVerifyChecksum(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.bin")
	testData := []byte("hello world")
	if err := os.WriteFile(testFile, testData, 0644); err != nil {
		t.Fatal(err)
	}

	// Compute correct hash
	h := sha256.Sum256(testData)
	correctHash := hex.EncodeToString(h[:])

	// Should pass with correct hash
	if err := VerifyChecksum(testFile, correctHash); err != nil {
		t.Errorf("VerifyChecksum should pass with correct hash: %v", err)
	}

	// Should fail with wrong hash
	if err := VerifyChecksum(testFile, "wrong_hash"); err == nil {
		t.Error("VerifyChecksum should fail with wrong hash")
	}
}

func TestCacheRoundTrip(t *testing.T) {
	// Use a temp dir as home to avoid polluting the real home
	tmpDir := t.TempDir()
	originalHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", originalHome)

	// Initially no cache
	cached := LoadCache()
	if cached != nil {
		t.Error("expected nil cache initially")
	}

	// Save a result
	result := &CheckResult{
		CurrentVersion:  "0.12.6",
		LatestVersion:   "0.12.7",
		LatestURL:       "https://github.com/example/release",
		UpdateAvailable: true,
		CheckedAt:       time.Now(),
	}

	if err := SaveCache(result); err != nil {
		t.Fatalf("SaveCache failed: %v", err)
	}

	// Load it back
	cached = LoadCache()
	if cached == nil {
		t.Fatal("expected non-nil cache after save")
	}

	if cached.LatestVersion != "0.12.7" {
		t.Errorf("expected latest version 0.12.7, got %s", cached.LatestVersion)
	}

	if cached.LatestURL != "https://github.com/example/release" {
		t.Errorf("unexpected URL: %s", cached.LatestURL)
	}
}

func TestIsCacheValid(t *testing.T) {
	// Nil cache is not valid
	if IsCacheValid(nil) {
		t.Error("nil cache should not be valid")
	}

	// Fresh cache is valid
	fresh := &CachedCheck{
		LatestVersion: "0.12.7",
		CheckedAt:     time.Now(),
	}
	if !IsCacheValid(fresh) {
		t.Error("fresh cache should be valid")
	}

	// Old cache is not valid
	old := &CachedCheck{
		LatestVersion: "0.12.7",
		CheckedAt:     time.Now().Add(-25 * time.Hour),
	}
	if IsCacheValid(old) {
		t.Error("25-hour-old cache should not be valid")
	}
}

func TestFetchLatestRelease_MockServer(t *testing.T) {
	release := ReleaseInfo{
		TagName:     "v0.12.7",
		Name:        "EPF CLI v0.12.7",
		HTMLURL:     "https://github.com/example/releases/v0.12.7",
		PublishedAt: time.Now(),
		Assets: []ReleaseAsset{
			{Name: "checksums.txt", BrowserDownloadURL: "https://example.com/checksums.txt", Size: 100},
			{Name: "epf-cli_0.12.7_darwin_arm64.tar.gz", BrowserDownloadURL: "https://example.com/darwin.tar.gz", Size: 1000},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(release)
	}))
	defer server.Close()

	// We can't easily override the URL constant, so just test the mock directly
	// This test verifies JSON parsing works correctly
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(server.URL)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var got ReleaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}

	if got.TagName != "v0.12.7" {
		t.Errorf("expected tag v0.12.7, got %s", got.TagName)
	}

	if len(got.Assets) != 2 {
		t.Errorf("expected 2 assets, got %d", len(got.Assets))
	}
}

func TestFindAssetURL(t *testing.T) {
	release := &ReleaseInfo{
		TagName: "v0.12.7",
		Assets: []ReleaseAsset{
			{Name: "checksums.txt", BrowserDownloadURL: "https://example.com/checksums.txt"},
			{Name: "epf-cli_0.12.7_darwin_arm64.tar.gz", BrowserDownloadURL: "https://example.com/darwin.tar.gz"},
		},
	}

	url, err := FindAssetURL(release, "checksums.txt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if url != "https://example.com/checksums.txt" {
		t.Errorf("unexpected URL: %s", url)
	}

	_, err = FindAssetURL(release, "nonexistent.tar.gz")
	if err == nil {
		t.Error("expected error for nonexistent asset")
	}
}

func TestDetectInstallMethod(t *testing.T) {
	// We can't easily mock os.Executable(), but we can at least verify
	// the function doesn't panic and returns a valid value
	method := DetectInstallMethod()
	if method != InstallHomebrew && method != InstallStandalone && method != InstallUnknown {
		t.Errorf("unexpected install method: %v", method)
	}
}

func TestInstallMethodString(t *testing.T) {
	tests := []struct {
		method InstallMethod
		want   string
	}{
		{InstallHomebrew, "homebrew"},
		{InstallStandalone, "standalone"},
		{InstallUnknown, "unknown"},
	}

	for _, tt := range tests {
		if got := tt.method.String(); got != tt.want {
			t.Errorf("InstallMethod(%d).String() = %q, want %q", tt.method, got, tt.want)
		}
	}
}
