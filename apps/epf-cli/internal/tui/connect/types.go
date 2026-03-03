// Package connect provides the interactive Connect TUI for epf-cli.
//
// The TUI guides users through connecting to a remote EPF server:
// connect → authenticate → select workspace → get config snippet.
//
// Built on Bubble Tea v2's Elm Architecture (Model → Update → View).
package connect

import (
	"charm.land/lipgloss/v2"
)

// Screen represents the current TUI screen.
type Screen int

const (
	// ScreenConnect checks server health and displays server info.
	ScreenConnect Screen = iota
	// ScreenAuth presents authentication method selection.
	ScreenAuth
	// ScreenWorkspaces lists accessible EPF workspaces.
	ScreenWorkspaces
	// ScreenSelected displays instance details and config snippet.
	ScreenSelected
)

// AuthMethod represents the authentication method chosen by the user.
type AuthMethod int

const (
	// AuthDeviceFlow uses GitHub Device Flow (recommended).
	AuthDeviceFlow AuthMethod = iota
	// AuthPAT uses a pasted GitHub Personal Access Token.
	AuthPAT
	// AuthJWT uses an existing server JWT.
	AuthJWT
)

// ServerInfo holds information from the /health endpoint.
type ServerInfo struct {
	Status       string `json:"status"`
	Uptime       string `json:"uptime"`
	ServerName   string `json:"server_name"`
	Version      string `json:"version"`
	Mode         string `json:"mode"`
	InstanceName string `json:"instance_name"`
}

// WorkspaceInfo holds a discovered EPF workspace.
type WorkspaceInfo struct {
	Owner        string `json:"owner"`
	Repo         string `json:"repo"`
	InstancePath string `json:"instance_path"`
	ProductName  string `json:"product_name"`
	Description  string `json:"description"`
	Private      bool   `json:"private"`
}

// Styles holds the TUI styling configuration.
type Styles struct {
	Title     lipgloss.Style
	Subtitle  lipgloss.Style
	Normal    lipgloss.Style
	Dim       lipgloss.Style
	Success   lipgloss.Style
	Error     lipgloss.Style
	Warning   lipgloss.Style
	Selected  lipgloss.Style
	Cursor    lipgloss.Style
	Code      lipgloss.Style
	Help      lipgloss.Style
	StatusBar lipgloss.Style
	Box       lipgloss.Style
}

// DefaultStyles returns the default TUI styles.
func DefaultStyles() Styles {
	return Styles{
		Title:     lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7C3AED")),
		Subtitle:  lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#A78BFA")),
		Normal:    lipgloss.NewStyle(),
		Dim:       lipgloss.NewStyle().Foreground(lipgloss.Color("#6B7280")),
		Success:   lipgloss.NewStyle().Foreground(lipgloss.Color("#10B981")),
		Error:     lipgloss.NewStyle().Foreground(lipgloss.Color("#EF4444")),
		Warning:   lipgloss.NewStyle().Foreground(lipgloss.Color("#F59E0B")),
		Selected:  lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7C3AED")),
		Cursor:    lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7C3AED")),
		Code:      lipgloss.NewStyle().Foreground(lipgloss.Color("#A78BFA")).Background(lipgloss.Color("#1F2937")).Padding(0, 1),
		Help:      lipgloss.NewStyle().Foreground(lipgloss.Color("#6B7280")),
		StatusBar: lipgloss.NewStyle().Foreground(lipgloss.Color("#9CA3AF")),
		Box: lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#374151")).
			Padding(1, 2),
	}
}
