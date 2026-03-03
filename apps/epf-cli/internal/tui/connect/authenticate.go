// Authenticate screen: presents auth method selection and runs the chosen flow.
//
// Three authentication methods:
//  1. Login with GitHub (Device Flow) — recommended, zero-config
//  2. Paste a GitHub Personal Access Token
//  3. Paste an existing server JWT
//
// All three result in a valid server session JWT.
package connect

import (
	"context"
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
)

// --- Messages ---

// authSuccessMsg is sent when authentication succeeds.
type authSuccessMsg struct {
	token    string
	username string
	userID   int64
}

// authErrorMsg is sent when authentication fails.
type authErrorMsg struct {
	err error
}

// deviceCodeMsg is sent when a device code is received from GitHub.
type deviceCodeMsg struct {
	code *auth.DeviceCodeResponse
	err  error
}

// deviceTokenMsg is sent when the Device Flow completes.
type deviceTokenMsg struct {
	result *auth.DeviceFlowResult
	err    error
}

// --- Auth screen model ---

// AuthScreen holds the state for the authentication screen.
type AuthScreen struct {
	serverURL   string
	styles      Styles
	cursor      int
	methods     []string
	methodDescs []string

	// State machine.
	phase    authPhase
	input    string // Text input for PAT or JWT.
	inputErr string // Validation error on the text input.

	// Device Flow state.
	deviceCode    string
	deviceURL     string
	devicePolling bool

	// Auth result (when phase == authDone).
	token    string
	username string
	userID   int64
	err      error
}

type authPhase int

const (
	authChoose authPhase = iota // Choosing auth method.
	authInput                   // Typing PAT or JWT.
	authWait                    // Waiting for Device Flow or server exchange.
	authDone                    // Authentication complete (success or error).
)

// NewAuthScreen creates a new authentication screen.
func NewAuthScreen(serverURL string, styles Styles) AuthScreen {
	return AuthScreen{
		serverURL: serverURL,
		styles:    styles,
		methods: []string{
			"Login with GitHub",
			"Paste a GitHub PAT",
			"Paste a server token",
		},
		methodDescs: []string{
			"Device Flow — recommended, zero-config",
			"GitHub Personal Access Token",
			"Existing JWT from browser OAuth",
		},
	}
}

// Init does nothing — the auth screen waits for user input.
func (s AuthScreen) Init() tea.Cmd {
	return nil
}

// Update handles messages for the auth screen.
func (s AuthScreen) Update(msg tea.Msg) (AuthScreen, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		return s.handleKey(msg)

	case deviceCodeMsg:
		if msg.err != nil {
			s.phase = authDone
			s.err = msg.err
			return s, nil
		}
		s.deviceCode = msg.code.UserCode
		s.deviceURL = msg.code.VerificationURI
		s.devicePolling = true
		// Open browser and start polling.
		return s, s.pollDeviceFlow(msg.code)

	case deviceTokenMsg:
		s.devicePolling = false
		if msg.err != nil {
			s.phase = authDone
			s.err = msg.err
			return s, nil
		}
		// Exchange GitHub token with server.
		s.phase = authWait
		return s, s.exchangeToken(msg.result.AccessToken)

	case authSuccessMsg:
		s.phase = authDone
		s.token = msg.token
		s.username = msg.username
		s.userID = msg.userID
		return s, nil

	case authErrorMsg:
		s.phase = authDone
		s.err = msg.err
		return s, nil
	}

	return s, nil
}

func (s AuthScreen) handleKey(msg tea.KeyPressMsg) (AuthScreen, tea.Cmd) {
	key := msg.String()

	// Global quit.
	if key == "ctrl+c" {
		return s, tea.Quit
	}

	switch s.phase {
	case authChoose:
		switch key {
		case "q":
			return s, tea.Quit
		case "up", "k":
			if s.cursor > 0 {
				s.cursor--
			}
		case "down", "j":
			if s.cursor < len(s.methods)-1 {
				s.cursor++
			}
		case "enter":
			return s.selectMethod()
		}

	case authInput:
		switch key {
		case "esc", "escape":
			// Go back to method selection.
			s.phase = authChoose
			s.input = ""
			s.inputErr = ""
		case "enter":
			return s.submitInput()
		case "backspace":
			if len(s.input) > 0 {
				s.input = s.input[:len(s.input)-1]
			}
			s.inputErr = ""
		default:
			// Only accept printable, single-rune keys.
			if len(key) == 1 {
				s.input += key
				s.inputErr = ""
			}
		}
	}

	return s, nil
}

func (s AuthScreen) selectMethod() (AuthScreen, tea.Cmd) {
	switch AuthMethod(s.cursor) {
	case AuthDeviceFlow:
		s.phase = authWait
		return s, s.startDeviceFlow()
	case AuthPAT:
		s.phase = authInput
		s.input = ""
		return s, nil
	case AuthJWT:
		s.phase = authInput
		s.input = ""
		return s, nil
	}
	return s, nil
}

