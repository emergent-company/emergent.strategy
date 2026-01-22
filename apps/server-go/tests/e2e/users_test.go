package e2e

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// UsersTestSuite tests the users search API endpoints
type UsersTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestUsersSuite(t *testing.T) {
	suite.Run(t, new(UsersTestSuite))
}

func (s *UsersTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database
	testDB, err := testutil.SetupTestDB(s.ctx, "users")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *UsersTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *UsersTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)
}

// =============================================================================
// Test: Search Users by Email
// =============================================================================

func (s *UsersTestSuite) TestSearchUsers_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.server.GET("/api/v2/users/search?email=test")

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *UsersTestSuite) TestSearchUsers_RequiresEmailParam() {
	// Request without email parameter should fail
	resp := s.server.GET("/api/v2/users/search",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "email query parameter is required")
}

func (s *UsersTestSuite) TestSearchUsers_MinLength() {
	// Email query must be at least 2 characters
	resp := s.server.GET("/api/v2/users/search?email=a",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "at least 2 characters")
}

func (s *UsersTestSuite) TestSearchUsers_ReturnsMatches() {
	// Search for users by partial email match
	resp := s.server.GET("/api/v2/users/search?email=user@test",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	users, ok := result["users"].([]any)
	s.True(ok, "Expected users array in response")
	s.GreaterOrEqual(len(users), 1, "Expected at least one user match")

	// Check that RegularUser (user@test.local) is in results
	found := false
	for _, u := range users {
		user := u.(map[string]any)
		if user["email"] == "user@test.local" {
			found = true
			s.Equal(testutil.RegularUser.ID, user["id"])
			break
		}
	}
	s.True(found, "Expected to find user@test.local in search results")
}

func (s *UsersTestSuite) TestSearchUsers_ExcludesCurrentUser() {
	// Search for admin email - should not return the current user
	resp := s.server.GET("/api/v2/users/search?email=admin@test",
		testutil.WithAuth("e2e-test-user"), // This maps to AdminUser
	)

	s.Equal(http.StatusOK, resp.Code)

	var result map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	users, ok := result["users"].([]any)
	s.True(ok, "Expected users array in response")

	// AdminUser should not be in results since they are the current user
	for _, u := range users {
		user := u.(map[string]any)
		s.NotEqual(testutil.AdminUser.ID, user["id"], "Current user should be excluded from search results")
	}
}

func (s *UsersTestSuite) TestSearchUsers_NoMatches() {
	// Search for non-existent email
	resp := s.server.GET("/api/v2/users/search?email=nonexistent@nowhere",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	users, ok := result["users"].([]any)
	s.True(ok, "Expected users array in response")
	s.Empty(users, "Expected empty users array for no matches")
}

func (s *UsersTestSuite) TestSearchUsers_CaseInsensitive() {
	// Search should be case insensitive
	resp := s.server.GET("/api/v2/users/search?email=USER@TEST",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	users, ok := result["users"].([]any)
	s.True(ok, "Expected users array in response")
	s.GreaterOrEqual(len(users), 1, "Expected case-insensitive match")
}

func (s *UsersTestSuite) TestSearchUsers_ResponseStructure() {
	// Verify the response structure matches UserSearchResponse DTO
	resp := s.server.GET("/api/v2/users/search?email=user@test",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	users, ok := result["users"].([]any)
	s.True(ok, "Expected users array in response")
	s.NotEmpty(users)

	// Check first user has expected fields
	user := users[0].(map[string]any)
	s.Contains(user, "id", "User should have id field")
	s.Contains(user, "email", "User should have email field")
	// Optional fields may or may not be present
}
