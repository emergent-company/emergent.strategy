// Root Model for the Connect TUI.
//
// Composes the four screens (connect, authenticate, workspaces, selected)
// and handles transitions between them. Implements the Bubble Tea Model
// interface (Init, Update, View).
//
// Screen transitions:
//
//	Connect → (health OK + no token) → Authenticate
//	Connect → (health OK + has token) → Workspaces
//	Authenticate → (auth success) → Workspaces
//	Workspaces → (selection or auto-select) → Selected
//	Selected → (quit)
package connect

import (
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
)

// Config holds configuration for the Connect TUI.
type Config struct {
	// ServerURL is the EPF server URL to connect to.
	ServerURL string

	// TokenStore is the local credential store (nil = use default).
	TokenStore *auth.TokenStore

	// ExistingToken is a pre-loaded token from the store (empty = none).
	ExistingToken string

	// ExistingUsername is the username from the stored token.
	ExistingUsername string

	// ExistingUserID is the user ID from the stored token.
	ExistingUserID int64

	// ExistingInstancePath is the previously selected workspace.
	ExistingInstancePath string
}

// Model is the root Bubble Tea model for the Connect TUI.
type Model struct {
	config Config
	styles Styles
	screen Screen

	// Sub-screens.
	connect    ConnectScreen
	auth       AuthScreen
	workspaces WorkspacesScreen
	selected   SelectedScreen

	// Shared state.
	token    string
	username string
	userID   int64

	// quitting is set when the user presses q or ctrl+c.
	quitting bool
}

// New creates a new Connect TUI model.
func New(cfg Config) Model {
	styles := DefaultStyles()

	m := Model{
		config:  cfg,
		styles:  styles,
		screen:  ScreenConnect,
		connect: NewConnectScreen(cfg.ServerURL, styles),
	}

	// Pre-fill credentials if we have a stored token.
	if cfg.ExistingToken != "" {
		m.token = cfg.ExistingToken
		m.username = cfg.ExistingUsername
		m.userID = cfg.ExistingUserID
	}

	return m
}

// Init starts the TUI by initializing the connect screen.
func (m Model) Init() tea.Cmd {
	return m.connect.Init()
}

// Update handles all messages and screen transitions.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Global key handling.
	if keyMsg, ok := msg.(tea.KeyPressMsg); ok {
		if keyMsg.String() == "ctrl+c" {
			m.quitting = true
			return m, tea.Quit
		}
	}

	switch m.screen {
	case ScreenConnect:
		return m.updateConnect(msg)
	case ScreenAuth:
		return m.updateAuth(msg)
	case ScreenWorkspaces:
		return m.updateWorkspaces(msg)
	case ScreenSelected:
		return m.updateSelected(msg)
	}

	return m, nil
}

func (m Model) updateConnect(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	m.connect, cmd = m.connect.Update(msg)

	// Check for transition.
	if m.connect.IsConnected() {
		if m.token != "" {
			// Have a token — skip auth, go to workspaces.
			return m.transitionToWorkspaces()
		}
		// No token — go to auth.
		return m.transitionToAuth()
	}

	return m, cmd
}

func (m Model) updateAuth(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	m.auth, cmd = m.auth.Update(msg)

	// Check for transition.
	if m.auth.IsComplete() && !m.auth.HasError() {
		m.token = m.auth.Token()
		m.username = m.auth.Username()
		m.userID = m.auth.UserID()

		// Store credentials.
		m.storeCredentials()

		return m.transitionToWorkspaces()
	}

	return m, cmd
}

func (m Model) updateWorkspaces(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	m.workspaces, cmd = m.workspaces.Update(msg)

	// Auto-select if only one workspace.
	if ws := m.workspaces.AutoSelected(); ws != nil {
		return m.transitionToSelected(*ws)
	}

	// Check for manual selection via Enter.
	if keyMsg, ok := msg.(tea.KeyPressMsg); ok && keyMsg.String() == "enter" {
		if ws := m.workspaces.SelectedWorkspace(); ws != nil {
			return m.transitionToSelected(*ws)
		}
	}

	return m, cmd
}

func (m Model) updateSelected(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	m.selected, cmd = m.selected.Update(msg)
	return m, cmd
}

// --- Screen transitions ---

func (m Model) transitionToAuth() (tea.Model, tea.Cmd) {
	m.screen = ScreenAuth
	m.auth = NewAuthScreen(m.config.ServerURL, m.styles)
	cmd := m.auth.Init()
	return m, cmd
}

func (m Model) transitionToWorkspaces() (tea.Model, tea.Cmd) {
	m.screen = ScreenWorkspaces
	m.workspaces = NewWorkspacesScreen(m.config.ServerURL, m.token, m.styles)
	cmd := m.workspaces.Init()
	return m, cmd
}

func (m Model) transitionToSelected(ws WorkspaceInfo) (tea.Model, tea.Cmd) {
	m.screen = ScreenSelected
	m.selected = NewSelectedScreen(m.config.ServerURL, ws, m.username, m.token, m.styles)

	// Store the selected instance path.
	m.storeInstancePath(ws.InstancePath)

	cmd := m.selected.Init()
	return m, cmd
}

// --- Credential management ---

func (m Model) storeCredentials() {
	store := m.config.TokenStore
	if store == nil {
		store = auth.NewTokenStore()
	}

	entry := &auth.TokenStoreEntry{
		Token:           m.token,
		Username:        m.username,
		UserID:          m.userID,
		AuthenticatedAt: time.Now(),
	}

	// Best-effort store — don't fail the TUI if storage fails.
	_ = store.Set(m.config.ServerURL, entry)
}

func (m Model) storeInstancePath(instancePath string) {
	store := m.config.TokenStore
	if store == nil {
		store = auth.NewTokenStore()
	}

	// Best-effort update.
	_ = store.SetInstancePath(m.config.ServerURL, instancePath)
}

// View renders the current screen.
func (m Model) View() tea.View {
	if m.quitting {
		return tea.NewView("")
	}

	var content string
	switch m.screen {
	case ScreenConnect:
		content = m.connect.View()
	case ScreenAuth:
		content = m.auth.View()
	case ScreenWorkspaces:
		content = m.workspaces.View()
	case ScreenSelected:
		content = m.selected.View()
	}

	return tea.NewView(content + "\n")
}

// Screen returns the current screen.
func (m Model) Screen() Screen {
	return m.screen
}
