package e2e

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/graph"
	"github.com/emergent/emergent-core/internal/testutil"
)

// GraphSearchSuite tests the graph search API endpoints
type GraphSearchSuite struct {
	testutil.BaseSuite
}

func TestGraphSearchSuite(t *testing.T) {
	suite.Run(t, new(GraphSearchSuite))
}

func (s *GraphSearchSuite) SetupSuite() {
	s.SetDBSuffix("graphsearch")
	s.BaseSuite.SetupSuite()
}

// ============ Helper Methods ============

func (s *GraphSearchSuite) createTestObject(objType, key string, properties map[string]any) string {
	body := map[string]any{
		"type":       objType,
		"properties": properties,
	}
	if key != "" {
		body["key"] = key
	}

	rec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(body),
	)
	s.Require().Equal(http.StatusCreated, rec.StatusCode, "Failed to create object: %s", rec.String())

	var result map[string]any
	err := json.Unmarshal(rec.Body, &result)
	s.Require().NoError(err)
	return result["id"].(string)
}

// ============ Hybrid Search Basic Tests ============

func (s *GraphSearchSuite) TestHybridSearch_BasicQuery() {
	// Create test objects with searchable content
	s.createTestObject("Requirement", "req-001", map[string]any{
		"title":       "User Authentication",
		"description": "Implement OAuth2 login flow",
	})

	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "authentication",
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.NotNil(response.Data)
	// Results depend on FTS indexing - just verify structure
}

func (s *GraphSearchSuite) TestHybridSearch_RequiresAuth() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "test",
		}),
	)

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *GraphSearchSuite) TestHybridSearch_RequiresProjectID() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"query": "test",
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSearchSuite) TestHybridSearch_RequiresQueryOrVector() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)

	var body map[string]any
	err := json.Unmarshal(rec.Body, &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("bad_request", errObj["code"])
}

// ============ Debug Mode Tests ============

func (s *GraphSearchSuite) TestHybridSearch_DebugModeViaBodyField() {
	// Create test data
	s.createTestObject("Task", "task-001", map[string]any{
		"title": "Debug test task",
	})

	// e2e-test-user has graph:search:debug scope
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":        "debug",
			"includeDebug": true,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Meta should be populated
	s.NotNil(response.Meta, "Meta should be present")
	s.GreaterOrEqual(response.Meta.ElapsedMs, float64(0), "ElapsedMs should be non-negative")

	// Timing should be present when debug=true
	s.NotNil(response.Meta.Timing, "Timing should be present in debug mode")
	s.GreaterOrEqual(response.Meta.Timing.TotalMs, float64(0), "TotalMs should be non-negative")
	s.GreaterOrEqual(response.Meta.Timing.LexicalMs, float64(0), "LexicalMs should be non-negative")
	s.GreaterOrEqual(response.Meta.Timing.FusionMs, float64(0), "FusionMs should be non-negative")

	// Channel stats should be present
	s.NotNil(response.Meta.ChannelStats, "ChannelStats should be present in debug mode")
	s.NotNil(response.Meta.ChannelStats.Lexical, "Lexical stats should be present")
}

func (s *GraphSearchSuite) TestHybridSearch_DebugModeViaQueryParam() {
	// Create test data
	s.createTestObject("Task", "task-002", map[string]any{
		"title": "Query param debug task",
	})

	// e2e-test-user has graph:search:debug scope
	rec := s.Client.POST(
		"/api/v2/graph/search?debug=true",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "query param",
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Debug info should be present
	s.NotNil(response.Meta, "Meta should be present")
	s.NotNil(response.Meta.Timing, "Timing should be present when debug=true via query param")
	s.NotNil(response.Meta.ChannelStats, "ChannelStats should be present when debug=true")
}

func (s *GraphSearchSuite) TestHybridSearch_DebugModeRequiresScope() {
	// User without graph:search:debug scope should be forbidden
	// 'graph-read' user has graph:read and graph:search:read but NOT graph:search:debug
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("graph-read"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":        "test",
			"includeDebug": true,
		}),
	)

	s.Equal(http.StatusForbidden, rec.StatusCode)

	var body map[string]any
	err := json.Unmarshal(rec.Body, &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("forbidden", errObj["code"])
}

