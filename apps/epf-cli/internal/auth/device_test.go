package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// --- RequestDeviceCode tests ---

func TestRequestDeviceCode_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/login/device/code" || r.Method != http.MethodPost {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}

		// Verify the request contains expected params.
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		if r.Form.Get("client_id") == "" {
			t.Error("missing client_id")
		}
		if r.Form.Get("scope") == "" {
			t.Error("missing scope")
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(DeviceCodeResponse{
			DeviceCode:      "dc_test123",
			UserCode:        "ABCD-1234",
			VerificationURI: "https://github.com/login/device",
			ExpiresIn:       900,
			Interval:        5,
		})
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	code, err := client.RequestDeviceCode(context.Background())
	if err != nil {
		t.Fatalf("RequestDeviceCode() error = %v", err)
	}

	if code.DeviceCode != "dc_test123" {
		t.Errorf("DeviceCode = %q, want dc_test123", code.DeviceCode)
	}
	if code.UserCode != "ABCD-1234" {
		t.Errorf("UserCode = %q, want ABCD-1234", code.UserCode)
	}
	if code.VerificationURI != "https://github.com/login/device" {
		t.Errorf("VerificationURI = %q, want https://github.com/login/device", code.VerificationURI)
	}
	if code.ExpiresIn != 900 {
		t.Errorf("ExpiresIn = %d, want 900", code.ExpiresIn)
	}
	if code.Interval != 5 {
		t.Errorf("Interval = %d, want 5", code.Interval)
	}
}

func TestRequestDeviceCode_DefaultInterval(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Response without interval field.
		json.NewEncoder(w).Encode(map[string]interface{}{
			"device_code":      "dc_test",
			"user_code":        "ABCD-5678",
			"verification_uri": "https://github.com/login/device",
			"expires_in":       900,
		})
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	code, err := client.RequestDeviceCode(context.Background())
	if err != nil {
		t.Fatalf("RequestDeviceCode() error = %v", err)
	}

	// Default interval should be 5 seconds.
	if code.Interval != 5 {
		t.Errorf("Interval = %d, want 5 (default)", code.Interval)
	}
}

func TestRequestDeviceCode_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	_, err := client.RequestDeviceCode(context.Background())
	if err == nil {
		t.Fatal("expected error for server error")
	}
}

func TestRequestDeviceCode_EmptyResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{})
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	_, err := client.RequestDeviceCode(context.Background())
	if err == nil {
		t.Fatal("expected error for empty response")
	}
}

func TestRequestDeviceCode_ContextCanceled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate a slow server — the context should cancel before this returns.
		time.Sleep(5 * time.Second)
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately.

	_, err := client.RequestDeviceCode(ctx)
	if err == nil {
		t.Fatal("expected error for canceled context")
	}
}

// --- PollForToken tests ---

func TestPollForToken_ImmediateSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/login/oauth/access_token" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"access_token": "gho_test_device_token",
			"token_type":   "bearer",
		})
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	// Use a very short interval for testing.
	result, err := client.PollForToken(context.Background(), "dc_test123", 0)
	if err != nil {
		t.Fatalf("PollForToken() error = %v", err)
	}

	if result.AccessToken != "gho_test_device_token" {
		t.Errorf("AccessToken = %q, want gho_test_device_token", result.AccessToken)
	}
	if result.TokenType != "bearer" {
		t.Errorf("TokenType = %q, want bearer", result.TokenType)
	}
}

func TestPollForToken_PendingThenSuccess(t *testing.T) {
	var callCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/login/oauth/access_token" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		n := callCount.Add(1)
		w.Header().Set("Content-Type", "application/json")

		if n <= 2 {
			// First two calls: authorization pending.
			json.NewEncoder(w).Encode(map[string]string{
				"error": "authorization_pending",
			})
		} else {
			// Third call: success.
			json.NewEncoder(w).Encode(map[string]string{
				"access_token": "gho_after_pending",
				"token_type":   "bearer",
			})
		}
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	// Interval=0 makes it poll as fast as possible (1 tick = ~0ms wait).
	// The default minimum in PollForToken is overridden to 0 which becomes
	// the select's time.After(0) — practically immediate.
	result, err := client.PollForToken(context.Background(), "dc_test123", 0)
	if err != nil {
		t.Fatalf("PollForToken() error = %v", err)
	}

	if result.AccessToken != "gho_after_pending" {
		t.Errorf("AccessToken = %q, want gho_after_pending", result.AccessToken)
	}

	if n := callCount.Load(); n != 3 {
		t.Errorf("poll count = %d, want 3", n)
	}
}

