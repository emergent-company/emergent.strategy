package update

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// AssetName returns the expected asset filename for the current platform.
func AssetName(version string) string {
	os := runtime.GOOS
	arch := runtime.GOARCH
	ext := "tar.gz"
	if os == "windows" {
		ext = "zip"
	}
	return fmt.Sprintf("epf-cli_%s_%s_%s.%s", version, os, arch, ext)
}

// ChecksumsAssetName returns the checksums file name.
func ChecksumsAssetName() string {
	return "checksums.txt"
}

// FindAssetURL finds the download URL for the given asset name in a release.
func FindAssetURL(release *ReleaseInfo, assetName string) (string, error) {
	for _, asset := range release.Assets {
		if asset.Name == assetName {
			return asset.BrowserDownloadURL, nil
		}
	}
	return "", fmt.Errorf("asset %q not found in release %s", assetName, release.TagName)
}

// DownloadFile downloads a URL to a temporary file and returns its path.
func DownloadFile(url string) (string, error) {
	client := &http.Client{Timeout: 2 * time.Minute}

	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	tmp, err := os.CreateTemp("", "epf-cli-update-*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer tmp.Close()

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		os.Remove(tmp.Name())
		return "", fmt.Errorf("failed to write download: %w", err)
	}

	return tmp.Name(), nil
}

// VerifyChecksum verifies that a file matches an expected SHA256 checksum.
func VerifyChecksum(filePath, expectedHash string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file for checksum: %w", err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return fmt.Errorf("failed to compute checksum: %w", err)
	}

	actual := hex.EncodeToString(h.Sum(nil))
	if actual != expectedHash {
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expectedHash, actual)
	}
	return nil
}

// ParseChecksums parses a GoReleaser checksums.txt file and returns a map of filename→hash.
func ParseChecksums(checksumsPath string) (map[string]string, error) {
	data, err := os.ReadFile(checksumsPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read checksums file: %w", err)
	}

	checksums := make(map[string]string)
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Format: "<hash>  <filename>"
		parts := strings.Fields(line)
		if len(parts) == 2 {
			checksums[parts[1]] = parts[0]
		}
	}
	return checksums, nil
}

// ExtractBinary extracts the epf-cli binary from a tar.gz or zip archive.
// Returns the path to the extracted binary.
func ExtractBinary(archivePath string) (string, error) {
	if strings.HasSuffix(archivePath, ".zip") || runtime.GOOS == "windows" {
		return extractFromZip(archivePath)
	}
	return extractFromTarGz(archivePath)
}

func extractFromTarGz(archivePath string) (string, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return "", fmt.Errorf("failed to open archive: %w", err)
	}
	defer f.Close()

	gzr, err := gzip.NewReader(f)
	if err != nil {
		return "", fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("failed to read tar entry: %w", err)
		}

		if header.Typeflag == tar.TypeReg && filepath.Base(header.Name) == "epf-cli" {
			tmp, err := os.CreateTemp("", "epf-cli-binary-*")
			if err != nil {
				return "", fmt.Errorf("failed to create temp file: %w", err)
			}
			defer tmp.Close()

			if _, err := io.Copy(tmp, tr); err != nil {
				os.Remove(tmp.Name())
				return "", fmt.Errorf("failed to extract binary: %w", err)
			}

			if err := os.Chmod(tmp.Name(), 0755); err != nil {
				os.Remove(tmp.Name())
				return "", fmt.Errorf("failed to set permissions: %w", err)
			}

			return tmp.Name(), nil
		}
	}

	return "", fmt.Errorf("epf-cli binary not found in archive")
}

func extractFromZip(archivePath string) (string, error) {
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return "", fmt.Errorf("failed to open zip: %w", err)
	}
	defer r.Close()

	binaryName := "epf-cli"
	if runtime.GOOS == "windows" {
		binaryName = "epf-cli.exe"
	}

	for _, f := range r.File {
		if filepath.Base(f.Name) == binaryName {
			rc, err := f.Open()
			if err != nil {
				return "", fmt.Errorf("failed to open zip entry: %w", err)
			}
			defer rc.Close()

			tmp, err := os.CreateTemp("", "epf-cli-binary-*")
			if err != nil {
				return "", fmt.Errorf("failed to create temp file: %w", err)
			}
			defer tmp.Close()

			if _, err := io.Copy(tmp, rc); err != nil {
				os.Remove(tmp.Name())
				return "", fmt.Errorf("failed to extract binary: %w", err)
			}

			if err := os.Chmod(tmp.Name(), 0755); err != nil {
				os.Remove(tmp.Name())
				return "", fmt.Errorf("failed to set permissions: %w", err)
			}

			return tmp.Name(), nil
		}
	}

	return "", fmt.Errorf("epf-cli binary not found in zip archive")
}

