package main

import (
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
)

// resetClients opens connections and resets them straight away, the way a
// client that drops a connection right after connecting does. On macOS the
// accept path then sees a setsockopt error on the dead socket.
func resetClients(addr string, n int) {
	for i := 0; i < n; i++ {
		c, err := net.Dial("tcp", addr)
		if err != nil {
			continue
		}
		_ = c.(*net.TCPConn).SetLinger(0)
		_ = c.Close()
	}
}

func TestServeHTTP_SurvivesClientResets(t *testing.T) {
	probe, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := probe.Addr().String()
	if err := probe.Close(); err != nil {
		t.Fatal(err)
	}

	e := echo.New()
	e.HideBanner, e.HidePort = true, true
	e.GET("/", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })
	srv := &http.Server{Addr: addr, Handler: e}

	done := make(chan error, 1)
	go func() { done <- serveHTTP(srv) }()

	for i := 0; i < 100; i++ {
		if c, err := net.Dial("tcp", addr); err == nil {
			_ = c.Close()
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	resetClients(addr, 300)

	select {
	case err := <-done:
		t.Fatalf("the server stopped after clients reset connections: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://" + addr + "/")
	if err != nil {
		t.Fatalf("the server does not answer after clients reset connections: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}

	if err := srv.Close(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Errorf("a clean shutdown must return nil, got %v", err)
	}
}
