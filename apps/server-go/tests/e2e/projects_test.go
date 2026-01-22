package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// ProjectsTestSuite tests the projects API endpoints
type ProjectsTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestProjectsSuite(t *testing.T) {
	suite.Run(t, new(ProjectsTestSuite))
}

func (s *ProjectsTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database
	testDB, err := testutil.SetupTestDB(s.ctx, "projects")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *ProjectsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *ProjectsTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)
}

// =============================================================================
// Test: List Projects
// =============================================================================

func (s *ProjectsTestSuite) TestListProjects_RequiresAuth() {
	resp := s.server.GET("/api/v2/projects")
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ProjectsTestSuite) TestListProjects_EmptyList() {
	resp := s.server.GET("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var projects []map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &projects)
	s.NoError(err)
	s.Empty(projects)
}

func (s *ProjectsTestSuite) TestListProjects_ReturnsUserProjects() {
	// Create org and project with user as member
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProjectWithMember(orgID, projectID, "Test Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var projects []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &projects)
	s.NoError(err)
	s.Len(projects, 1)
	s.Equal(projectID, projects[0]["id"])
	s.Equal("Test Project", projects[0]["name"])
	s.Equal(orgID, projects[0]["orgId"])
}

func (s *ProjectsTestSuite) TestListProjects_OnlyMemberProjects() {
	// Create two projects - user is member of one, not the other
	orgID := "11111111-1111-1111-1111-111111111111"
	project1ID := "22222222-2222-2222-2222-222222222222"
	project2ID := "33333333-3333-3333-3333-333333333333"

	err := s.createProjectWithMember(orgID, project1ID, "My Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	err = s.createProjectWithMember(orgID, project2ID, "Other Project", testutil.RegularUser.ID)
	s.Require().NoError(err)

	// AdminUser should only see project1
	resp := s.server.GET("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var projects []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &projects)
	s.NoError(err)
	s.Len(projects, 1)
	s.Equal(project1ID, projects[0]["id"])
}

func (s *ProjectsTestSuite) TestListProjects_FilterByOrgId() {
	// Create projects in different orgs
	org1ID := "11111111-1111-1111-1111-111111111111"
	org2ID := "22222222-2222-2222-2222-222222222222"
	project1ID := "33333333-3333-3333-3333-333333333333"
	project2ID := "44444444-4444-4444-4444-444444444444"

	err := s.createProjectWithMember(org1ID, project1ID, "Org1 Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	err = s.createProjectWithMember(org2ID, project2ID, "Org2 Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Filter by org1
	resp := s.server.GET("/api/v2/projects?orgId="+org1ID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var projects []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &projects)
	s.NoError(err)
	s.Len(projects, 1)
	s.Equal(project1ID, projects[0]["id"])
}

func (s *ProjectsTestSuite) TestListProjects_InvalidOrgIdReturnsEmpty() {
	// Invalid UUID format should return empty list, not error
	resp := s.server.GET("/api/v2/projects?orgId=invalid-uuid",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var projects []map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &projects)
	s.NoError(err)
	s.Empty(projects)
}

func (s *ProjectsTestSuite) TestListProjects_WithLimit() {
	// Create multiple projects
	orgID := "11111111-1111-1111-1111-111111111111"
	for i := 1; i <= 5; i++ {
		projectID := fmt.Sprintf("2222222%d-2222-2222-2222-222222222222", i)
		err := s.createProjectWithMember(orgID, projectID, fmt.Sprintf("Project %d", i), testutil.AdminUser.ID)
		s.Require().NoError(err)
	}

	resp := s.server.GET("/api/v2/projects?limit=3",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var projects []map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &projects)
	s.NoError(err)
	s.Len(projects, 3)
}

// =============================================================================
// Test: Get Project by ID
// =============================================================================

func (s *ProjectsTestSuite) TestGetProject_RequiresAuth() {
	resp := s.server.GET("/api/v2/projects/some-id")
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ProjectsTestSuite) TestGetProject_InvalidUUID() {
	resp := s.server.GET("/api/v2/projects/invalid-uuid",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("invalid-uuid", errObj["code"])
}

func (s *ProjectsTestSuite) TestGetProject_NotFound() {
	resp := s.server.GET("/api/v2/projects/00000000-0000-0000-0000-000000000000",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *ProjectsTestSuite) TestGetProject_Success() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProject(orgID, projectID, "My Project")
	s.Require().NoError(err)

	resp := s.server.GET("/api/v2/projects/"+projectID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var project map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &project)
	s.NoError(err)
	s.Equal(projectID, project["id"])
	s.Equal("My Project", project["name"])
	s.Equal(orgID, project["orgId"])
}

// =============================================================================
// Test: Create Project
// =============================================================================

func (s *ProjectsTestSuite) TestCreateProject_RequiresAuth() {
	resp := s.server.POST("/api/v2/projects",
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "New Project", "orgId": "11111111-1111-1111-1111-111111111111"}`),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ProjectsTestSuite) TestCreateProject_Success() {
	// Create org first
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Test Org")
	s.Require().NoError(err)

	resp := s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(fmt.Sprintf(`{"name": "New Project", "orgId": "%s"}`, orgID)),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var project map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &project)
	s.NoError(err)
	s.NotEmpty(project["id"])
	s.Equal("New Project", project["name"])
	s.Equal(orgID, project["orgId"])

	// Verify the project appears in list
	listResp := s.server.GET("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusOK, listResp.Code)

	var projects []map[string]any
	err = json.Unmarshal(listResp.Body.Bytes(), &projects)
	s.NoError(err)
	s.Len(projects, 1)
	s.Equal(project["id"], projects[0]["id"])
}

func (s *ProjectsTestSuite) TestCreateProject_TrimsWhitespace() {
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Test Org")
	s.Require().NoError(err)

	resp := s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(fmt.Sprintf(`{"name": "  Trimmed Name  ", "orgId": "%s"}`, orgID)),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var project map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &project)
	s.NoError(err)
	s.Equal("Trimmed Name", project["name"])
}

func (s *ProjectsTestSuite) TestCreateProject_EmptyName() {
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Test Org")
	s.Require().NoError(err)

	resp := s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(fmt.Sprintf(`{"name": "", "orgId": "%s"}`, orgID)),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("validation-failed", errObj["code"])
}

func (s *ProjectsTestSuite) TestCreateProject_MissingOrgId() {
	resp := s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "New Project"}`),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("org-required", errObj["code"])
}

func (s *ProjectsTestSuite) TestCreateProject_OrgNotFound() {
	resp := s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "New Project", "orgId": "00000000-0000-0000-0000-000000000000"}`),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("org-not-found", errObj["code"])
}

func (s *ProjectsTestSuite) TestCreateProject_DuplicateName() {
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Test Org")
	s.Require().NoError(err)

	// Create first project
	resp := s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(fmt.Sprintf(`{"name": "Duplicate Name", "orgId": "%s"}`, orgID)),
	)
	s.Equal(http.StatusCreated, resp.Code)

	// Try to create second project with same name
	resp = s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(fmt.Sprintf(`{"name": "Duplicate Name", "orgId": "%s"}`, orgID)),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("duplicate", errObj["code"])
}

func (s *ProjectsTestSuite) TestCreateProject_CreatorBecomesAdmin() {
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Test Org")
	s.Require().NoError(err)

	resp := s.server.POST("/api/v2/projects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(fmt.Sprintf(`{"name": "Admin Test Project", "orgId": "%s"}`, orgID)),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var project map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &project)
	s.NoError(err)

	// Verify membership was created with project_admin role
	var membership struct {
		Role string `bun:"role"`
	}
	err = s.testDB.DB.NewSelect().
		TableExpr("kb.project_memberships").
		Column("role").
		Where("project_id = ?", project["id"]).
		Where("user_id = ?", testutil.AdminUser.ID).
		Scan(s.ctx, &membership)
	s.NoError(err)
	s.Equal("project_admin", membership.Role)
}

// =============================================================================
// Test: Update Project
// =============================================================================

func (s *ProjectsTestSuite) TestUpdateProject_RequiresAuth() {
	resp := s.server.PATCH("/api/v2/projects/some-id",
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "Updated Name"}`),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ProjectsTestSuite) TestUpdateProject_InvalidUUID() {
	resp := s.server.PATCH("/api/v2/projects/invalid-uuid",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "Updated Name"}`),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *ProjectsTestSuite) TestUpdateProject_NotFound() {
	resp := s.server.PATCH("/api/v2/projects/00000000-0000-0000-0000-000000000000",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "Updated Name"}`),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *ProjectsTestSuite) TestUpdateProject_Success() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProject(orgID, projectID, "Original Name")
	s.Require().NoError(err)

	resp := s.server.PATCH("/api/v2/projects/"+projectID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "Updated Name"}`),
	)

	s.Equal(http.StatusOK, resp.Code)

	var project map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &project)
	s.NoError(err)
	s.Equal(projectID, project["id"])
	s.Equal("Updated Name", project["name"])
}

func (s *ProjectsTestSuite) TestUpdateProject_PartialUpdate() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProject(orgID, projectID, "Original Name")
	s.Require().NoError(err)

	// Update only kb_purpose
	resp := s.server.PATCH("/api/v2/projects/"+projectID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"kb_purpose": "Test purpose"}`),
	)

	s.Equal(http.StatusOK, resp.Code)

	var project map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &project)
	s.NoError(err)
	s.Equal("Original Name", project["name"]) // Name unchanged
	s.Equal("Test purpose", project["kb_purpose"])
}

