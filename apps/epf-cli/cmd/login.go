package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
	"github.com/spf13/cobra"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with a remote EPF server using GitHub Device Flow",
	Long: `Authenticate with a remote EPF server using GitHub's Device Flow.

This command initiates a Device Flow login: it displays a verification code
and URL, waits for you to authorize in your browser, then exchanges the
GitHub token for a server session JWT and stores it locally.

The stored credentials are used by subsequent 'epf-cli connect' commands
to skip the authentication step.

EXAMPLES:

  # Login to a specific server
  epf-cli login --server https://epf.emergent.so

  # Login with a custom OAuth App client ID
  epf-cli login --server https://epf.example.com --device-client-id Ov23...

  # Login to localhost (development)
  epf-cli login --server http://localhost:8080`,
	RunE: func(cmd *cobra.Command, args []string) error {
		serverURL, _ := cmd.Flags().GetString("server")
		deviceClientID, _ := cmd.Flags().GetString("device-client-id")

		if serverURL == "" {
			return fmt.Errorf("--server is required")
		}

		return runLogin(serverURL, deviceClientID)
	},
}

func runLogin(serverURL, deviceClientID string) error {
	// Set up context with signal handling (Ctrl+C).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	// Configure the Device Flow client.
	cfg := auth.DeviceFlowConfig{}
	if deviceClientID != "" {
		cfg.ClientID = deviceClientID
	}

	client := auth.NewDeviceFlowClient(cfg)

	// Step 1: Request a device code.
	fmt.Fprintln(os.Stderr, "Requesting device code from GitHub...")

	codeResp, err := client.RequestDeviceCode(ctx)
	if err != nil {
		return fmt.Errorf("failed to request device code: %w", err)
	}

	// Step 2: Display the code and verification URL.
	fmt.Fprintln(os.Stderr)
	fmt.Fprintf(os.Stderr, "  Open this URL in your browser: %s\n", codeResp.VerificationURI)
	fmt.Fprintf(os.Stderr, "  Enter this code: %s\n", codeResp.UserCode)
	fmt.Fprintln(os.Stderr)

	// Try to auto-open the browser.
	if err := openBrowser(codeResp.VerificationURI); err != nil {
		fmt.Fprintf(os.Stderr, "  (Could not open browser automatically: %v)\n", err)
	} else {
		fmt.Fprintln(os.Stderr, "  Browser opened. Waiting for authorization...")
	}

	fmt.Fprintln(os.Stderr)

	// Step 3: Poll for the GitHub token.
	result, err := client.PollForToken(ctx, codeResp.DeviceCode, codeResp.Interval)
	if err != nil {
		return fmt.Errorf("device flow authorization failed: %w", err)
	}

	fmt.Fprintln(os.Stderr, "GitHub authorization successful.")

	// Step 4: Exchange the GitHub token with the server for a session JWT.
	fmt.Fprintf(os.Stderr, "Exchanging token with %s...\n", serverURL)

	tokenResp, err := exchangeTokenWithServer(ctx, serverURL, result.AccessToken)
	if err != nil {
		return fmt.Errorf("server token exchange failed: %w", err)
	}

	// Step 5: Store the credentials locally.
	store := auth.NewTokenStore()
	entry := &auth.TokenStoreEntry{
		Token:           tokenResp.Token,
		Username:        tokenResp.Username,
		UserID:          tokenResp.UserID,
		AuthenticatedAt: time.Now(),
	}

	if err := store.Set(serverURL, entry); err != nil {
		return fmt.Errorf("failed to store credentials: %w", err)
	}

	fmt.Fprintln(os.Stderr)
	fmt.Fprintf(os.Stderr, "Authenticated as %s\n", tokenResp.Username)
	fmt.Fprintf(os.Stderr, "Credentials stored in %s\n", store.Path())

	return nil
}

// tokenExchangeResponse is the response from the server's POST /auth/token.
type tokenExchangeResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	UserID   int64  `json:"user_id"`
	Error    string `json:"error,omitempty"`
}

// exchangeTokenWithServer sends the GitHub token to the server's POST /auth/token
// endpoint and returns the server session JWT.
func exchangeTokenWithServer(ctx context.Context, serverURL, githubToken string) (*tokenExchangeResponse, error) {
	body, err := json.Marshal(map[string]string{
		"github_token": githubToken,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := serverURL + "/auth/token"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request to %s: %w", url, err)
	}
	defer resp.Body.Close()

	var tokenResp tokenExchangeResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		msg := tokenResp.Error
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("server rejected token: %s", msg)
	}

	if tokenResp.Token == "" {
		return nil, fmt.Errorf("server returned empty token")
	}

	return &tokenResp, nil
}

// openBrowser attempts to open a URL in the user's default browser.
func openBrowser(url string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	return cmd.Start()
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().String("server", "", "URL of the EPF server to authenticate with (required)")
	loginCmd.Flags().String("device-client-id", "", "override the built-in GitHub OAuth App client ID for Device Flow")
}
