package e2e

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/apitoken"
	"github.com/emergent/emergent-core/internal/testutil"
)

type ApiTokenSuite struct {
	testutil.BaseSuite
}

func (s *ApiTokenSuite) SetupSuite() {
	s.SetDBSuffix("apitoken")
	s.BaseSuite.SetupSuite()
}

// ============ Create Token Tests ============

func (s *ApiTokenSuite) TestCreateToken_Success() {
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   "Test Token",
			"scopes": []string{"schema:read", "data:read"},
		}),
	)

	s.Equal(http.StatusCreated, rec.StatusCode)

	var response apitoken.CreateApiTokenResponseDTO
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.NotEmpty(response.ID)
	s.Equal("Test Token", response.Name)
	s.Equal("emt_", response.TokenPrefix[:4])
	s.Equal([]string{"schema:read", "data:read"}, response.Scopes)
	s.NotEmpty(response.Token)
	s.True(len(response.Token) == 68) // emt_ + 64 hex chars
	s.False(response.IsRevoked)
}

func (s *ApiTokenSuite) TestCreateToken_RequiresAuth() {
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithJSONBody(map[string]any{
			"name":   "Test Token",
			"scopes": []string{"schema:read"},
		}),
	)

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *ApiTokenSuite) TestCreateToken_MissingName() {
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"scopes": []string{"schema:read"},
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *ApiTokenSuite) TestCreateToken_MissingScopes() {
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name": "Test Token",
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *ApiTokenSuite) TestCreateToken_EmptyScopes() {
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   "Test Token",
			"scopes": []string{},
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *ApiTokenSuite) TestCreateToken_InvalidScope() {
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   "Test Token",
			"scopes": []string{"invalid:scope"},
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *ApiTokenSuite) TestCreateToken_DuplicateName() {
	// Create first token with unique name
	tokenName := "Duplicate Name " + uuid.New().String()[:8]
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"schema:read"},
		}),
	)
	s.Equal(http.StatusCreated, rec.StatusCode)

	// Try to create second token with same name
	rec = s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"schema:read"},
		}),
	)
	s.Equal(http.StatusConflict, rec.StatusCode)
}

func (s *ApiTokenSuite) TestCreateToken_NameTooLong() {
	longName := make([]byte, 256)
	for i := range longName {
		longName[i] = 'a'
	}

	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   string(longName),
			"scopes": []string{"schema:read"},
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

// ============ List Tokens Tests ============

func (s *ApiTokenSuite) TestListTokens_ReturnsTokens() {
	// Create two tokens with unique names
	token1Name := "Token 1 " + uuid.New().String()[:8]
	token2Name := "Token 2 " + uuid.New().String()[:8]

	s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   token1Name,
			"scopes": []string{"schema:read"},
		}),
	)
	s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   token2Name,
			"scopes": []string{"data:read"},
		}),
	)

	rec := s.Client.GET(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response apitoken.ApiTokenListResponseDTO
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Should have at least 2 tokens (may have more from other tests in external mode)
	s.GreaterOrEqual(response.Total, 2)
	s.GreaterOrEqual(len(response.Tokens), 2)
}

func (s *ApiTokenSuite) TestListTokens_RequiresAuth() {
	rec := s.Client.GET("/api/v2/projects/" + s.ProjectID + "/tokens")

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *ApiTokenSuite) TestListTokens_DoesNotIncludeTokenValue() {
	// Create a token
	tokenName := "Test Token " + uuid.New().String()[:8]
	createRec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"schema:read"},
		}),
	)
	s.Equal(http.StatusCreated, createRec.StatusCode)

	// List tokens
	rec := s.Client.GET(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	// Check that the raw response doesn't contain a "token" field
	var raw map[string]any
	err := json.Unmarshal(rec.Body, &raw)
	s.Require().NoError(err)

	tokens := raw["tokens"].([]any)
	s.GreaterOrEqual(len(tokens), 1)

	tokenMap := tokens[0].(map[string]any)
	_, hasToken := tokenMap["token"]
	s.False(hasToken, "List response should not include token value")
}

// ============ Get Token Tests ============