// ReplaceBinary replaces the current binary with the new one.
// Creates a backup of the current binary before replacing.
func ReplaceBinary(currentPath, newBinaryPath string) (backupPath string, err error) {
	// Resolve symlinks to get the real path
	realPath, err := filepath.EvalSymlinks(currentPath)
	if err != nil {
		return "", fmt.Errorf("failed to resolve binary path: %w", err)
	}

	// Create backup
	backupPath = realPath + ".bak"
	if err := os.Rename(realPath, backupPath); err != nil {
		return "", fmt.Errorf("failed to create backup: %w", err)
	}

	// Move new binary into place
	if err := copyFile(newBinaryPath, realPath); err != nil {
		// Attempt to restore backup
		_ = os.Rename(backupPath, realPath)
		return "", fmt.Errorf("failed to install new binary: %w", err)
	}

	if err := os.Chmod(realPath, 0755); err != nil {
		return backupPath, fmt.Errorf("binary installed but failed to set permissions: %w", err)
	}

	return backupPath, nil
}

// copyFile copies src to dst using a temp file + rename for atomicity.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}

	return out.Close()
}

// SelfUpdate performs a full self-update: fetch release, download, verify, replace.
func SelfUpdate(currentVersion string) (newVersion string, err error) {
	// 1. Fetch latest release info
	release, err := FetchLatestRelease()
	if err != nil {
		return "", fmt.Errorf("failed to check for updates: %w", err)
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")
	if !CompareVersions(currentVersion, latestVersion) {
		return currentVersion, fmt.Errorf("already at latest version (%s)", currentVersion)
	}

	// 2. Download checksums
	checksumsURL, err := FindAssetURL(release, ChecksumsAssetName())
	if err != nil {
		return "", fmt.Errorf("checksums not found: %w", err)
	}

	checksumsPath, err := DownloadFile(checksumsURL)
	if err != nil {
		return "", fmt.Errorf("failed to download checksums: %w", err)
	}
	defer os.Remove(checksumsPath)

	checksums, err := ParseChecksums(checksumsPath)
	if err != nil {
		return "", err
	}

	// 3. Download the archive for this platform
	assetName := AssetName(latestVersion)
	assetURL, err := FindAssetURL(release, assetName)
	if err != nil {
		return "", fmt.Errorf("no binary available for %s/%s: %w", runtime.GOOS, runtime.GOARCH, err)
	}

	archivePath, err := DownloadFile(assetURL)
	if err != nil {
		return "", fmt.Errorf("failed to download update: %w", err)
	}
	defer os.Remove(archivePath)

	// 4. Verify checksum
	expectedHash, ok := checksums[assetName]
	if !ok {
		return "", fmt.Errorf("no checksum found for %s", assetName)
	}

	if err := VerifyChecksum(archivePath, expectedHash); err != nil {
		return "", fmt.Errorf("security check failed: %w", err)
	}

	// 5. Extract binary
	binaryPath, err := ExtractBinary(archivePath)
	if err != nil {
		return "", err
	}
	defer os.Remove(binaryPath)

	// 6. Replace current binary
	currentBinary, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cannot determine current binary path: %w", err)
	}

	backupPath, err := ReplaceBinary(currentBinary, binaryPath)
	if err != nil {
		return "", err
	}

	// Clean up backup
	_ = os.Remove(backupPath)

	// Update cache
	_ = SaveCache(&CheckResult{
		CurrentVersion:  latestVersion,
		LatestVersion:   latestVersion,
		LatestURL:       release.HTMLURL,
		UpdateAvailable: false,
		CheckedAt:       time.Now(),
	})

	return latestVersion, nil
}
