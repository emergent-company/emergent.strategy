package e2e

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// ChatTestSuite tests the chat API endpoints
type ChatTestSuite struct {
	testutil.BaseSuite
}

func TestChatSuite(t *testing.T) {
	suite.Run(t, new(ChatTestSuite))
}

func (s *ChatTestSuite) SetupSuite() {
	s.SetDBSuffix("chat")
	s.BaseSuite.SetupSuite()
}

// =============================================================================
// Test: Authentication & Authorization
// =============================================================================

func (s *ChatTestSuite) TestListConversations_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.Client.GET("/api/v2/chat/conversations",
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *ChatTestSuite) TestListConversations_RequiresChatUseScope() {
	// User without chat:use scope should be forbidden
	resp := s.Client.GET("/api/v2/chat/conversations",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *ChatTestSuite) TestListConversations_RequiresProjectID() {
	// Request without X-Project-ID should fail
	resp := s.Client.GET("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

// =============================================================================
// Test: List Conversations
// =============================================================================

func (s *ChatTestSuite) TestListConversations_Empty() {
	// List conversations when none exist
	resp := s.Client.GET("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	convs, ok := body["conversations"].([]any)
	s.True(ok)
	s.Len(convs, 0)
	s.Equal(float64(0), body["total"])
}

func (s *ChatTestSuite) TestListConversations_ReturnsConversations() {
	// Create test conversation
	conv := s.createTestConversation("Test Conversation", "Hello world")

	// List conversations
	resp := s.Client.GET("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	convs, ok := body["conversations"].([]any)
	s.True(ok)
	s.Len(convs, 1)

	firstConv := convs[0].(map[string]any)
	s.Equal(conv["id"], firstConv["id"])
	s.Equal("Test Conversation", firstConv["title"])
}

func (s *ChatTestSuite) TestListConversations_Pagination() {
	// Create 5 conversations
	for i := 0; i < 5; i++ {
		s.createTestConversation("Conversation", "Message")
	}

	// List with limit
	resp := s.Client.GET("/api/v2/chat/conversations?limit=3",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	convs := body["conversations"].([]any)
	s.Len(convs, 3)
	s.Equal(float64(5), body["total"])

	// Test offset
	resp = s.Client.GET("/api/v2/chat/conversations?limit=3&offset=3",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	err = json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	convs = body["conversations"].([]any)
	s.Len(convs, 2)
}

// =============================================================================
// Test: Create Conversation
// =============================================================================

func (s *ChatTestSuite) TestCreateConversation_Success() {
	req := map[string]any{
		"title":   "New Conversation",
		"message": "Hello, this is my first message",
	}

	resp := s.Client.POST("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusCreated, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	s.NotEmpty(body["id"])
	s.Equal("New Conversation", body["title"])
	s.Equal(s.ProjectID, body["projectId"])

	// Should have initial message
	messages, ok := body["messages"].([]any)
	s.True(ok)
	s.Len(messages, 1)

	msg := messages[0].(map[string]any)
	s.Equal("user", msg["role"])
	s.Equal("Hello, this is my first message", msg["content"])
}

func (s *ChatTestSuite) TestCreateConversation_RequiresTitle() {
	req := map[string]any{
		"message": "Hello",
	}

	resp := s.Client.POST("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *ChatTestSuite) TestCreateConversation_RequiresMessage() {
	req := map[string]any{
		"title": "Test",
	}

	resp := s.Client.POST("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *ChatTestSuite) TestCreateConversation_WithCanonicalID() {
	canonicalID := "00000000-0000-0000-0000-000000000999"

	req := map[string]any{
		"title":       "Refinement Chat",
		"message":     "Let's refine this object",
		"canonicalId": canonicalID,
	}

	resp := s.Client.POST("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusCreated, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	s.Equal(canonicalID, body["canonicalId"])
}

// =============================================================================
// Test: Get Conversation
// =============================================================================

func (s *ChatTestSuite) TestGetConversation_Success() {
	// Create a conversation
	conv := s.createTestConversation("Test Conversation", "Initial message")

	// Get the conversation
	resp := s.Client.GET("/api/v2/chat/"+conv["id"].(string),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	s.Equal(conv["id"], body["id"])
	s.Equal("Test Conversation", body["title"])

	// Should include messages
	messages := body["messages"].([]any)
	s.Len(messages, 1)
}

func (s *ChatTestSuite) TestGetConversation_NotFound() {
	resp := s.Client.GET("/api/v2/chat/00000000-0000-0000-0000-000000000999",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

func (s *ChatTestSuite) TestGetConversation_InvalidID() {
	resp := s.Client.GET("/api/v2/chat/invalid-id",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

// =============================================================================
// Test: Update Conversation
// =============================================================================

func (s *ChatTestSuite) TestUpdateConversation_Success() {
	// Create a conversation
	conv := s.createTestConversation("Original Title", "Message")

	// Update the conversation
	req := map[string]any{
		"title": "Updated Title",
	}

	resp := s.Client.PATCH("/api/v2/chat/"+conv["id"].(string),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	s.Equal("Updated Title", body["title"])
}

func (s *ChatTestSuite) TestUpdateConversation_RequiresChatAdminScope() {
	// Create a conversation
	conv := s.createTestConversation("Test", "Message")

	req := map[string]any{
		"title": "New Title",
	}

	// User without chat:admin scope should be forbidden
	resp := s.Client.PATCH("/api/v2/chat/"+conv["id"].(string),
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *ChatTestSuite) TestUpdateConversation_NotFound() {
	req := map[string]any{
		"title": "New Title",
	}

	resp := s.Client.PATCH("/api/v2/chat/00000000-0000-0000-0000-000000000999",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

// =============================================================================
// Test: Delete Conversation
// =============================================================================

func (s *ChatTestSuite) TestDeleteConversation_Success() {
	// Create a conversation
	conv := s.createTestConversation("To Delete", "Message")

	// Delete the conversation
	resp := s.Client.DELETE("/api/v2/chat/"+conv["id"].(string),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	s.Equal("deleted", body["status"])

	// Verify it's gone
	resp = s.Client.GET("/api/v2/chat/"+conv["id"].(string),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

func (s *ChatTestSuite) TestDeleteConversation_RequiresChatAdminScope() {
	conv := s.createTestConversation("Test", "Message")

	// User without chat:admin scope should be forbidden
	resp := s.Client.DELETE("/api/v2/chat/"+conv["id"].(string),
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *ChatTestSuite) TestDeleteConversation_NotFound() {
	resp := s.Client.DELETE("/api/v2/chat/00000000-0000-0000-0000-000000000999",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

// =============================================================================
// Test: Add Message
// =============================================================================

func (s *ChatTestSuite) TestAddMessage_Success() {
	// Create a conversation
	conv := s.createTestConversation("Test", "First message")

	// Add a message
	req := map[string]any{
		"role":    "assistant",
		"content": "Hello! How can I help you?",
	}

	resp := s.Client.POST("/api/v2/chat/"+conv["id"].(string)+"/messages",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusCreated, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	s.NotEmpty(body["id"])
	s.Equal("assistant", body["role"])
	s.Equal("Hello! How can I help you?", body["content"])
	s.Equal(conv["id"], body["conversationId"])
}

func (s *ChatTestSuite) TestAddMessage_RequiresValidRole() {
	conv := s.createTestConversation("Test", "Message")

	req := map[string]any{
		"role":    "invalid-role",
		"content": "Test message",
	}

	resp := s.Client.POST("/api/v2/chat/"+conv["id"].(string)+"/messages",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *ChatTestSuite) TestAddMessage_ConversationNotFound() {
	req := map[string]any{
		"role":    "user",
		"content": "Test message",
	}

	resp := s.Client.POST("/api/v2/chat/00000000-0000-0000-0000-000000000999/messages",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

// =============================================================================
// Test: Project Isolation
// =============================================================================

func (s *ChatTestSuite) TestProjectIsolation() {
	if s.IsExternal() {
		s.T().Skip("Test requires direct DB access for creating second project")
		return
	}

	// Create a second project
	project2 := testutil.TestProject{
		ID:    "00000000-0000-0000-0000-000000000101",
		Name:  "Second Project",
		OrgID: s.OrgID,
	}
	err := testutil.CreateTestProject(s.Ctx, s.DB(), project2, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create conversation in project 1
	conv := s.createTestConversation("Project 1 Chat", "Message")

	// Try to access from project 2 - should not find it
	resp := s.Client.GET("/api/v2/chat/"+conv["id"].(string),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(project2.ID),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)

	// List in project 2 should be empty
	resp = s.Client.GET("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(project2.ID),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err = json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	convs := body["conversations"].([]any)
	s.Len(convs, 0)
}

// =============================================================================
// Test: Stream Chat
// =============================================================================

func (s *ChatTestSuite) TestStreamChat_RequiresAuth() {
	req := map[string]any{
		"message": "Hello",
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *ChatTestSuite) TestStreamChat_RequiresChatUseScope() {
	req := map[string]any{
		"message": "Hello",
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *ChatTestSuite) TestStreamChat_RequiresProjectID() {
	req := map[string]any{
		"message": "Hello",
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *ChatTestSuite) TestStreamChat_RequiresMessage() {
	req := map[string]any{}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	// Should return JSON error, not SSE
	s.Contains(resp.Header.Get("Content-Type"), "application/json")
}

func (s *ChatTestSuite) TestStreamChat_CreatesNewConversation() {
	req := map[string]any{
		"message": "Hello, this is my first message!",
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusOK, resp.StatusCode)
	s.Equal("text/event-stream", resp.Header.Get("Content-Type"))
	s.Equal("no-cache", resp.Header.Get("Cache-Control"))

	// Parse SSE events
	events := parseSSEEvents(resp.String())
	s.GreaterOrEqual(len(events), 2, "Should have at least meta and done events")

	// First event should be meta with conversation ID
	metaEvent := events[0]
	s.Equal("meta", metaEvent["type"])
	s.NotEmpty(metaEvent["conversationId"])

	// Last event should be done
	lastEvent := events[len(events)-1]
	s.Equal("done", lastEvent["type"])

	// Verify conversation was created
	convID := metaEvent["conversationId"].(string)
	getResp := s.Client.GET("/api/v2/chat/"+convID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)
	s.Equal(http.StatusOK, getResp.StatusCode)

	var conv map[string]any
	err := json.Unmarshal(getResp.Body, &conv)
	s.NoError(err)

	// Title should be truncated from message
	s.Equal("Hello, this is my first message!", conv["title"])

	// Should have at least the user message
	messages := conv["messages"].([]any)
	s.GreaterOrEqual(len(messages), 1)
	firstMsg := messages[0].(map[string]any)
	s.Equal("user", firstMsg["role"])
	s.Equal("Hello, this is my first message!", firstMsg["content"])
}

func (s *ChatTestSuite) TestStreamChat_UsesExistingConversation() {
	// Create a conversation first
	conv := s.createTestConversation("Existing Conversation", "First message")
	convID := conv["id"].(string)

	req := map[string]any{
		"message":        "Follow up message",
		"conversationId": convID,
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusOK, resp.StatusCode)
	s.Equal("text/event-stream", resp.Header.Get("Content-Type"))

	// Parse SSE events
	events := parseSSEEvents(resp.String())
	s.GreaterOrEqual(len(events), 2)

	// Meta event should reference the same conversation
	metaEvent := events[0]
	s.Equal("meta", metaEvent["type"])
	s.Equal(convID, metaEvent["conversationId"])

	// Verify message was added
	getResp := s.Client.GET("/api/v2/chat/"+convID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)
	s.Equal(http.StatusOK, getResp.StatusCode)

	var updated map[string]any
	err := json.Unmarshal(getResp.Body, &updated)
	s.NoError(err)

	messages := updated["messages"].([]any)
	s.GreaterOrEqual(len(messages), 2, "Should have at least 2 messages")

	// Second message should be the follow up
	secondMsg := messages[1].(map[string]any)
	s.Equal("user", secondMsg["role"])
	s.Equal("Follow up message", secondMsg["content"])
}

func (s *ChatTestSuite) TestStreamChat_ConversationNotFound() {
	req := map[string]any{
		"message":        "Hello",
		"conversationId": "00000000-0000-0000-0000-000000000999",
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	// Should return JSON error before SSE starts
	s.Equal(http.StatusNotFound, resp.StatusCode)
	s.Contains(resp.Header.Get("Content-Type"), "application/json")
}

func (s *ChatTestSuite) TestStreamChat_InvalidConversationID() {
	req := map[string]any{
		"message":        "Hello",
		"conversationId": "not-a-uuid",
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *ChatTestSuite) TestStreamChat_WithCanonicalID() {
	canonicalID := "00000000-0000-0000-0000-000000000888"

	req := map[string]any{
		"message":     "Refine this object",
		"canonicalId": canonicalID,
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	// Parse SSE events
	events := parseSSEEvents(resp.String())
	s.GreaterOrEqual(len(events), 2)

	convID := events[0]["conversationId"].(string)

	// Verify conversation has canonical ID
	getResp := s.Client.GET("/api/v2/chat/"+convID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)
	s.Equal(http.StatusOK, getResp.StatusCode)

	var conv map[string]any
	err := json.Unmarshal(getResp.Body, &conv)
	s.NoError(err)

	s.Equal(canonicalID, conv["canonicalId"])
}

func (s *ChatTestSuite) TestStreamChat_LLMNotConfigured() {
	if s.IsExternal() {
		s.T().Skip("Test depends on in-process server with nil LLM client")
		return
	}

	// The test server has nil LLM client, so it should return a fallback message
	req := map[string]any{
		"message": "Hello",
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	// Parse SSE events
	events := parseSSEEvents(resp.String())
	s.GreaterOrEqual(len(events), 3, "Should have meta, error, token, done events")

	// Should have meta first
	s.Equal("meta", events[0]["type"])

	// Should have error event about LLM not configured
	hasError := false
	for _, e := range events {
		if e["type"] == "error" {
			hasError = true
			s.Contains(e["error"].(string), "not configured")
		}
	}
	s.True(hasError, "Should have error event")

	// Should have done last
	s.Equal("done", events[len(events)-1]["type"])
}

func (s *ChatTestSuite) TestStreamChat_TitleTruncation() {
	// Very long message should result in truncated title
	longMessage := "This is a very long message that should be truncated when used as the conversation title because titles have a maximum length"

	req := map[string]any{
		"message": longMessage,
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	events := parseSSEEvents(resp.String())
	convID := events[0]["conversationId"].(string)

	// Get the conversation and verify title
	getResp := s.Client.GET("/api/v2/chat/"+convID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	var conv map[string]any
	err := json.Unmarshal(getResp.Body, &conv)
	s.NoError(err)

	title := conv["title"].(string)
	s.LessOrEqual(len(title), 54, "Title should be truncated to 50 chars + ...")
	s.Contains(title, "...")
}

func (s *ChatTestSuite) TestStreamChat_ProjectIsolation() {
	if s.IsExternal() {
		s.T().Skip("Test requires direct DB access for creating second project")
		return
	}

	// Create a second project
	project2 := testutil.TestProject{
		ID:    "00000000-0000-0000-0000-000000000102",
		Name:  "Second Project for Stream",
		OrgID: s.OrgID,
	}
	err := testutil.CreateTestProject(s.Ctx, s.DB(), project2, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create conversation in project 1
	conv := s.createTestConversation("Project 1 Chat", "Message")
	convID := conv["id"].(string)

	// Try to stream to that conversation from project 2 - should not find it
	req := map[string]any{
		"message":        "Follow up from wrong project",
		"conversationId": convID,
	}

	resp := s.Client.POST("/api/v2/chat/stream",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(project2.ID),
		testutil.WithJSONBody(req),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

// =============================================================================
// Helper Methods
// =============================================================================

// parseSSEEvents parses a raw SSE response into a list of event data objects
func parseSSEEvents(body string) []map[string]any {
	var events []map[string]any
	lines := strings.Split(body, "\n")

	for _, line := range lines {
		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			var event map[string]any
			if err := json.Unmarshal([]byte(data), &event); err == nil {
				events = append(events, event)
			}
		}
	}

	return events
}

// createTestConversation creates a conversation and returns the response body
func (s *ChatTestSuite) createTestConversation(title, message string) map[string]any {
	req := map[string]any{
		"title":   title,
		"message": message,
	}

	resp := s.Client.POST("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(req),
	)

	s.Require().Equal(http.StatusCreated, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.Require().NoError(err)

	return body
}
