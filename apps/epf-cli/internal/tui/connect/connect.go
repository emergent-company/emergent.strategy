// Connect screen: checks server health and displays server info.
//
// This is the first screen the user sees. It makes a GET /health request
// to verify the server is reachable and displays the server's mode, version,
// and name. On success, it transitions to the auth screen (if no stored token)
// or the workspaces screen (if already authenticated).
package connect

import (
	"context"
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
)

// --- Messages ---

// healthCheckMsg is sent when the health check completes.
type healthCheckMsg struct {
	info *ServerInfo
	err  error
}

// --- Connect screen model ---

// ConnectScreen holds the state for the connect screen.
type ConnectScreen struct {
	serverURL string
	loading   bool
	info      *ServerInfo
	err       error
	styles    Styles
}

// NewConnectScreen creates a new connect screen.
func NewConnectScreen(serverURL string, styles Styles) ConnectScreen {
	return ConnectScreen{
		serverURL: serverURL,
		loading:   true,
		styles:    styles,
	}
}

// Init starts the health check.
func (s ConnectScreen) Init() tea.Cmd {
	url := s.serverURL
	return func() tea.Msg {
		info, err := CheckHealth(context.Background(), url)
		return healthCheckMsg{info: info, err: err}
	}
}

// Update handles messages for the connect screen.
func (s ConnectScreen) Update(msg tea.Msg) (ConnectScreen, tea.Cmd) {
	switch msg := msg.(type) {
	case healthCheckMsg:
		s.loading = false
		s.info = msg.info
		s.err = msg.err

	case tea.KeyPressMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return s, tea.Quit
		}
	}

	return s, nil
}

// View renders the connect screen.
func (s ConnectScreen) View() string {
	var b strings.Builder

	b.WriteString(s.styles.Title.Render("EPF Connect"))
	b.WriteString("\n\n")

	b.WriteString(s.styles.Dim.Render("Server: "))
	b.WriteString(s.serverURL)
	b.WriteString("\n\n")

	if s.loading {
		b.WriteString("  Checking server health...")
		return b.String()
	}

	if s.err != nil {
		b.WriteString(s.styles.Error.Render("  Connection failed"))
		b.WriteString("\n")
		b.WriteString(s.styles.Dim.Render(fmt.Sprintf("  %v", s.err)))
		b.WriteString("\n\n")
		b.WriteString(s.styles.Help.Render("  Press q to quit."))
		return b.String()
	}

	// Server info.
	b.WriteString(s.styles.Success.Render("  Connected"))
	b.WriteString("\n\n")

	if s.info.ServerName != "" {
		b.WriteString(fmt.Sprintf("  Name:    %s\n", s.info.ServerName))
	}
	if s.info.Version != "" {
		b.WriteString(fmt.Sprintf("  Version: %s\n", s.info.Version))
	}
	if s.info.Mode != "" {
		b.WriteString(fmt.Sprintf("  Mode:    %s\n", s.info.Mode))
	}

	return b.String()
}

// IsLoading returns true if the health check is in progress.
func (s ConnectScreen) IsLoading() bool {
	return s.loading
}

// HasError returns true if the health check failed.
func (s ConnectScreen) HasError() bool {
	return s.err != nil
}

// IsConnected returns true if the health check succeeded.
func (s ConnectScreen) IsConnected() bool {
	return !s.loading && s.err == nil && s.info != nil
}

// ServerInfo returns the server info (nil if not connected).
func (s ConnectScreen) Info() *ServerInfo {
	return s.info
}
