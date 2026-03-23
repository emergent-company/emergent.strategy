package memory

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ChatStreamRequest is the request body for the Memory chat stream API.
// This endpoint uses the server-side graph-query-agent which has access
// to graph query tools (entity-query, entity-edges-get, search-hybrid).
type ChatStreamRequest struct {
	Message   string `json:"message"`
	SessionID string `json:"sessionId,omitempty"`
}

// AskEvent represents a single SSE event from the chat stream API.
type AskEvent struct {
	Type           string          `json:"type"`   // "meta", "mcp_tool", "token", "done"
	Token          string          `json:"token"`  // for type="token"
	Tool           string          `json:"tool"`   // for type="mcp_tool"
	Status         string          `json:"status"` // for type="mcp_tool": "started" or "completed"
	ConversationID string          `json:"conversationId,omitempty"`
	SessionID      string          `json:"sessionId,omitempty"`
	Result         json.RawMessage `json:"result,omitempty"`
}

// AskResult holds the complete response from the chat stream API.
type AskResult struct {
	Response  string   `json:"response"`
	Tools     []string `json:"tools"`
	SessionID string   `json:"session_id,omitempty"`
	ElapsedMs int64    `json:"elapsed_ms"`
}

// Ask sends a question to the Memory chat stream API and collects the streamed response.
//
// This uses the /api/chat/stream endpoint which provides the LLM with access to
// graph query tools (entity-query, entity-edges-get, search-hybrid, etc.).
// This is the same endpoint used by `memory query` in agent mode.
//
// The previous /api/ask endpoint did NOT provide graph tools to the LLM, causing
// it to return empty responses since it couldn't actually query the graph.
// See: https://github.com/emergent-company/emergent-strategy/issues/23
func (c *Client) Ask(ctx context.Context, question string) (*AskResult, error) {
	return c.AskWithSession(ctx, question, "")
}

// AskWithSession sends a question using an existing session for multi-turn conversations.
// Pass an empty sessionID to start a new session.
func (c *Client) AskWithSession(ctx context.Context, question, sessionID string) (*AskResult, error) {
	chatReq := ChatStreamRequest{
		Message: question,
	}
	if sessionID != "" {
		chatReq.SessionID = sessionID
	}

	reqBody, err := json.Marshal(chatReq)
	if err != nil {
		return nil, fmt.Errorf("marshal chat request: %w", err)
	}

	url := c.baseURL + "/api/chat/stream"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("create chat request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	if c.projectID != "" {
		req.Header.Set("X-Project-ID", c.projectID)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("chat stream request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("chat stream API returned %d: %s", resp.StatusCode, string(body))
	}

	// Parse SSE stream — the chat/stream endpoint emits the same event types
	// as /api/ask (token, mcp_tool, done) but the LLM behind it has access
	// to graph query tools, so mcp_tool events will actually appear.
	result := &AskResult{}
	var response strings.Builder
	toolSet := map[string]bool{}

	scanner := bufio.NewScanner(resp.Body)
	// Increase buffer size to handle large SSE events (e.g., tool results)
	scanner.Buffer(make([]byte, 0, 256*1024), 256*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		var event AskEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "token":
			response.WriteString(event.Token)
		case "mcp_tool":
			if event.Status == "started" && event.Tool != "" {
				toolSet[event.Tool] = true
			}
		case "meta":
			// Capture session ID from meta event for multi-turn support
			if event.SessionID != "" {
				result.SessionID = event.SessionID
			}
			if event.ConversationID != "" && result.SessionID == "" {
				result.SessionID = event.ConversationID
			}
		case "done":
			// Stream complete
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("reading chat stream: %w", err)
	}

	result.Response = response.String()
	for tool := range toolSet {
		result.Tools = append(result.Tools, tool)
	}

	return result, nil
}