func (s *ProjectsTestSuite) TestUpdateProject_EmptyUpdate() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProject(orgID, projectID, "Original Name")
	s.Require().NoError(err)

	// Empty update should return current project
	resp := s.server.PATCH("/api/v2/projects/"+projectID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{}`),
	)

	s.Equal(http.StatusOK, resp.Code)

	var project map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &project)
	s.NoError(err)
	s.Equal("Original Name", project["name"])
}

// =============================================================================
// Test: Delete Project
// =============================================================================

func (s *ProjectsTestSuite) TestDeleteProject_RequiresAuth() {
	resp := s.server.DELETE("/api/v2/projects/some-id")
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ProjectsTestSuite) TestDeleteProject_InvalidUUID() {
	resp := s.server.DELETE("/api/v2/projects/invalid-uuid",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *ProjectsTestSuite) TestDeleteProject_NotFound() {
	resp := s.server.DELETE("/api/v2/projects/00000000-0000-0000-0000-000000000000",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *ProjectsTestSuite) TestDeleteProject_Success() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProject(orgID, projectID, "To Delete")
	s.Require().NoError(err)

	resp := s.server.DELETE("/api/v2/projects/"+projectID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)
	s.Equal("deleted", body["status"])

	// Verify project is soft-deleted (not visible via GET)
	getResp := s.server.GET("/api/v2/projects/"+projectID,
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusNotFound, getResp.Code)
}

// =============================================================================
// Test: List Project Members
// =============================================================================

func (s *ProjectsTestSuite) TestListMembers_RequiresAuth() {
	resp := s.server.GET("/api/v2/projects/some-id/members")
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ProjectsTestSuite) TestListMembers_ProjectNotFound() {
	resp := s.server.GET("/api/v2/projects/00000000-0000-0000-0000-000000000000/members",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *ProjectsTestSuite) TestListMembers_Success() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProjectWithMember(orgID, projectID, "Test Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/v2/projects/"+projectID+"/members",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var members []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &members)
	s.NoError(err)
	s.Len(members, 1)
	s.Equal(testutil.AdminUser.ID, members[0]["id"])
	s.Equal("project_admin", members[0]["role"])
}

// =============================================================================
// Test: Remove Project Member
// =============================================================================

func (s *ProjectsTestSuite) TestRemoveMember_RequiresAuth() {
	resp := s.server.DELETE("/api/v2/projects/some-id/members/some-user-id")
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ProjectsTestSuite) TestRemoveMember_ProjectNotFound() {
	resp := s.server.DELETE("/api/v2/projects/00000000-0000-0000-0000-000000000000/members/00000000-0000-0000-0000-000000000001",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *ProjectsTestSuite) TestRemoveMember_MemberNotFound() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProjectWithMember(orgID, projectID, "Test Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Try to remove a user who is not a member
	resp := s.server.DELETE("/api/v2/projects/"+projectID+"/members/99999999-9999-9999-9999-999999999999",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *ProjectsTestSuite) TestRemoveMember_Success() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProjectWithMember(orgID, projectID, "Test Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Add a second admin
	err = testutil.CreateTestProjectMembership(s.ctx, s.testDB.DB, projectID, testutil.RegularUser.ID, "project_admin")
	s.Require().NoError(err)

	// Remove the second admin
	resp := s.server.DELETE("/api/v2/projects/"+projectID+"/members/"+testutil.RegularUser.ID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)
	s.Equal("removed", body["status"])
}

func (s *ProjectsTestSuite) TestRemoveMember_CannotRemoveLastAdmin() {
	orgID := "11111111-1111-1111-1111-111111111111"
	projectID := "22222222-2222-2222-2222-222222222222"
	err := s.createProjectWithMember(orgID, projectID, "Test Project", testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Try to remove the only admin
	resp := s.server.DELETE("/api/v2/projects/"+projectID+"/members/"+testutil.AdminUser.ID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusForbidden, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("last-admin", errObj["code"])
}

// =============================================================================
// Helpers
// =============================================================================

// createProject creates a project without membership
func (s *ProjectsTestSuite) createProject(orgID, projectID, name string) error {
	// Create org first
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Test Org")
	if err != nil {
		return err
	}

	// Create project
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.projects (id, organization_id, name, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
	`, projectID, orgID, name)
	return err
}

// createProjectWithMember creates a project and adds a user as admin member
func (s *ProjectsTestSuite) createProjectWithMember(orgID, projectID, name, userID string) error {
	err := s.createProject(orgID, projectID, name)
	if err != nil {
		return err
	}

	// Add membership
	return testutil.CreateTestProjectMembership(s.ctx, s.testDB.DB, projectID, userID, "project_admin")
}
