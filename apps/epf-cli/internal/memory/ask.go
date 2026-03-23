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

// AskRequest is the request body for the Memory ask API.
type AskRequest struct {
	Message string `json:"message"`
}

// AskEvent represents a single SSE event from the ask API stream.
type AskEvent struct {
	Type           string          `json:"type"`   // "meta", "mcp_tool", "token", "done"
	Token          string          `json:"token"`  // for type="token"
	Tool           string          `json:"tool"`   // for type="mcp_tool"
	Status         string          `json:"status"` // for type="mcp_tool": "started" or "completed"
	ConversationID string          `json:"conversationId,omitempty"`
	Result         json.RawMessage `json:"result,omitempty"`
}

// AskResult holds the complete response from the ask API.
type AskResult struct {
	Response  string   `json:"response"`
	Tools     []string `json:"tools"`
	ElapsedMs int64    `json:"elapsed_ms"`
}

// Ask sends a question to the Memory ask API and collects the streamed response.
// The API uses SSE (Server-Sent Events) with token-by-token streaming.
func (c *Client) Ask(ctx context.Context, question string) (*AskResult, error) {
	reqBody, err := json.Marshal(AskRequest{Message: question})
	if err != nil {
		return nil, fmt.Errorf("marshal ask request: %w", err)
	}

	url := c.baseURL + "/api/ask"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("create ask request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	if c.projectID != "" {
		req.Header.Set("X-Project-ID", c.projectID)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ask request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ask API returned %d: %s", resp.StatusCode, string(body))
	}

	// Parse SSE stream
	result := &AskResult{}
	var response strings.Builder
	toolSet := map[string]bool{}

	scanner := bufio.NewScanner(resp.Body)
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
		case "done":
			// Stream complete
		}
	}

	result.Response = response.String()
	for tool := range toolSet {
		result.Tools = append(result.Tools, tool)
	}

	return result, nil
}