func (s AuthScreen) submitInput() (AuthScreen, tea.Cmd) {
	input := strings.TrimSpace(s.input)
	if input == "" {
		s.inputErr = "input cannot be empty"
		return s, nil
	}

	switch AuthMethod(s.cursor) {
	case AuthPAT:
		// Exchange PAT with server.
		s.phase = authWait
		return s, s.exchangeToken(input)
	case AuthJWT:
		// Validate JWT by calling /workspaces.
		s.phase = authWait
		return s, s.validateAndUseJWT(input)
	}

	return s, nil
}

// --- Commands ---

func (s AuthScreen) startDeviceFlow() tea.Cmd {
	return func() tea.Msg {
		client := auth.NewDeviceFlowClient(auth.DeviceFlowConfig{})
		code, err := client.RequestDeviceCode(context.Background())
		return deviceCodeMsg{code: code, err: err}
	}
}

func (s AuthScreen) pollDeviceFlow(code *auth.DeviceCodeResponse) tea.Cmd {
	return func() tea.Msg {
		// Open browser (best-effort).
		_ = openBrowserURL(code.VerificationURI)

		client := auth.NewDeviceFlowClient(auth.DeviceFlowConfig{})
		result, err := client.PollForToken(context.Background(), code.DeviceCode, code.Interval)
		return deviceTokenMsg{result: result, err: err}
	}
}

func (s AuthScreen) exchangeToken(githubToken string) tea.Cmd {
	url := s.serverURL
	return func() tea.Msg {
		token, username, userID, err := ExchangeGitHubToken(context.Background(), url, githubToken)
		if err != nil {
			return authErrorMsg{err: err}
		}
		return authSuccessMsg{token: token, username: username, userID: userID}
	}
}

func (s AuthScreen) validateAndUseJWT(jwt string) tea.Cmd {
	url := s.serverURL
	return func() tea.Msg {
		err := ValidateToken(context.Background(), url, jwt)
		if err != nil {
			return authErrorMsg{err: fmt.Errorf("invalid token: %w", err)}
		}
		// We don't know username/userID from a raw JWT, but the token works.
		return authSuccessMsg{token: jwt, username: "(token)", userID: 0}
	}
}

// View renders the auth screen.
func (s AuthScreen) View() string {
	var b strings.Builder

	b.WriteString(s.styles.Title.Render("Authenticate"))
	b.WriteString("\n\n")

	switch s.phase {
	case authChoose:
		b.WriteString("  Choose an authentication method:\n\n")
		for i, method := range s.methods {
			cursor := "  "
			style := s.styles.Normal
			if i == s.cursor {
				cursor = s.styles.Cursor.Render("> ")
				style = s.styles.Selected
			}
			b.WriteString(fmt.Sprintf("  %s%s\n", cursor, style.Render(method)))
			b.WriteString(fmt.Sprintf("      %s\n", s.styles.Dim.Render(s.methodDescs[i])))
		}
		b.WriteString("\n")
		b.WriteString(s.styles.Help.Render("  up/down: select  enter: confirm  q: quit"))

	case authInput:
		label := "GitHub PAT"
		if AuthMethod(s.cursor) == AuthJWT {
			label = "Server JWT"
		}
		b.WriteString(fmt.Sprintf("  Paste your %s:\n\n", label))
		// Mask the input for security.
		masked := strings.Repeat("*", len(s.input))
		if len(masked) == 0 {
			masked = s.styles.Dim.Render("(type or paste your token)")
		}
		b.WriteString(fmt.Sprintf("  > %s\n", masked))
		if s.inputErr != "" {
			b.WriteString(fmt.Sprintf("\n  %s\n", s.styles.Error.Render(s.inputErr)))
		}
		b.WriteString("\n")
		b.WriteString(s.styles.Help.Render("  enter: submit  escape: back  ctrl+c: quit"))

	case authWait:
		if s.deviceCode != "" && s.devicePolling {
			b.WriteString("  Open this URL in your browser:\n\n")
			b.WriteString(fmt.Sprintf("    %s\n\n", s.styles.Subtitle.Render(s.deviceURL)))
			b.WriteString("  Enter this code:\n\n")
			b.WriteString(fmt.Sprintf("    %s\n\n", s.styles.Code.Render(s.deviceCode)))
			b.WriteString(s.styles.Dim.Render("  Waiting for authorization..."))
		} else {
			b.WriteString("  Authenticating...")
		}

	case authDone:
		if s.err != nil {
			b.WriteString(s.styles.Error.Render("  Authentication failed"))
			b.WriteString("\n")
			b.WriteString(s.styles.Dim.Render(fmt.Sprintf("  %v", s.err)))
		} else {
			b.WriteString(s.styles.Success.Render(fmt.Sprintf("  Authenticated as %s", s.username)))
		}
	}

	return b.String()
}

// IsComplete returns true if authentication is done (success or error).
func (s AuthScreen) IsComplete() bool {
	return s.phase == authDone
}

// HasError returns true if authentication failed.
func (s AuthScreen) HasError() bool {
	return s.phase == authDone && s.err != nil
}

// Token returns the session JWT (empty if not authenticated).
func (s AuthScreen) Token() string {
	return s.token
}

// Username returns the authenticated username.
func (s AuthScreen) Username() string {
	return s.username
}

// UserID returns the authenticated user ID.
func (s AuthScreen) UserID() int64 {
	return s.userID
}
