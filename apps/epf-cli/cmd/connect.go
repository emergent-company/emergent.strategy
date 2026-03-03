package cmd

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/tui/connect"
	"github.com/spf13/cobra"
)

var connectCmd = &cobra.Command{
	Use:   "connect <server-url>",
	Short: "Connect to a remote EPF server (interactive TUI)",
	Long: `Connect to a remote EPF server using an interactive terminal UI.

The connect command guides you through:
  1. Checking the server is reachable
  2. Authenticating (if needed)
  3. Selecting a workspace
  4. Getting a ready-to-paste MCP config snippet

If you've already authenticated, the stored credentials are reused
and the authentication step is skipped.

EXAMPLES:

  # Connect to a server
  epf-cli connect https://epf.emergent.so

  # Connect to localhost (development)
  epf-cli connect http://localhost:8080`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		serverURL := strings.TrimRight(args[0], "/")
		return runConnect(serverURL)
	},
}

func runConnect(serverURL string) error {
	// Load existing credentials from the token store.
	store := auth.NewTokenStore()
	cfg := connect.Config{
		ServerURL:  serverURL,
		TokenStore: store,
	}

	entry, err := store.Get(serverURL)
	if err == nil && entry != nil && entry.Token != "" {
		cfg.ExistingToken = entry.Token
		cfg.ExistingUsername = entry.Username
		cfg.ExistingUserID = entry.UserID
		cfg.ExistingInstancePath = entry.InstancePath
	}

	// Create and run the Bubble Tea program.
	m := connect.New(cfg)
	p := tea.NewProgram(m)

	if _, err := p.Run(); err != nil {
		return fmt.Errorf("connect TUI error: %w", err)
	}

	return nil
}

func init() {
	rootCmd.AddCommand(connectCmd)
}
