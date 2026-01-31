package e2e

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// InvitesTestSuite tests the invites API endpoints
type InvitesTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestInvitesSuite(t *testing.T) {
	suite.Run(t, new(InvitesTestSuite))
}

func (s *InvitesTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database
	testDB, err := testutil.SetupTestDB(s.ctx, "invites")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *InvitesTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *InvitesTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)
}

// =============================================================================
// Test: List Pending Invites
// =============================================================================

func (s *InvitesTestSuite) TestListPending_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.server.GET("/api/invites/pending")

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *InvitesTestSuite) TestListPending_EmptyArrayWhenNoInvites() {
	// User with no pending invites should get empty array
	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Empty(result, "Should return empty array when no pending invites")
}

func (s *InvitesTestSuite) TestListPending_WithInvite() {
	// First create an org for the invite
	orgID := "11111111-1111-1111-1111-111111111111"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Test Org")
	s.Require().NoError(err)

	// Create a pending invite for the test user
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.invites (id, email, organization_id, role, token, status, created_at)
		VALUES (
			'22222222-2222-2222-2222-222222222222',
			$1,
			$2,
			'member',
			'test-token-123',
			'pending',
			NOW()
		)
	`, testutil.AdminUser.Email, orgID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	// Should have one pending invite
	s.Len(result, 1, "Should return one pending invite")

	invite := result[0]
	s.Equal("22222222-2222-2222-2222-222222222222", invite["id"])
	s.Equal(orgID, invite["organizationId"])
	s.Equal("member", invite["role"])
	s.Equal("test-token-123", invite["token"])
}

func (s *InvitesTestSuite) TestListPending_InviteStructure() {
	// Create org and project for the invite
	orgID := "33333333-3333-3333-3333-333333333333"
	projectID := "44444444-4444-4444-4444-444444444444"

	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Structured Org")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    projectID,
		Name:  "Test Project",
		OrgID: orgID,
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create a pending invite with project
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.invites (id, email, organization_id, project_id, role, token, status, expires_at, created_at)
		VALUES (
			'55555555-5555-5555-5555-555555555555',
			$1,
			$2,
			$3,
			'editor',
			'test-token-456',
			'pending',
			NOW() + INTERVAL '7 days',
			NOW()
		)
	`, testutil.AdminUser.Email, orgID, projectID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 1)
	invite := result[0]

	// Verify structure
	s.Contains(invite, "id", "Invite should have id")
	s.Contains(invite, "organizationId", "Invite should have organizationId")
	s.Contains(invite, "role", "Invite should have role")
	s.Contains(invite, "token", "Invite should have token")
	s.Contains(invite, "createdAt", "Invite should have createdAt")

	// Optional fields when project invite
	s.Contains(invite, "projectId", "Project invite should have projectId")
	s.Equal(projectID, invite["projectId"])
	s.Contains(invite, "organizationName", "Invite should include organization name")
	s.Equal("Structured Org", invite["organizationName"])
}

func (s *InvitesTestSuite) TestListPending_ExcludesExpiredInvites() {
	// Create an org
	orgID := "66666666-6666-6666-6666-666666666666"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Expired Org")
	s.Require().NoError(err)

	// Create an expired invite
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.invites (id, email, organization_id, role, token, status, expires_at, created_at)
		VALUES (
			'77777777-7777-7777-7777-777777777777',
			$1,
			$2,
			'member',
			'expired-token',
			'pending',
			NOW() - INTERVAL '1 day',
			NOW() - INTERVAL '8 days'
		)
	`, testutil.AdminUser.Email, orgID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	// Expired invite should not be included
	s.Empty(result, "Should not include expired invites")
}

func (s *InvitesTestSuite) TestListPending_ExcludesAcceptedInvites() {
	// Create an org
	orgID := "88888888-8888-8888-8888-888888888888"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Accepted Org")
	s.Require().NoError(err)

	// Create an accepted invite
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.invites (id, email, organization_id, role, token, status, created_at)
		VALUES (
			'99999999-9999-9999-9999-999999999999',
			$1,
			$2,
			'member',
			'accepted-token',
			'accepted',
			NOW()
		)
	`, testutil.AdminUser.Email, orgID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	// Accepted invite should not be included
	s.Empty(result, "Should not include accepted invites")
}

func (s *InvitesTestSuite) TestListPending_CaseInsensitiveEmail() {
	// Create an org
	orgID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Case Org")
	s.Require().NoError(err)

	// Create invite with different case email
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.invites (id, email, organization_id, role, token, status, created_at)
		VALUES (
			'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
			UPPER($1),
			$2,
			'member',
			'case-token',
			'pending',
			NOW()
		)
	`, testutil.AdminUser.Email, orgID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	// Should match regardless of email case
	s.Len(result, 1, "Should find invite with different case email")
}

func (s *InvitesTestSuite) TestListPending_MultipleInvites() {
	// Create an org
	orgID := "cccccccc-cccc-cccc-cccc-cccccccccccc"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Multi Org")
	s.Require().NoError(err)

	// Create multiple pending invites
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.invites (id, email, organization_id, role, token, status, created_at)
		VALUES 
			('dddddddd-dddd-dddd-dddd-dddddddddddd', $1, $2, 'member', 'token1', 'pending', NOW()),
			('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', $1, $2, 'editor', 'token2', 'pending', NOW() - INTERVAL '1 hour')
	`, testutil.AdminUser.Email, orgID)
	s.Require().NoError(err)

	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	s.Len(result, 2, "Should return all pending invites")

	// Most recent should be first (ordered by created_at DESC)
	s.Equal("dddddddd-dddd-dddd-dddd-dddddddddddd", result[0]["id"])
}

func (s *InvitesTestSuite) TestListPending_UserWithNoEmailsReturnsEmpty() {
	// Create an org
	orgID := "ffffffff-ffff-ffff-ffff-ffffffffffff"
	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, orgID, "Some Org")
	s.Require().NoError(err)

	// Create an invite for a specific email
	_, err = s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.invites (id, email, organization_id, role, token, status, created_at)
		VALUES (
			'11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			'other@example.com',
			$1,
			'member',
			'some-token',
			'pending',
			NOW()
		)
	`, orgID)
	s.Require().NoError(err)

	// e2e-other-user is a dynamically created user with no email entries in core.user_emails
	// They should get an empty result since the invite is for other@example.com
	resp := s.server.GET("/api/invites/pending",
		testutil.WithAuth("e2e-other-user"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var result []map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)

	// User with no email entries should get empty array
	s.Empty(result, "User with no emails should see no invites")
}
