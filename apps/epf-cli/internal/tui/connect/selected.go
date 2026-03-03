// Selected screen: displays instance details and MCP config snippet.
//
// Shows the selected workspace's instance path, product name, and generates
// a ready-to-paste MCP config snippet for OpenCode, Cursor, or Claude.
// Offers copy-to-clipboard functionality.
package connect

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	tea "charm.land/bubbletea/v2"
)

// --- Messages ---

// clipboardMsg is sent after a clipboard operation.
type clipboardMsg struct {
	err error
}

// --- Selected screen model ---

// SelectedScreen holds the state for the selected screen.
type SelectedScreen struct {
	serverURL string
	workspace WorkspaceInfo
	username  string
	token     string
	styles    Styles
	copied    bool
	copyErr   string
}

// NewSelectedScreen creates a new selected screen.
func NewSelectedScreen(serverURL string, workspace WorkspaceInfo, username, token string, styles Styles) SelectedScreen {
	return SelectedScreen{
		serverURL: serverURL,
		workspace: workspace,
		username:  username,
		token:     token,
		styles:    styles,
	}
}

// Init does nothing — the selected screen is static.
func (s SelectedScreen) Init() tea.Cmd {
	return nil
}

// Update handles messages for the selected screen.
func (s SelectedScreen) Update(msg tea.Msg) (SelectedScreen, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return s, tea.Quit
		case "c":
			return s, s.copyToClipboard()
		}

	case clipboardMsg:
		if msg.err != nil {
			s.copyErr = msg.err.Error()
		} else {
			s.copied = true
		}
	}

	return s, nil
}

func (s SelectedScreen) copyToClipboard() tea.Cmd {
	snippet := s.configSnippet()
	return func() tea.Msg {
		err := writeClipboard(snippet)
		return clipboardMsg{err: err}
	}
}

// View renders the selected screen.
func (s SelectedScreen) View() string {
	var b strings.Builder

	b.WriteString(s.styles.Title.Render("Connected"))
	b.WriteString("\n\n")

	// Workspace details.
	name := s.workspace.ProductName
	if name == "" {
		name = s.workspace.Repo
	}

	b.WriteString(s.styles.Success.Render(fmt.Sprintf("  Workspace: %s", name)))
	b.WriteString("\n\n")

	b.WriteString(fmt.Sprintf("  Instance:  %s\n", s.workspace.InstancePath))
	b.WriteString(fmt.Sprintf("  Server:    %s\n", s.serverURL))
	if s.username != "" && s.username != "(token)" {
		b.WriteString(fmt.Sprintf("  User:      %s\n", s.username))
	}

	b.WriteString("\n")

	// MCP config snippet.
	b.WriteString(s.styles.Subtitle.Render("  MCP Configuration"))
	b.WriteString("\n\n")
	b.WriteString(s.styles.Dim.Render("  Add this to your AI tool's MCP config:"))
	b.WriteString("\n\n")

	snippet := s.configSnippet()
	// Indent each line of the snippet.
	for _, line := range strings.Split(snippet, "\n") {
		b.WriteString(fmt.Sprintf("    %s\n", s.styles.Dim.Render(line)))
	}

	b.WriteString("\n")

	if s.copied {
		b.WriteString(s.styles.Success.Render("  Copied to clipboard!"))
		b.WriteString("\n\n")
	} else if s.copyErr != "" {
		b.WriteString(s.styles.Error.Render(fmt.Sprintf("  Copy failed: %s", s.copyErr)))
		b.WriteString("\n\n")
	}

	b.WriteString(s.styles.Help.Render("  c: copy config  q: quit"))

	return b.String()
}

// configSnippet generates the MCP config for the selected workspace.
func (s SelectedScreen) configSnippet() string {
	// Generate an opencode.jsonc-style config snippet.
	return fmt.Sprintf(`"epf-remote": {
  "type": "remote",
  "url": "%s/mcp",
  "headers": {
    "Authorization": "Bearer %s"
  }
}`, s.serverURL, s.token)
}

// Workspace returns the selected workspace.
func (s SelectedScreen) Workspace() WorkspaceInfo {
	return s.workspace
}

// writeClipboard writes text to the system clipboard.
func writeClipboard(text string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("pbcopy")
	case "linux":
		// Try xclip first, then xsel.
		if _, err := exec.LookPath("xclip"); err == nil {
			cmd = exec.Command("xclip", "-selection", "clipboard")
		} else if _, err := exec.LookPath("xsel"); err == nil {
			cmd = exec.Command("xsel", "--clipboard", "--input")
		} else {
			return fmt.Errorf("xclip or xsel not found")
		}
	case "windows":
		cmd = exec.Command("clip")
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	cmd.Stdin = strings.NewReader(text)
	return cmd.Run()
}
