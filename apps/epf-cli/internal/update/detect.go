package update

import (
	"os"
	"path/filepath"
	"strings"
)

// InstallMethod represents how epf-cli was installed.
type InstallMethod int

const (
	// InstallUnknown means the install method could not be determined.
	InstallUnknown InstallMethod = iota

	// InstallHomebrew means the binary was installed via Homebrew.
	InstallHomebrew

	// InstallStandalone means the binary was downloaded directly or built from source.
	InstallStandalone
)

// String returns a human-readable description of the install method.
func (m InstallMethod) String() string {
	switch m {
	case InstallHomebrew:
		return "homebrew"
	case InstallStandalone:
		return "standalone"
	default:
		return "unknown"
	}
}

// DetectInstallMethod determines how the current binary was installed.
// It checks if the binary path is under a Homebrew Cellar directory.
func DetectInstallMethod() InstallMethod {
	execPath, err := os.Executable()
	if err != nil {
		return InstallUnknown
	}

	// Resolve symlinks (Homebrew uses symlinks from /opt/homebrew/bin/ → Cellar/)
	realPath, err := filepath.EvalSymlinks(execPath)
	if err != nil {
		realPath = execPath
	}

	// Check for Homebrew Cellar paths
	// macOS Intel: /usr/local/Cellar/
	// macOS ARM: /opt/homebrew/Cellar/
	// Linux: /home/linuxbrew/.linuxbrew/Cellar/
	if strings.Contains(realPath, "/Cellar/") {
		return InstallHomebrew
	}

	// Also check if binary is in a Homebrew bin directory (linked formula)
	if strings.Contains(realPath, "/homebrew/") || strings.Contains(realPath, "/linuxbrew/") {
		return InstallHomebrew
	}

	return InstallStandalone
}

// IsHomebrew returns true if epf-cli was installed via Homebrew.
func IsHomebrew() bool {
	return DetectInstallMethod() == InstallHomebrew
}
