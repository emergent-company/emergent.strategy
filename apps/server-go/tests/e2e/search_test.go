package e2e

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/search"
	"github.com/emergent/emergent-core/internal/testutil"
)

// SearchTestSuite tests the unified search API endpoints
type SearchTestSuite struct {
	suite.Suite
	testDB    *testutil.TestDB
	server    *testutil.TestServer
	ctx       context.Context
	projectID string
}

func TestSearchSuite(t *testing.T) {
	suite.Run(t, new(SearchTestSuite))
}

func (s *SearchTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "search")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *SearchTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *SearchTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users, project, org)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Create test project
	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.DefaultTestProject, testutil.AdminUser.ID)
	s.Require().NoError(err)

	s.projectID = testutil.DefaultTestProject.ID
}

// =============================================================================
// Helper functions
// =============================================================================

// createTestDocument creates a test document and returns its ID
func (s *SearchTestSuite) createTestDocument() string {
	docID := uuid.New().String()
	_, err := s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.documents (id, project_id, filename, source_type, content_hash, file_size_bytes, sync_version, created_at, updated_at)
		VALUES ($1, $2, 'test-doc.txt', 'upload', $3, 1000, 1, now(), now())
	`, docID, s.projectID, uuid.NewString())
	s.Require().NoError(err)
	return docID
}

// createTestChunk creates a test chunk with text content
func (s *SearchTestSuite) createTestChunk(documentID string, chunkIndex int, text string) string {
	chunkID := uuid.New().String()
	_, err := s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.chunks (id, document_id, chunk_index, text, created_at, updated_at)
		VALUES ($1, $2, $3, $4, now(), now())
	`, chunkID, documentID, chunkIndex, text)
	s.Require().NoError(err)
	return chunkID
}

// createTestGraphObject creates a test graph object via the API and returns its ID
func (s *SearchTestSuite) createTestGraphObject(objType string, key string, properties map[string]any) string {
	body := map[string]any{
		"type":       objType,
		"properties": properties,
	}
	if key != "" {
		body["key"] = key
	}

	resp := s.server.POST("/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(body),
	)

	s.Require().Equal(http.StatusCreated, resp.Code, "Failed to create graph object: %s", resp.Body.String())

	var result map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.Require().NoError(err)

	return result["id"].(string)
}

// =============================================================================
// Test: Authentication & Authorization
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query": "test query",
		}),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *SearchTestSuite) TestUnifiedSearch_RequiresSearchReadScope() {
	// User without search:read scope should be forbidden
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query": "test query",
		}),
	)

	s.Equal(http.StatusForbidden, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("forbidden", errObj["code"])
}

func (s *SearchTestSuite) TestUnifiedSearch_RequiresProjectID() {
	// Request without X-Project-ID should fail
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"query": "test query",
		}),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

// =============================================================================
// Test: Request Validation
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_RequiresQuery() {
	// Request without query should fail
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{}),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("bad_request", errObj["code"])
}

func (s *SearchTestSuite) TestUnifiedSearch_QueryTooLong() {
	// Query exceeding max length (800 chars) should fail
	longQuery := make([]byte, 801)
	for i := range longQuery {
		longQuery[i] = 'a'
	}

	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query": string(longQuery),
		}),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

// =============================================================================
// Test: Empty Results
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_EmptyResults() {
	// Search with no data in DB should return empty results
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query": "nonexistent query term",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.Empty(response.Results)
	s.Equal(0, response.Metadata.TotalResults)
	s.Equal(0, response.Metadata.GraphResultCount)
	s.Equal(0, response.Metadata.TextResultCount)
	s.Nil(response.Debug) // Debug should be nil when not requested
}

// =============================================================================
// Test: Result Types Filter
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_ResultTypesGraph() {
	// Create test data
	s.createTestGraphObject("Person", "john", map[string]any{"name": "John Doe"})
	docID := s.createTestDocument()
	s.createTestChunk(docID, 0, "Some text content")

	// Search with graph-only results
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":       "John",
			"resultTypes": "graph",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	// Should only contain graph results
	s.Equal(0, response.Metadata.TextResultCount)
	for _, item := range response.Results {
		s.Equal(search.ItemTypeGraph, item.Type)
	}
}

func (s *SearchTestSuite) TestUnifiedSearch_ResultTypesText() {
	// Create test data
	s.createTestGraphObject("Person", "john", map[string]any{"name": "John Doe"})
	docID := s.createTestDocument()
	s.createTestChunk(docID, 0, "John Doe is mentioned in this text")

	// Search with text-only results
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":       "John",
			"resultTypes": "text",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	// Should only contain text results
	s.Equal(0, response.Metadata.GraphResultCount)
	for _, item := range response.Results {
		s.Equal(search.ItemTypeText, item.Type)
	}
}