func (s *ApiTokenSuite) TestGetToken_Success() {
	// Create a token
	tokenName := "Test Token " + uuid.New().String()[:8]
	createRec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"schema:read", "data:write"},
		}),
	)
	s.Equal(http.StatusCreated, createRec.StatusCode)

	var createResponse apitoken.CreateApiTokenResponseDTO
	json.Unmarshal(createRec.Body, &createResponse)

	// Get the token
	rec := s.Client.GET(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+createResponse.ID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response apitoken.ApiTokenDTO
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Equal(createResponse.ID, response.ID)
	s.Equal(tokenName, response.Name)
	s.Equal(createResponse.TokenPrefix, response.TokenPrefix)
	s.Equal([]string{"schema:read", "data:write"}, response.Scopes)
	s.False(response.IsRevoked)
}

func (s *ApiTokenSuite) TestGetToken_NotFound() {
	rec := s.Client.GET(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+uuid.New().String(),
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, rec.StatusCode)
}

func (s *ApiTokenSuite) TestGetToken_RequiresAuth() {
	rec := s.Client.GET("/api/v2/projects/" + s.ProjectID + "/tokens/" + uuid.New().String())

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

// ============ Revoke Token Tests ============

func (s *ApiTokenSuite) TestRevokeToken_Success() {
	// Create a token
	tokenName := "Token to Revoke " + uuid.New().String()[:8]
	createRec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"schema:read"},
		}),
	)
	s.Equal(http.StatusCreated, createRec.StatusCode)

	var createResponse apitoken.CreateApiTokenResponseDTO
	json.Unmarshal(createRec.Body, &createResponse)

	// Revoke the token
	rec := s.Client.DELETE(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+createResponse.ID,
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response map[string]string
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)
	s.Equal("revoked", response["status"])

	// Verify token is now revoked
	getRecPost := s.Client.GET(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+createResponse.ID,
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusOK, getRecPost.StatusCode)

	var getResponse apitoken.ApiTokenDTO
	json.Unmarshal(getRecPost.Body, &getResponse)
	s.True(getResponse.IsRevoked)
}

func (s *ApiTokenSuite) TestRevokeToken_NotFound() {
	rec := s.Client.DELETE(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+uuid.New().String(),
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusNotFound, rec.StatusCode)
}

func (s *ApiTokenSuite) TestRevokeToken_AlreadyRevoked() {
	// Create a token
	tokenName := "Token to Revoke Twice " + uuid.New().String()[:8]
	createRec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"schema:read"},
		}),
	)
	s.Equal(http.StatusCreated, createRec.StatusCode)

	var createResponse apitoken.CreateApiTokenResponseDTO
	json.Unmarshal(createRec.Body, &createResponse)

	// Revoke once
	rec := s.Client.DELETE(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+createResponse.ID,
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusOK, rec.StatusCode)

	// Try to revoke again
	rec = s.Client.DELETE(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+createResponse.ID,
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusConflict, rec.StatusCode)
}

func (s *ApiTokenSuite) TestRevokeToken_RequiresAuth() {
	rec := s.Client.DELETE("/api/v2/projects/" + s.ProjectID + "/tokens/" + uuid.New().String())

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

// ============ Duplicate Name After Revoke Tests ============

func (s *ApiTokenSuite) TestCreateToken_DuplicateNameNotAllowedAfterRevoke() {
	// The database constraint doesn't allow duplicate names even after revoke
	// This is by design - token names must be unique within a project

	// Create first token
	tokenName := "Unique Name " + uuid.New().String()[:8]
	createRec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"schema:read"},
		}),
	)
	s.Equal(http.StatusCreated, createRec.StatusCode)

	var createResponse apitoken.CreateApiTokenResponseDTO
	json.Unmarshal(createRec.Body, &createResponse)

	// Revoke it
	revokeRec := s.Client.DELETE(
		"/api/v2/projects/"+s.ProjectID+"/tokens/"+createResponse.ID,
		testutil.WithAuth("e2e-test-user"),
	)
	s.Equal(http.StatusOK, revokeRec.StatusCode)

	// Try to create new token with same name - should fail (names must be globally unique in project)
	rec := s.Client.POST(
		"/api/v2/projects/"+s.ProjectID+"/tokens",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"name":   tokenName,
			"scopes": []string{"data:read"},
		}),
	)
	s.Equal(http.StatusConflict, rec.StatusCode)
}

func TestApiTokenSuite(t *testing.T) {
	suite.Run(t, new(ApiTokenSuite))
}
