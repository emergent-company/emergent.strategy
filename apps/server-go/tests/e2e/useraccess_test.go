package e2e

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// UserAccessTestSuite tests the user access API endpoints
type UserAccessTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestUserAccessSuite(t *testing.T) {
	suite.Run(t, new(UserAccessTestSuite))
}

func (s *UserAccessTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database
	testDB, err := testutil.SetupTestDB(s.ctx, "useraccess")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *UserAccessTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *UserAccessTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)
}

// =============================================================================
// Test: Get Orgs and Projects (Access Tree)
// =============================================================================

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.server.GET("/user/orgs-and-projects")

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_EmptyWhenNoMemberships() {
	// User with no org memberships should get empty array
	resp := s.server.GET("/user/orgs-and-projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Empty(result, "Should return empty array when user has no memberships")
}

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_ReturnsOrgStructure() {
	// Create org and add membership
	orgID := "11111111-1111-1111-1111-111111111111"
	err := s.createOrgWithMember(orgID, "Test Org", testutil.AdminUser.ID, "admin")
	s.Require().NoError(err)

	resp := s.server.GET("/user/orgs-and-projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 1)
	org := result[0]
	s.Equal(orgID, org["id"])
	s.Equal("Test Org", org["name"])
	s.Equal("admin", org["role"])
	s.Contains(org, "projects", "Org should have projects array")
}

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_OrgHasProjects() {
	// Create org with project
	orgID := "22222222-2222-2222-2222-222222222222"
	projectID := "33333333-3333-3333-3333-333333333333"

	err := s.createOrgWithMember(orgID, "Org With Project", testutil.AdminUser.ID, "admin")
	s.Require().NoError(err)

	err = s.createProjectWithMember(projectID, "Test Project", orgID, testutil.AdminUser.ID, "editor")
	s.Require().NoError(err)

	resp := s.server.GET("/user/orgs-and-projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 1)
	org := result[0]

	projects, ok := org["projects"].([]any)
	s.True(ok)
	s.Len(projects, 1)

	project := projects[0].(map[string]any)
	s.Equal(projectID, project["id"])
	s.Equal("Test Project", project["name"])
	s.Equal(orgID, project["orgId"])
	s.Equal("editor", project["role"])
}

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_MultipleOrgs() {
	// Create multiple orgs
	org1ID := "44444444-4444-4444-4444-444444444444"
	org2ID := "55555555-5555-5555-5555-555555555555"

	err := s.createOrgWithMember(org1ID, "Org 1", testutil.AdminUser.ID, "admin")
	s.Require().NoError(err)

	err = s.createOrgWithMember(org2ID, "Org 2", testutil.AdminUser.ID, "member")
	s.Require().NoError(err)

	resp := s.server.GET("/user/orgs-and-projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 2, "Should return both orgs")
}

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_MultipleProjects() {
	// Create org with multiple projects
	orgID := "66666666-6666-6666-6666-666666666666"
	project1ID := "77777777-7777-7777-7777-777777777777"
	project2ID := "88888888-8888-8888-8888-888888888888"

	err := s.createOrgWithMember(orgID, "Multi Project Org", testutil.AdminUser.ID, "admin")
	s.Require().NoError(err)

	err = s.createProjectWithMember(project1ID, "Project 1", orgID, testutil.AdminUser.ID, "editor")
	s.Require().NoError(err)

	err = s.createProjectWithMember(project2ID, "Project 2", orgID, testutil.AdminUser.ID, "viewer")
	s.Require().NoError(err)

	resp := s.server.GET("/user/orgs-and-projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 1)
	projects, ok := result[0]["projects"].([]any)
	s.True(ok)
	s.Len(projects, 2, "Org should have both projects")
}

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_OnlyUserMemberships() {
	// Create org for admin user
	adminOrgID := "99999999-9999-9999-9999-999999999999"
	err := s.createOrgWithMember(adminOrgID, "Admin Only Org", testutil.AdminUser.ID, "admin")
	s.Require().NoError(err)

	// Create org for regular user
	regularOrgID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	err = s.createOrgWithMember(regularOrgID, "Regular User Org", testutil.RegularUser.ID, "admin")
	s.Require().NoError(err)

	// Admin user should only see their org
	resp := s.server.GET("/user/orgs-and-projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 1, "Should only see admin's org")
	s.Equal(adminOrgID, result[0]["id"])
}

func (s *UserAccessTestSuite) TestGetOrgsAndProjects_DifferentRoles() {
	// Create org with owner role
	ownerOrgID := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	err := s.createOrgWithMember(ownerOrgID, "Owner Org", testutil.AdminUser.ID, "owner")
	s.Require().NoError(err)

	resp := s.server.GET("/user/orgs-and-projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 1)
	s.Equal("owner", result[0]["role"])
}

// =============================================================================
// Helper Functions
// =============================================================================

func (s *UserAccessTestSuite) createOrgWithMember(orgID, name, userID, role string) error {
	// Create the org
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, name)
	if err != nil {
		return err
	}

	// Add membership
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.organization_memberships (organization_id, user_id, role, created_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT DO NOTHING
	`, orgID, userID, role)
	return err
}

func (s *UserAccessTestSuite) createProjectWithMember(projectID, name, orgID, userID, role string) error {
	// Create the project
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    projectID,
		Name:  name,
		OrgID: orgID,
	}, userID)
	if err != nil {
		return err
	}

	// Add membership
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.project_memberships (project_id, user_id, role, created_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT DO NOTHING
	`, projectID, userID, role)
	return err
}
