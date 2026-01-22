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

// OrgsTestSuite tests the organizations API endpoints
type OrgsTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestOrgsSuite(t *testing.T) {
	suite.Run(t, new(OrgsTestSuite))
}

func (s *OrgsTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database
	testDB, err := testutil.SetupTestDB(s.ctx, "orgs")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *OrgsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *OrgsTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)
}

// =============================================================================
// Test: List Organizations
// =============================================================================

func (s *OrgsTestSuite) TestListOrgs_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.server.GET("/api/v2/orgs")

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *OrgsTestSuite) TestListOrgs_EmptyList() {
	// User with no organizations should get an empty list
	resp := s.server.GET("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var orgs []map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &orgs)
	s.NoError(err)
	s.Empty(orgs)
}

func (s *OrgsTestSuite) TestListOrgs_ReturnsUserOrgs() {
	// Create an organization and add the user as a member
	orgID := "11111111-1111-1111-1111-111111111111"
	err := s.createOrgWithMember(orgID, "Test Org 1", testutil.AdminUser.ID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var orgs []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &orgs)
	s.NoError(err)
	s.Len(orgs, 1)
	s.Equal(orgID, orgs[0]["id"])
	s.Equal("Test Org 1", orgs[0]["name"])
}

func (s *OrgsTestSuite) TestListOrgs_OnlyMemberOrgs() {
	// Create two orgs - user is member of one, not the other
	org1ID := "11111111-1111-1111-1111-111111111111"
	org2ID := "22222222-2222-2222-2222-222222222222"

	err := s.createOrgWithMember(org1ID, "My Org", testutil.AdminUser.ID)
	s.Require().NoError(err)

	err = s.createOrgWithMember(org2ID, "Other Org", testutil.RegularUser.ID)
	s.Require().NoError(err)

	// AdminUser should only see org1
	resp := s.server.GET("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var orgs []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &orgs)
	s.NoError(err)
	s.Len(orgs, 1)
	s.Equal(org1ID, orgs[0]["id"])
}

func (s *OrgsTestSuite) TestListOrgs_MultipleOrgs() {
	// Create multiple orgs for the same user
	for i := 1; i <= 3; i++ {
		orgID := fmt.Sprintf("1111111%d-1111-1111-1111-111111111111", i)
		err := s.createOrgWithMember(orgID, fmt.Sprintf("Org %d", i), testutil.AdminUser.ID)
		s.Require().NoError(err)
	}

	resp := s.server.GET("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var orgs []map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &orgs)
	s.NoError(err)
	s.Len(orgs, 3)
}

// =============================================================================
// Test: Get Organization by ID
// =============================================================================

func (s *OrgsTestSuite) TestGetOrg_RequiresAuth() {
	resp := s.server.GET("/api/v2/orgs/some-id")

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *OrgsTestSuite) TestGetOrg_NotFound() {
	resp := s.server.GET("/api/v2/orgs/00000000-0000-0000-0000-000000000000",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("not_found", errObj["code"])
}

func (s *OrgsTestSuite) TestGetOrg_Success() {
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "My Organization")
	s.Require().NoError(err)

	resp := s.server.GET("/api/v2/orgs/"+orgID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var org map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &org)
	s.NoError(err)
	s.Equal(orgID, org["id"])
	s.Equal("My Organization", org["name"])
}

// =============================================================================
// Test: Create Organization
// =============================================================================

func (s *OrgsTestSuite) TestCreateOrg_RequiresAuth() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "New Org"}`),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *OrgsTestSuite) TestCreateOrg_Success() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "New Organization"}`),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var org map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &org)
	s.NoError(err)
	s.NotEmpty(org["id"])
	s.Equal("New Organization", org["name"])

	// Verify the org appears in list
	listResp := s.server.GET("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusOK, listResp.Code)

	var orgs []map[string]any
	err = json.Unmarshal(listResp.Body.Bytes(), &orgs)
	s.NoError(err)
	s.Len(orgs, 1)
	s.Equal(org["id"], orgs[0]["id"])
}

func (s *OrgsTestSuite) TestCreateOrg_TrimsWhitespace() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "  Trimmed Name  "}`),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var org map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &org)
	s.NoError(err)
	s.Equal("Trimmed Name", org["name"])
}

func (s *OrgsTestSuite) TestCreateOrg_EmptyName() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": ""}`),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *OrgsTestSuite) TestCreateOrg_WhitespaceOnlyName() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "   "}`),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *OrgsTestSuite) TestCreateOrg_NameTooLong() {
	// Create a name longer than 120 characters
	longName := make([]byte, 121)
	for i := range longName {
		longName[i] = 'a'
	}

	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(fmt.Sprintf(`{"name": "%s"}`, string(longName))),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *OrgsTestSuite) TestCreateOrg_InvalidJSON() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{invalid json`),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *OrgsTestSuite) TestCreateOrg_MissingName() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{}`),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *OrgsTestSuite) TestCreateOrg_CreatorBecomesAdmin() {
	resp := s.server.POST("/api/v2/orgs",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"name": "Admin Test Org"}`),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var org map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &org)
	s.NoError(err)

	// Verify membership was created with org_admin role
	var membership struct {
		Role string `bun:"role"`
	}
	err = s.testDB.DB.NewSelect().
		TableExpr("kb.organization_memberships").
		Column("role").
		Where("organization_id = ?", org["id"]).
		Where("user_id = ?", testutil.AdminUser.ID).
		Scan(s.ctx, &membership)
	s.NoError(err)
	s.Equal("org_admin", membership.Role)
}

// =============================================================================
// Test: Delete Organization
// =============================================================================

func (s *OrgsTestSuite) TestDeleteOrg_RequiresAuth() {
	resp := s.server.DELETE("/api/v2/orgs/some-id")

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *OrgsTestSuite) TestDeleteOrg_NotFound() {
	resp := s.server.DELETE("/api/v2/orgs/00000000-0000-0000-0000-000000000000",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *OrgsTestSuite) TestDeleteOrg_Success() {
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "To Delete")
	s.Require().NoError(err)

	resp := s.server.DELETE("/api/v2/orgs/"+orgID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)
	s.Equal("deleted", body["status"])

	// Verify org is gone
	getResp := s.server.GET("/api/v2/orgs/"+orgID,
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusNotFound, getResp.Code)
}

// =============================================================================
// Helpers
// =============================================================================

// createOrgWithMember creates an organization and adds a user as a member
func (s *OrgsTestSuite) createOrgWithMember(orgID, name, userID string) error {
	// Create the org
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, name)
	if err != nil {
		return err
	}

	// Add membership
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.organization_memberships (organization_id, user_id, role, created_at)
		VALUES ($1, $2, 'member', NOW())
		ON CONFLICT DO NOTHING
	`, orgID, userID)
	return err
}
