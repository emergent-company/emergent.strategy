package e2e

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// UserProfileTestSuite tests the user profile API endpoints
type UserProfileTestSuite struct {
	testutil.BaseSuite
}

func TestUserProfileSuite(t *testing.T) {
	suite.Run(t, new(UserProfileTestSuite))
}

func (s *UserProfileTestSuite) SetupSuite() {
	s.SetDBSuffix("userprofile")
	s.BaseSuite.SetupSuite()
}

// =============================================================================
// Test: Get User Profile
// =============================================================================

func (s *UserProfileTestSuite) TestGetProfile_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.Client.GET("/api/v2/user/profile")

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *UserProfileTestSuite) TestGetProfile_Success() {
	// e2e-test-user maps to AdminUser
	resp := s.Client.GET("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	// Verify expected fields exist
	s.Contains(profile, "id")
	s.Contains(profile, "subjectId")
	s.Contains(profile, "firstName")
	s.Contains(profile, "lastName")
	s.Contains(profile, "email")
}

func (s *UserProfileTestSuite) TestGetProfile_ResponseStructure() {
	resp := s.Client.GET("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	// Required fields
	s.Contains(profile, "id", "Profile should have id")
	s.Contains(profile, "subjectId", "Profile should have subjectId")
	s.Contains(profile, "email", "Profile should have email")

	// ID should be a valid UUID format
	id, ok := profile["id"].(string)
	s.True(ok)
	s.Len(id, 36, "ID should be UUID format")
}

// =============================================================================
// Test: Update User Profile
// =============================================================================

func (s *UserProfileTestSuite) TestUpdateProfile_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithJSON(),
		testutil.WithBody(`{"firstName": "Updated"}`),
	)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *UserProfileTestSuite) TestUpdateProfile_UpdateFirstName() {
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"firstName": "UpdatedFirst"}`),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	s.Equal("UpdatedFirst", profile["firstName"])

	// Verify the change persists
	getResp := s.Client.GET("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusOK, getResp.StatusCode)

	var getProfile map[string]any
	err = json.Unmarshal(getResp.Body, &getProfile)
	s.NoError(err)
	s.Equal("UpdatedFirst", getProfile["firstName"])
}

func (s *UserProfileTestSuite) TestUpdateProfile_UpdateLastName() {
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"lastName": "UpdatedLast"}`),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	s.Equal("UpdatedLast", profile["lastName"])
}

func (s *UserProfileTestSuite) TestUpdateProfile_UpdateDisplayName() {
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"displayName": "Test Display Name"}`),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	s.Equal("Test Display Name", profile["displayName"])
}

func (s *UserProfileTestSuite) TestUpdateProfile_UpdatePhoneE164() {
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"phoneE164": "+15551234567"}`),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	s.Equal("+15551234567", profile["phoneE164"])
}

func (s *UserProfileTestSuite) TestUpdateProfile_UpdateMultipleFields() {
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"firstName": "NewFirst", "lastName": "NewLast", "displayName": "New Display"}`),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	s.Equal("NewFirst", profile["firstName"])
	s.Equal("NewLast", profile["lastName"])
	s.Equal("New Display", profile["displayName"])
}

func (s *UserProfileTestSuite) TestUpdateProfile_RequiresAtLeastOneField() {
	// Empty body should fail
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{}`),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "at least one field")
}

func (s *UserProfileTestSuite) TestUpdateProfile_FirstNameTooLong() {
	longName := strings.Repeat("a", 101)
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"firstName": "`+longName+`"}`),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "firstName")
}

func (s *UserProfileTestSuite) TestUpdateProfile_LastNameTooLong() {
	longName := strings.Repeat("b", 101)
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"lastName": "`+longName+`"}`),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "lastName")
}

func (s *UserProfileTestSuite) TestUpdateProfile_DisplayNameTooLong() {
	longName := strings.Repeat("c", 201)
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"displayName": "`+longName+`"}`),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "displayName")
}

func (s *UserProfileTestSuite) TestUpdateProfile_PhoneTooLong() {
	longPhone := strings.Repeat("1", 21)
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"phoneE164": "`+longPhone+`"}`),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := json.Unmarshal(resp.Body, &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "phoneE164")
}

func (s *UserProfileTestSuite) TestUpdateProfile_InvalidJSON() {
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{invalid json`),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)
}

func (s *UserProfileTestSuite) TestUpdateProfile_EmptyFirstName() {
	// Setting firstName to empty string is allowed (updates to empty)
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"firstName": ""}`),
	)

	// This should be allowed - user can clear their first name
	s.Equal(http.StatusOK, resp.StatusCode)
}

func (s *UserProfileTestSuite) TestUpdateProfile_NullFieldsIgnored() {
	// First update to set a displayName
	s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"displayName": "Keep This"}`),
	)

	// Update firstName only - displayName should remain unchanged
	resp := s.Client.PUT("/api/v2/user/profile",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSON(),
		testutil.WithBody(`{"firstName": "NewFirst"}`),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var profile map[string]any
	err := json.Unmarshal(resp.Body, &profile)
	s.NoError(err)

	s.Equal("NewFirst", profile["firstName"])
	s.Equal("Keep This", profile["displayName"])
}