func (s *GraphSearchSuite) TestHybridSearch_DebugModeRequiresScopeViaQueryParam() {
	// User without graph:search:debug scope should be forbidden even with query param
	rec := s.Client.POST(
		"/api/v2/graph/search?debug=true",
		testutil.WithAuth("graph-read"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "test",
		}),
	)

	s.Equal(http.StatusForbidden, rec.StatusCode)
}

func (s *GraphSearchSuite) TestHybridSearch_NoDebugWithoutFlag() {
	// Create test data
	s.createTestObject("Task", "task-003", map[string]any{
		"title": "No debug task",
	})

	// Request without debug flag should not include debug info
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "no debug",
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Meta should still have elapsed_ms but not timing/channel_stats
	s.NotNil(response.Meta, "Meta should be present even without debug")
	s.Nil(response.Meta.Timing, "Timing should NOT be present when debug is not requested")
	s.Nil(response.Meta.ChannelStats, "ChannelStats should NOT be present when debug is not requested")
}

// ============ Search Parameter Tests ============

func (s *GraphSearchSuite) TestHybridSearch_WithLimit() {
	// Create multiple objects
	for i := 0; i < 5; i++ {
		s.createTestObject("Item", "", map[string]any{
			"name": "Limit Test Item",
		})
	}

	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "Limit Test",
			"limit": 2,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Should respect limit (though results depend on FTS matching)
	s.LessOrEqual(len(response.Data), 2)
}

func (s *GraphSearchSuite) TestHybridSearch_WithWeights() {
	s.createTestObject("WeightTest", "wt-001", map[string]any{
		"title": "Weight test object",
	})

	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":         "weight test",
			"lexicalWeight": 0.8,
			"vectorWeight":  0.2,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)
	// Verify structure is correct
	s.NotNil(response.Data)
}

func (s *GraphSearchSuite) TestHybridSearch_WithBranchID() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":    "test",
			"branchId": "00000000-0000-0000-0000-000000000000",
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)
}

func (s *GraphSearchSuite) TestHybridSearch_WithTypes() {
	s.createTestObject("TypeA", "ta-001", map[string]any{"title": "Type A"})
	s.createTestObject("TypeB", "tb-001", map[string]any{"title": "Type B"})

	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "Type",
			"types": []string{"TypeA"},
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// All results should be of type TypeA (if any results returned)
	for _, item := range response.Data {
		s.Equal("TypeA", item.Object.Type)
	}
}

func (s *GraphSearchSuite) TestHybridSearch_WithLabels() {
	s.createTestObject("LabelTest", "lt-001", map[string]any{"title": "With Label"})

	// Add labels by creating with status that we can filter
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":  "Label",
			"labels": []string{"important"},
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)
}

func (s *GraphSearchSuite) TestHybridSearch_WithStatus() {
	// Create objects with different statuses
	s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":       "StatusTest",
			"status":     "active",
			"properties": map[string]any{"title": "Active Status"},
		}),
	)

	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":  "Status",
			"status": "active",
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)
}

// ============ Empty Results Tests ============

func (s *GraphSearchSuite) TestHybridSearch_EmptyResults() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "xyznonexistentquery123456",
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Empty(response.Data)
	s.Equal(0, response.Total)
	s.False(response.HasMore)
}

func (s *GraphSearchSuite) TestHybridSearch_EmptyResultsWithDebug() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":        "xyznonexistentquery123456",
			"includeDebug": true,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Empty(response.Data)
	s.NotNil(response.Meta)
	s.NotNil(response.Meta.Timing, "Timing should be present even with empty results")
	s.NotNil(response.Meta.ChannelStats, "ChannelStats should be present even with empty results")
	s.Equal(0, response.Meta.ChannelStats.Lexical.Count)
}