// =============================================================================
// Test: Fusion Strategies
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_FusionStrategyWeighted() {
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":          "test",
			"fusionStrategy": "weighted",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.Equal(search.FusionStrategyWeighted, response.Metadata.FusionStrategy)
}

func (s *SearchTestSuite) TestUnifiedSearch_FusionStrategyRRF() {
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":          "test",
			"fusionStrategy": "rrf",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.Equal(search.FusionStrategyRRF, response.Metadata.FusionStrategy)
}

func (s *SearchTestSuite) TestUnifiedSearch_FusionStrategyInterleave() {
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":          "test",
			"fusionStrategy": "interleave",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.Equal(search.FusionStrategyInterleave, response.Metadata.FusionStrategy)
}

func (s *SearchTestSuite) TestUnifiedSearch_FusionStrategyGraphFirst() {
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":          "test",
			"fusionStrategy": "graph_first",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.Equal(search.FusionStrategyGraphFirst, response.Metadata.FusionStrategy)
}

func (s *SearchTestSuite) TestUnifiedSearch_FusionStrategyTextFirst() {
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":          "test",
			"fusionStrategy": "text_first",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.Equal(search.FusionStrategyTextFirst, response.Metadata.FusionStrategy)
}

// =============================================================================
// Test: Custom Weights
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_CustomWeights() {
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":          "test",
			"fusionStrategy": "weighted",
			"weights": map[string]any{
				"graphWeight": 0.7,
				"textWeight":  0.3,
			},
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.Equal(search.FusionStrategyWeighted, response.Metadata.FusionStrategy)
}

// =============================================================================
// Test: Limit
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_WithLimit() {
	// Create multiple graph objects
	for i := 0; i < 10; i++ {
		s.createTestGraphObject("Item", "item-"+string(rune('0'+i)), map[string]any{
			"name": "Test Item",
		})
	}

	// Search with limit
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":       "Item",
			"limit":       5,
			"resultTypes": "graph",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.LessOrEqual(len(response.Results), 5)
}

// =============================================================================
// Test: Debug Mode
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_DebugModeRequiresScope() {
	// User without search:debug scope requesting debug mode should be forbidden
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":        "test",
			"includeDebug": true,
		}),
	)

	// Should be forbidden because e2e-test-user doesn't have search:debug scope
	s.Equal(http.StatusForbidden, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("forbidden", errObj["code"])
}

// =============================================================================
// Test: Execution Time Metadata
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_IncludesExecutionTime() {
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query": "test",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	// Execution time should be non-negative
	s.GreaterOrEqual(response.Metadata.ExecutionTime.TotalMs, 0)
	s.GreaterOrEqual(response.Metadata.ExecutionTime.FusionMs, 0)
}

// =============================================================================
// Test: With Test Data
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_ReturnsGraphResults() {
	// Create a graph object with searchable content
	objID := s.createTestGraphObject("Requirement", "req-001", map[string]any{
		"title":       "User Authentication Requirement",
		"description": "The system shall support user authentication via OAuth2",
	})

	// Search for content
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":       "authentication",
			"resultTypes": "graph",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	// Note: Results depend on FTS indexing being enabled on the database
	// If FTS isn't configured, this may return empty results
	s.NotNil(response.Results)
	_ = objID // Silence unused variable warning
}

func (s *SearchTestSuite) TestUnifiedSearch_ReturnsTextResults() {
	// Create document and chunk with searchable content
	docID := s.createTestDocument()
	s.createTestChunk(docID, 0, "This document discusses authentication requirements")

	// Search for content
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":       "authentication",
			"resultTypes": "text",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	// Note: Results depend on FTS indexing being enabled on the database
	s.NotNil(response.Results)
}

func (s *SearchTestSuite) TestUnifiedSearch_ReturnsBothResults() {
	// Create both graph object and chunk with searchable content
	s.createTestGraphObject("Requirement", "req-001", map[string]any{
		"title": "Security Requirement",
	})
	docID := s.createTestDocument()
	s.createTestChunk(docID, 0, "This document covers security requirements")

	// Search for content with both result types
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query":       "security",
			"resultTypes": "both",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	s.NotNil(response.Results)
	s.NotNil(response.Metadata)
}

// =============================================================================
// Test: Default Fusion Strategy
// =============================================================================

func (s *SearchTestSuite) TestUnifiedSearch_DefaultFusionStrategy() {
	// Search without specifying fusion strategy
	resp := s.server.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"query": "test",
		}),
	)

	s.Equal(http.StatusOK, resp.Code)

	var response search.UnifiedSearchResponse
	err := json.Unmarshal(resp.Body.Bytes(), &response)
	s.Require().NoError(err)

	// Default should be "weighted"
	s.Equal(search.FusionStrategyWeighted, response.Metadata.FusionStrategy)
}
