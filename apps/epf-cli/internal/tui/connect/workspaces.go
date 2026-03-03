// Workspaces screen: lists accessible EPF workspaces with arrow-key navigation.
//
// Fetches workspaces from GET /workspaces and displays them in a navigable
// list. The user selects a workspace with Enter, which transitions to the
// selected screen.
//
// Auto-selects if only one workspace is available.
package connect

import (
	"context"
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
)

// isAuthExpiredError checks if an error indicates an expired/invalid token.
func isAuthExpiredError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "authentication expired")
}

// --- Messages ---

// workspacesMsg is sent when workspace discovery completes.
type workspacesMsg struct {
	workspaces []WorkspaceInfo
	err        error
}

// --- Workspaces screen model ---

// WorkspacesScreen holds the state for the workspaces screen.
type WorkspacesScreen struct {
	serverURL   string
	token       string
	styles      Styles
	loading     bool
	workspaces  []WorkspaceInfo
	cursor      int
	err         error
	authExpired bool
}

// NewWorkspacesScreen creates a new workspaces screen.
func NewWorkspacesScreen(serverURL, token string, styles Styles) WorkspacesScreen {
	return WorkspacesScreen{
		serverURL: serverURL,
		token:     token,
		loading:   true,
		styles:    styles,
	}
}

// Init starts fetching workspaces.
func (s WorkspacesScreen) Init() tea.Cmd {
	url := s.serverURL
	tok := s.token
	return func() tea.Msg {
		ws, err := FetchWorkspaces(context.Background(), url, tok)
		return workspacesMsg{workspaces: ws, err: err}
	}
}

// Update handles messages for the workspaces screen.
func (s WorkspacesScreen) Update(msg tea.Msg) (WorkspacesScreen, tea.Cmd) {
	switch msg := msg.(type) {
	case workspacesMsg:
		s.loading = false
		s.workspaces = msg.workspaces
		s.err = msg.err
		s.authExpired = msg.err != nil && isAuthExpiredError(msg.err)

	case tea.KeyPressMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return s, tea.Quit
		case "up", "k":
			if s.cursor > 0 {
				s.cursor--
			}
		case "down", "j":
			if s.cursor < len(s.workspaces)-1 {
				s.cursor++
			}
		case "enter":
			// Selection handled by root model checking SelectedWorkspace().
		}
	}

	return s, nil
}

// View renders the workspaces screen.
func (s WorkspacesScreen) View() string {
	var b strings.Builder

	b.WriteString(s.styles.Title.Render("Workspaces"))
	b.WriteString("\n\n")

	if s.loading {
		b.WriteString("  Discovering workspaces...\n")
		b.WriteString(s.styles.Dim.Render("  Scanning your GitHub repos for EPF instances (this may take a minute)"))
		return b.String()
	}

	if s.err != nil {
		b.WriteString(s.styles.Error.Render("  Failed to load workspaces"))
		b.WriteString("\n")
		b.WriteString(s.styles.Dim.Render(fmt.Sprintf("  %v", s.err)))
		b.WriteString("\n\n")
		b.WriteString(s.styles.Help.Render("  Press q to quit."))
		return b.String()
	}

	if len(s.workspaces) == 0 {
		b.WriteString(s.styles.Warning.Render("  No EPF workspaces found"))
		b.WriteString("\n\n")
		b.WriteString(s.styles.Dim.Render("  Your GitHub account has no repositories with EPF instances."))
		b.WriteString("\n")
		b.WriteString(s.styles.Dim.Render("  Initialize one with: epf-cli init"))
		b.WriteString("\n\n")
		b.WriteString(s.styles.Help.Render("  Press q to quit."))
		return b.String()
	}

	b.WriteString(fmt.Sprintf("  %s\n\n",
		s.styles.Dim.Render(fmt.Sprintf("%d workspace(s) found", len(s.workspaces)))))

	for i, ws := range s.workspaces {
		cursor := "  "
		style := s.styles.Normal
		if i == s.cursor {
			cursor = s.styles.Cursor.Render("> ")
			style = s.styles.Selected
		}

		name := ws.ProductName
		if name == "" {
			name = ws.Repo
		}

		label := fmt.Sprintf("%s/%s", ws.Owner, ws.Repo)
		if ws.Private {
			label += " (private)"
		}

		b.WriteString(fmt.Sprintf("  %s%s\n", cursor, style.Render(name)))
		b.WriteString(fmt.Sprintf("      %s\n", s.styles.Dim.Render(label)))
		if ws.Description != "" {
			b.WriteString(fmt.Sprintf("      %s\n", s.styles.Dim.Render(ws.Description)))
		}
	}

	b.WriteString("\n")
	b.WriteString(s.styles.Help.Render("  up/down: select  enter: confirm  q: quit"))

	return b.String()
}

// IsLoading returns true if workspaces are being fetched.
func (s WorkspacesScreen) IsLoading() bool {
	return s.loading
}

// HasError returns true if workspace discovery failed.
func (s WorkspacesScreen) HasError() bool {
	return s.err != nil
}

// HasWorkspaces returns true if workspaces are loaded and non-empty.
func (s WorkspacesScreen) HasWorkspaces() bool {
	return !s.loading && s.err == nil && len(s.workspaces) > 0
}

// WorkspaceCount returns the number of discovered workspaces.
func (s WorkspacesScreen) WorkspaceCount() int {
	return len(s.workspaces)
}

// SelectedWorkspace returns the currently highlighted workspace, or nil.
func (s WorkspacesScreen) SelectedWorkspace() *WorkspaceInfo {
	if s.loading || s.err != nil || len(s.workspaces) == 0 {
		return nil
	}
	if s.cursor < 0 || s.cursor >= len(s.workspaces) {
		return nil
	}
	ws := s.workspaces[s.cursor]
	return &ws
}

// IsAuthExpired returns true if the workspace fetch failed due to an expired token.
func (s WorkspacesScreen) IsAuthExpired() bool {
	return s.authExpired
}

// AutoSelected returns the workspace if exactly one exists (auto-select).
func (s WorkspacesScreen) AutoSelected() *WorkspaceInfo {
	if !s.loading && s.err == nil && len(s.workspaces) == 1 {
		ws := s.workspaces[0]
		return &ws
	}
	return nil
}