func TestPollForToken_SlowDown(t *testing.T) {
	// Test that slow_down response increases the interval.
	// We verify by checking the poll count — after slow_down, the interval
	// increases by 5 seconds, so with a short context timeout, we should
	// only get 2 polls (the slow_down + the success after the wait).
	var callCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/login/oauth/access_token" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		n := callCount.Add(1)
		w.Header().Set("Content-Type", "application/json")

		if n == 1 {
			// First call: slow down.
			json.NewEncoder(w).Encode(map[string]string{
				"error": "slow_down",
			})
		} else {
			// Second call: success (comes after increased interval).
			json.NewEncoder(w).Encode(map[string]string{
				"access_token": "gho_after_slowdown",
				"token_type":   "bearer",
			})
		}
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	// Use 1-second interval so slow_down bumps it to 6s.
	// Use a generous timeout to allow the second poll.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.PollForToken(ctx, "dc_test123", 1)
	if err != nil {
		t.Fatalf("PollForToken() error = %v", err)
	}

	if result.AccessToken != "gho_after_slowdown" {
		t.Errorf("AccessToken = %q, want gho_after_slowdown", result.AccessToken)
	}

	if n := callCount.Load(); n != 2 {
		t.Errorf("poll count = %d, want 2", n)
	}
}

func TestPollForToken_Expired(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "expired_token",
		})
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	_, err := client.PollForToken(context.Background(), "dc_test123", 0)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
	if got := err.Error(); got != "device flow: authorization code expired — please try again" {
		t.Errorf("error = %q, want expired message", got)
	}
}

func TestPollForToken_AccessDenied(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "access_denied",
		})
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	_, err := client.PollForToken(context.Background(), "dc_test123", 0)
	if err == nil {
		t.Fatal("expected error for access denied")
	}
	if got := err.Error(); got != "device flow: user denied authorization" {
		t.Errorf("error = %q, want access denied message", got)
	}
}

func TestPollForToken_ContextCanceled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "authorization_pending",
		})
	}))
	defer server.Close()

	client := NewDeviceFlowClient(DeviceFlowConfig{
		ClientID:   "test-client-id",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
	})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := client.PollForToken(ctx, "dc_test123", 0)
	if err == nil {
		t.Fatal("expected error for canceled context")
	}
}

// --- DeviceFlowConfig defaults ---

func TestDeviceFlowConfig_Defaults(t *testing.T) {
	cfg := DeviceFlowConfig{}
	cfg.setDefaults()

	if cfg.ClientID != DefaultDeviceClientID {
		t.Errorf("ClientID = %q, want %q", cfg.ClientID, DefaultDeviceClientID)
	}
	if cfg.BaseURL != "https://github.com" {
		t.Errorf("BaseURL = %q, want https://github.com", cfg.BaseURL)
	}
	if len(cfg.Scopes) == 0 {
		t.Error("Scopes should have defaults")
	}
	if cfg.HTTPClient == nil {
		t.Error("HTTPClient should have default")
	}
}

func TestDeviceFlowConfig_CustomValues(t *testing.T) {
	customClient := &http.Client{Timeout: 10 * time.Second}
	cfg := DeviceFlowConfig{
		ClientID:   "custom-id",
		BaseURL:    "https://github.example.com",
		Scopes:     []string{"read:user"},
		HTTPClient: customClient,
	}
	cfg.setDefaults()

	if cfg.ClientID != "custom-id" {
		t.Errorf("ClientID = %q, want custom-id", cfg.ClientID)
	}
	if cfg.BaseURL != "https://github.example.com" {
		t.Errorf("BaseURL = %q, want https://github.example.com", cfg.BaseURL)
	}
	if len(cfg.Scopes) != 1 || cfg.Scopes[0] != "read:user" {
		t.Errorf("Scopes = %v, want [read:user]", cfg.Scopes)
	}
	if cfg.HTTPClient != customClient {
		t.Error("HTTPClient should be the custom client")
	}
}
