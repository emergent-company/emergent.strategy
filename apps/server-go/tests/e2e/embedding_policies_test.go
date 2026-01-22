package e2e

import (
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// EmbeddingPoliciesTestSuite tests the embedding policies API endpoints.
//
// Environment variables:
//   - TEST_SERVER_URL: External server URL (e.g., "http://localhost:3002")
//   - If not set, uses in-process Go test server (requires DB access)
type EmbeddingPoliciesTestSuite struct {
	suite.Suite
	client *testutil.HTTPClient

	// For in-process testing only
	testDB *testutil.TestDB
	server *testutil.TestServer

	// Dummy project ID for validation tests
	dummyProjectID string
}

func TestEmbeddingPoliciesSuite(t *testing.T) {
	suite.Run(t, new(EmbeddingPoliciesTestSuite))
}

func (s *EmbeddingPoliciesTestSuite) SetupSuite() {
	s.dummyProjectID = "00000000-0000-0000-0000-000000000001"

	if serverURL := os.Getenv("TEST_SERVER_URL"); serverURL != "" {
		s.T().Logf("Using external server: %s", serverURL)
		s.client = testutil.NewExternalHTTPClient(serverURL)
	} else {
		s.T().Log("Using in-process test server")

		testDB, err := testutil.SetupTestDB(s.Suite.T().Context(), "embedding_policies")
		s.Require().NoError(err, "Failed to setup test database")
		s.testDB = testDB

		s.server = testutil.NewTestServer(testDB)
		s.client = testutil.NewHTTPClient(s.server.Echo)
	}
}

func (s *EmbeddingPoliciesTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *EmbeddingPoliciesTestSuite) SetupTest() {
	if s.testDB != nil {
		err := testutil.TruncateTables(s.Suite.T().Context(), s.testDB.DB)
		s.Require().NoError(err)

		err = testutil.SetupTestFixtures(s.Suite.T().Context(), s.testDB.DB)
		s.Require().NoError(err)
	}
}

// =============================================================================
// Test: List Embedding Policies - Authentication & Validation
// =============================================================================

func (s *EmbeddingPoliciesTestSuite) TestList_RequiresAuth() {
	resp := s.client.GET("/api/v2/graph/embedding-policies?project_id=" + s.dummyProjectID)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestList_RequiresGraphReadScope() {
	// User without graph:read scope should be forbidden
	// "with-scope" has documents:read, documents:write, project:read but NOT graph:read
	resp := s.client.GET("/api/v2/graph/embedding-policies?project_id="+s.dummyProjectID,
		testutil.WithAuth("with-scope"),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestList_RequiresProjectID() {
	resp := s.client.GET("/api/v2/graph/embedding-policies",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "project_id")
}

func (s *EmbeddingPoliciesTestSuite) TestList_ReturnsEmptyArrayForNewProject() {
	resp := s.client.GET("/api/v2/graph/embedding-policies?project_id="+s.dummyProjectID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var policies []any
	err := resp.JSON(&policies)
	s.NoError(err)
	s.Equal(0, len(policies))
}

// =============================================================================
// Test: Create Embedding Policy - Authentication & Validation
// =============================================================================

func (s *EmbeddingPoliciesTestSuite) TestCreate_RequiresAuth() {
	body := map[string]any{
		"projectId":  s.dummyProjectID,
		"objectType": "TestType",
	}

	resp := s.client.POST("/api/v2/graph/embedding-policies",
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestCreate_RequiresGraphWriteScope() {
	body := map[string]any{
		"projectId":  s.dummyProjectID,
		"objectType": "TestType",
	}

	// User without graph:write scope should be forbidden
	resp := s.client.POST("/api/v2/graph/embedding-policies",
		testutil.WithAuth("read-only"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestCreate_RequiresProjectID() {
	body := map[string]any{
		"objectType": "TestType",
	}

	resp := s.client.POST("/api/v2/graph/embedding-policies",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var respBody map[string]any
	err := resp.JSON(&respBody)
	s.NoError(err)

	errObj, ok := respBody["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "projectId")
}

func (s *EmbeddingPoliciesTestSuite) TestCreate_RequiresObjectType() {
	body := map[string]any{
		"projectId": s.dummyProjectID,
	}

	resp := s.client.POST("/api/v2/graph/embedding-policies",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var respBody map[string]any
	err := resp.JSON(&respBody)
	s.NoError(err)

	errObj, ok := respBody["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "objectType")
}

func (s *EmbeddingPoliciesTestSuite) TestCreate_RejectsInvalidProjectID() {
	body := map[string]any{
		"projectId":  "not-a-uuid",
		"objectType": "TestType",
	}

	resp := s.client.POST("/api/v2/graph/embedding-policies",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestCreate_RejectsNegativeMaxPropertySize() {
	body := map[string]any{
		"projectId":       s.dummyProjectID,
		"objectType":      "TestType",
		"maxPropertySize": -1,
	}

	resp := s.client.POST("/api/v2/graph/embedding-policies",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var respBody map[string]any
	err := resp.JSON(&respBody)
	s.NoError(err)

	errObj, ok := respBody["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "maxPropertySize")
}

// =============================================================================
// Test: Get Single Embedding Policy - Authentication & Validation
// =============================================================================

func (s *EmbeddingPoliciesTestSuite) TestGetByID_RequiresAuth() {
	policyID := "00000000-0000-0000-0000-000000000001"
	resp := s.client.GET("/api/v2/graph/embedding-policies/" + policyID + "?project_id=" + s.dummyProjectID)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestGetByID_RequiresProjectID() {
	policyID := "00000000-0000-0000-0000-000000000001"
	resp := s.client.GET("/api/v2/graph/embedding-policies/"+policyID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestGetByID_Returns404ForNonExistent() {
	policyID := "00000000-0000-0000-0000-000000000099"
	resp := s.client.GET("/api/v2/graph/embedding-policies/"+policyID+"?project_id="+s.dummyProjectID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestGetByID_RejectsInvalidUUID() {
	resp := s.client.GET("/api/v2/graph/embedding-policies/not-a-uuid?project_id="+s.dummyProjectID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

// =============================================================================
// Test: Update Embedding Policy - Authentication & Validation
// =============================================================================

func (s *EmbeddingPoliciesTestSuite) TestUpdate_RequiresAuth() {
	policyID := "00000000-0000-0000-0000-000000000001"
	body := map[string]any{
		"enabled": false,
	}

	resp := s.client.PATCH("/api/v2/graph/embedding-policies/"+policyID+"?project_id="+s.dummyProjectID,
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestUpdate_RequiresGraphWriteScope() {
	policyID := "00000000-0000-0000-0000-000000000001"
	body := map[string]any{
		"enabled": false,
	}

	resp := s.client.PATCH("/api/v2/graph/embedding-policies/"+policyID+"?project_id="+s.dummyProjectID,
		testutil.WithAuth("read-only"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestUpdate_RequiresProjectID() {
	policyID := "00000000-0000-0000-0000-000000000001"
	body := map[string]any{
		"enabled": false,
	}

	resp := s.client.PATCH("/api/v2/graph/embedding-policies/"+policyID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestUpdate_Returns404ForNonExistent() {
	policyID := "00000000-0000-0000-0000-000000000099"
	body := map[string]any{
		"enabled": false,
	}

	resp := s.client.PATCH("/api/v2/graph/embedding-policies/"+policyID+"?project_id="+s.dummyProjectID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestUpdate_RejectsInvalidMaxPropertySize() {
	policyID := "00000000-0000-0000-0000-000000000001"
	body := map[string]any{
		"maxPropertySize": 0,
	}

	resp := s.client.PATCH("/api/v2/graph/embedding-policies/"+policyID+"?project_id="+s.dummyProjectID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

// =============================================================================
// Test: Delete Embedding Policy - Authentication & Validation
// =============================================================================

func (s *EmbeddingPoliciesTestSuite) TestDelete_RequiresAuth() {
	policyID := "00000000-0000-0000-0000-000000000001"
	resp := s.client.DELETE("/api/v2/graph/embedding-policies/" + policyID + "?project_id=" + s.dummyProjectID)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestDelete_RequiresGraphWriteScope() {
	policyID := "00000000-0000-0000-0000-000000000001"
	resp := s.client.DELETE("/api/v2/graph/embedding-policies/"+policyID+"?project_id="+s.dummyProjectID,
		testutil.WithAuth("read-only"),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestDelete_RequiresProjectID() {
	policyID := "00000000-0000-0000-0000-000000000001"
	resp := s.client.DELETE("/api/v2/graph/embedding-policies/"+policyID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *EmbeddingPoliciesTestSuite) TestDelete_Returns404ForNonExistent() {
	policyID := "00000000-0000-0000-0000-000000000099"
	resp := s.client.DELETE("/api/v2/graph/embedding-policies/"+policyID+"?project_id="+s.dummyProjectID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.StatusCode)
}
