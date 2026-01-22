package e2e

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/graph"
	"github.com/emergent/emergent-core/internal/testutil"
)

type GraphSuite struct {
	testutil.BaseSuite
}

func (s *GraphSuite) SetupSuite() {
	s.SetDBSuffix("graph")
	s.BaseSuite.SetupSuite()
}

// ============ Create Object Tests ============

func (s *GraphSuite) TestCreateObject_Success() {
	rec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "Requirement",
			"status": "draft",
			"properties": map[string]any{
				"title":       "User Authentication",
				"description": "Implement user auth flow",
			},
			"labels": []string{"security", "mvp"},
		}),
	)

	s.Equal(http.StatusCreated, rec.StatusCode, "Response: %s", rec.String())

	var response graph.GraphObjectResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.NotEmpty(response.ID)
	s.Equal("Requirement", response.Type)
	s.Equal("draft", *response.Status)
	s.Equal("User Authentication", response.Properties["title"])
	s.Equal([]string{"security", "mvp"}, response.Labels)
	s.Equal(1, response.Version)
	s.Equal(response.ID, response.CanonicalID)
	s.Nil(response.SupersedesID)
}

func (s *GraphSuite) TestCreateObject_RequiresAuth() {
	rec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type": "Requirement",
		}),
	)

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *GraphSuite) TestCreateObject_RequiresProjectID() {
	rec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(map[string]any{
			"type": "Requirement",
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSuite) TestCreateObject_MissingType() {
	rec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"status": "draft",
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSuite) TestCreateObject_MinimalFields() {
	rec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type": "Task",
		}),
	)

	s.Equal(http.StatusCreated, rec.StatusCode)

	var response graph.GraphObjectResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Equal("Task", response.Type)
	s.NotNil(response.Properties)
	s.NotNil(response.Labels)
}

// ============ Get Object Tests ============

func (s *GraphSuite) TestGetObject_Success() {
	// Create an object first
	createRec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "Decision",
			"status": "approved",
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Get the object
	rec := s.Client.GET(
		"/api/v2/graph/objects/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.GraphObjectResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Equal(created.ID, response.ID)
	s.Equal("Decision", response.Type)
	s.Equal("approved", *response.Status)
}

func (s *GraphSuite) TestGetObject_NotFound() {
	rec := s.Client.GET(
		"/api/v2/graph/objects/"+uuid.New().String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusNotFound, rec.StatusCode)
}

// ============ List Objects Tests ============

func (s *GraphSuite) TestListObjects_Empty() {
	rec := s.Client.GET(
		"/api/v2/graph/objects/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchGraphObjectsResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Empty(response.Items)
	s.Equal(0, response.Total)
}

func (s *GraphSuite) TestListObjects_WithObjects() {
	// Create some objects
	for i := 0; i < 3; i++ {
		rec := s.Client.POST(
			"/api/v2/graph/objects",
			testutil.WithAuth("e2e-test-user"),
			testutil.WithProjectID(s.ProjectID),
			testutil.WithJSONBody(map[string]any{
				"type": "Requirement",
			}),
		)
		s.Require().Equal(http.StatusCreated, rec.StatusCode)
	}

	rec := s.Client.GET(
		"/api/v2/graph/objects/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchGraphObjectsResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response.Items, 3)
}

func (s *GraphSuite) TestListObjects_FilterByType() {
	// Create objects of different types
	s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{"type": "Requirement"}),
	)
	s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{"type": "Decision"}),
	)
	s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{"type": "Requirement"}),
	)

	rec := s.Client.GET(
		"/api/v2/graph/objects/search?types=Requirement",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchGraphObjectsResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response.Items, 2)
	for _, obj := range response.Items {
		s.Equal("Requirement", obj.Type)
	}
}

func (s *GraphSuite) TestListObjects_Pagination_Limit() {
	// Create 5 objects
	for i := 0; i < 5; i++ {
		rec := s.Client.POST(
			"/api/v2/graph/objects",
			testutil.WithAuth("e2e-test-user"),
			testutil.WithProjectID(s.ProjectID),
			testutil.WithJSONBody(map[string]any{
				"type": "Requirement",
				"properties": map[string]any{
					"index": i,
				},
			}),
		)
		s.Require().Equal(http.StatusCreated, rec.StatusCode)
	}

	// Request with limit=2
	rec := s.Client.GET(
		"/api/v2/graph/objects/search?limit=2",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchGraphObjectsResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response.Items, 2)
	s.Greater(response.Total, 2) // Total is 5, we only got 2 (limit)
	s.NotNil(response.NextCursor)
}

func (s *GraphSuite) TestListObjects_Pagination_Cursor() {
	// Create 5 objects
	createdIDs := make([]uuid.UUID, 5)
	for i := 0; i < 5; i++ {
		rec := s.Client.POST(
			"/api/v2/graph/objects",
			testutil.WithAuth("e2e-test-user"),
			testutil.WithProjectID(s.ProjectID),
			testutil.WithJSONBody(map[string]any{
				"type": "Requirement",
				"properties": map[string]any{
					"index": i,
				},
			}),
		)
		s.Require().Equal(http.StatusCreated, rec.StatusCode)

		var created graph.GraphObjectResponse
		err := json.Unmarshal(rec.Body, &created)
		s.Require().NoError(err)
		createdIDs[i] = created.ID
	}

	// First page
	rec := s.Client.GET(
		"/api/v2/graph/objects/search?limit=2",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var page1 graph.SearchGraphObjectsResponse
	err := json.Unmarshal(rec.Body, &page1)
	s.Require().NoError(err)

	s.Len(page1.Items, 2)
	s.Greater(page1.Total, 2) // Total is 5, we only got 2 (limit)
	s.NotNil(page1.NextCursor)

	// Second page using cursor
	rec = s.Client.GET(
		"/api/v2/graph/objects/search?limit=2&cursor="+*page1.NextCursor,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var page2 graph.SearchGraphObjectsResponse
	err = json.Unmarshal(rec.Body, &page2)
	s.Require().NoError(err)

	s.Len(page2.Items, 2)
	s.Greater(page2.Total, 2) // Total is still 5

	// Third page
	rec = s.Client.GET(
		"/api/v2/graph/objects/search?limit=2&cursor="+*page2.NextCursor,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var page3 graph.SearchGraphObjectsResponse
	err = json.Unmarshal(rec.Body, &page3)
	s.Require().NoError(err)

	s.Len(page3.Items, 1)
	s.Nil(page3.NextCursor) // No more pages

	// Verify no duplicates across pages
	allIDs := make(map[uuid.UUID]bool)
	for _, obj := range page1.Items {
		s.False(allIDs[obj.ID], "Duplicate ID found")
		allIDs[obj.ID] = true
	}
	for _, obj := range page2.Items {
		s.False(allIDs[obj.ID], "Duplicate ID found")
		allIDs[obj.ID] = true
	}
	for _, obj := range page3.Items {
		s.False(allIDs[obj.ID], "Duplicate ID found")
		allIDs[obj.ID] = true
	}
	s.Len(allIDs, 5)
}

func (s *GraphSuite) TestListObjects_InvalidCursor() {
	rec := s.Client.GET(
		"/api/v2/graph/objects/search?cursor=invalid-cursor-format",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

// ============ Patch Object Tests ============

func (s *GraphSuite) TestPatchObject_Success() {
	// Create an object
	createRec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "Requirement",
			"status": "draft",
			"properties": map[string]any{
				"title": "Original Title",
			},
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Patch the object
	rec := s.Client.PATCH(
		"/api/v2/graph/objects/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"status": "approved",
			"properties": map[string]any{
				"title": "Updated Title",
			},
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode, "Response: %s", rec.String())

	var response graph.GraphObjectResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// New version should be created
	s.NotEqual(created.ID, response.ID)
	s.Equal(created.CanonicalID, response.CanonicalID)
	s.Equal(2, response.Version)
	s.Equal("approved", *response.Status)
	s.Equal("Updated Title", response.Properties["title"])
}

func (s *GraphSuite) TestPatchObject_MergesProperties() {
	// Create an object with multiple properties
	createRec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type": "Requirement",
			"properties": map[string]any{
				"title":       "Original Title",
				"description": "Original Description",
				"priority":    "high",
			},
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Patch only the title
	rec := s.Client.PATCH(
		"/api/v2/graph/objects/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"properties": map[string]any{
				"title": "Updated Title",
			},
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.GraphObjectResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Original properties should be preserved
	s.Equal("Updated Title", response.Properties["title"])
	s.Equal("Original Description", response.Properties["description"])
	s.Equal("high", response.Properties["priority"])
}

// ============ Delete Object Tests ============

func (s *GraphSuite) TestDeleteObject_Success() {
	// Create an object
	createRec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type": "Requirement",
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Delete the object
	rec := s.Client.DELETE(
		"/api/v2/graph/objects/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	// Object should not appear in list
	listRec := s.Client.GET(
		"/api/v2/graph/objects/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	var listResponse graph.SearchGraphObjectsResponse
	err = json.Unmarshal(listRec.Body, &listResponse)
	s.Require().NoError(err)

	s.Empty(listResponse.Items)
}

func (s *GraphSuite) TestDeleteObject_NotFound() {
	rec := s.Client.DELETE(
		"/api/v2/graph/objects/"+uuid.New().String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusNotFound, rec.StatusCode)
}

// ============ Restore Object Tests ============

func (s *GraphSuite) TestRestoreObject_Success() {
	// Create and delete an object
	createRec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type": "Requirement",
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	deleteRec := s.Client.DELETE(
		"/api/v2/graph/objects/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)
	s.Require().Equal(http.StatusOK, deleteRec.StatusCode)

	// Get the deleted object to find its new ID (tombstone version)
	listRec := s.Client.GET(
		"/api/v2/graph/objects/search?include_deleted=true",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)
	s.Require().Equal(http.StatusOK, listRec.StatusCode)

	var listResponse graph.SearchGraphObjectsResponse
	err = json.Unmarshal(listRec.Body, &listResponse)
	s.Require().NoError(err)
	s.Require().Len(listResponse.Items, 1)

	deletedID := listResponse.Items[0].ID

	// Restore the object
	rec := s.Client.POST(
		"/api/v2/graph/objects/"+deletedID.String()+"/restore",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode, "Response: %s", rec.String())

	var response graph.GraphObjectResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Nil(response.DeletedAt)
	s.Equal(created.CanonicalID, response.CanonicalID)
}

// ============ History Tests ============

func (s *GraphSuite) TestGetObjectHistory_Success() {
	// Create an object and update it
	createRec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "Requirement",
			"status": "draft",
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Update the object
	s.Client.PATCH(
		"/api/v2/graph/objects/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"status": "approved",
		}),
	)

	// Get history
	rec := s.Client.GET(
		"/api/v2/graph/objects/"+created.ID.String()+"/history",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.ObjectHistoryResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response.Versions, 2)
	// Versions should be in descending order
	s.Equal(2, response.Versions[0].Version)
	s.Equal(1, response.Versions[1].Version)
}

// ============ Edges Tests ============

func (s *GraphSuite) TestGetObjectEdges_Empty() {
	// Create an object
	createRec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type": "Requirement",
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Get edges
	rec := s.Client.GET(
		"/api/v2/graph/objects/"+created.ID.String()+"/edges",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.GetObjectEdgesResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Empty(response.Incoming)
	s.Empty(response.Outgoing)
}

// ============ Relationship Tests ============

// Helper to create a graph object and return its ID
func (s *GraphSuite) createObject(objType string) uuid.UUID {
	rec := s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type": objType,
		}),
	)
	s.Require().Equal(http.StatusCreated, rec.StatusCode)

	var created graph.GraphObjectResponse
	err := json.Unmarshal(rec.Body, &created)
	s.Require().NoError(err)

	return created.ID
}

func (s *GraphSuite) TestCreateRelationship_Success() {
	// Create two objects
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create a relationship between them
	rec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
			"properties": map[string]any{
				"reason": "Decision informs requirement",
			},
			"weight": 0.8,
		}),
	)

	s.Equal(http.StatusCreated, rec.StatusCode, "Response: %s", rec.String())

	var response graph.GraphRelationshipResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.NotEmpty(response.ID)
	s.Equal("DEPENDS_ON", response.Type)
	s.Equal(srcID, response.SrcID)
	s.Equal(dstID, response.DstID)
	s.Equal("Decision informs requirement", response.Properties["reason"])
	s.NotNil(response.Weight)
	s.InDelta(0.8, *response.Weight, 0.001)
	s.Equal(1, response.Version)
	s.Equal(response.ID, response.CanonicalID)
}

func (s *GraphSuite) TestCreateRelationship_RequiresAuth() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	rec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
		}),
	)

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *GraphSuite) TestCreateRelationship_MissingType() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	rec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSuite) TestCreateRelationship_SelfLoopNotAllowed() {
	objID := s.createObject("Requirement")

	rec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": objID.String(),
			"dst_id": objID.String(), // Same as src
		}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSuite) TestCreateRelationship_EndpointNotFound() {
	srcID := s.createObject("Requirement")

	rec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": uuid.New().String(), // Non-existent
		}),
	)

	s.Equal(http.StatusNotFound, rec.StatusCode)
}

func (s *GraphSuite) TestCreateRelationship_Idempotent() {
	s.T().Log("TestCreateRelationship_Idempotent START")
	
	// Creating the same relationship twice should return the same relationship
	s.T().Log("Creating srcID object...")
	srcID := s.createObject("Requirement")
	s.T().Logf("Created srcID: %s", srcID)
	
	s.T().Log("Creating dstID object...")
	dstID := s.createObject("Decision")
	s.T().Logf("Created dstID: %s", dstID)

	// First creation
	s.T().Log("Creating first relationship...")
	rec1 := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
			"properties": map[string]any{
				"reason": "test",
			},
		}),
	)
	s.T().Logf("rec1 status: %d, body: %s", rec1.StatusCode, rec1.String())
	s.Require().Equal(http.StatusCreated, rec1.StatusCode)

	var first graph.GraphRelationshipResponse
	err := json.Unmarshal(rec1.Body, &first)
	s.Require().NoError(err)
	s.T().Logf("First relationship created: %s", first.ID)

	// Second creation with same properties
	s.T().Log("Creating second relationship (should be idempotent)...")
	rec2 := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
			"properties": map[string]any{
				"reason": "test",
			},
		}),
	)
	s.T().Logf("rec2 status: %d, body: %s", rec2.StatusCode, rec2.String())
	s.Require().Equal(http.StatusCreated, rec2.StatusCode)

	var second graph.GraphRelationshipResponse
	err = json.Unmarshal(rec2.Body, &second)
	s.Require().NoError(err)

	// Should return the same relationship (no new version)
	s.Equal(first.ID, second.ID)
	s.Equal(first.Version, second.Version)
}

func (s *GraphSuite) TestGetRelationship_Success() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create a relationship
	createRec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphRelationshipResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Get the relationship
	rec := s.Client.GET(
		"/api/v2/graph/relationships/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.GraphRelationshipResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Equal(created.ID, response.ID)
	s.Equal("DEPENDS_ON", response.Type)
	s.Equal(srcID, response.SrcID)
	s.Equal(dstID, response.DstID)
}

func (s *GraphSuite) TestGetRelationship_NotFound() {
	rec := s.Client.GET(
		"/api/v2/graph/relationships/"+uuid.New().String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusNotFound, rec.StatusCode)
}

func (s *GraphSuite) TestListRelationships_Empty() {
	rec := s.Client.GET(
		"/api/v2/graph/relationships/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchRelationshipsResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Empty(response.Data)
	s.False(response.HasMore)
}

func (s *GraphSuite) TestListRelationships_FilterByType() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")
	dst2ID := s.createObject("Task")

	// Create relationships of different types
	s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
		}),
	)
	s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "IMPLEMENTS",
			"src_id": srcID.String(),
			"dst_id": dst2ID.String(),
		}),
	)

	// Filter by type
	rec := s.Client.GET(
		"/api/v2/graph/relationships/search?type=DEPENDS_ON",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchRelationshipsResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response.Data, 1)
	s.Equal("DEPENDS_ON", response.Data[0].Type)
}

func (s *GraphSuite) TestListRelationships_FilterBySrcID() {
	src1ID := s.createObject("Requirement")
	src2ID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create relationships from different sources
	s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": src1ID.String(),
			"dst_id": dstID.String(),
		}),
	)
	s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": src2ID.String(),
			"dst_id": dstID.String(),
		}),
	)

	// Filter by src_id
	rec := s.Client.GET(
		"/api/v2/graph/relationships/search?src_id="+src1ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchRelationshipsResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response.Data, 1)
	s.Equal(src1ID, response.Data[0].SrcID)
}

func (s *GraphSuite) TestPatchRelationship_Success() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create a relationship
	createRec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
			"properties": map[string]any{
				"reason": "Initial reason",
			},
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphRelationshipResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Patch the relationship
	rec := s.Client.PATCH(
		"/api/v2/graph/relationships/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"properties": map[string]any{
				"reason": "Updated reason",
			},
			"weight": 0.9,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode, "Response: %s", rec.String())

	var response graph.GraphRelationshipResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// New version should be created
	s.NotEqual(created.ID, response.ID)
	s.Equal(created.CanonicalID, response.CanonicalID)
	s.Equal(2, response.Version)
	s.Equal("Updated reason", response.Properties["reason"])
	s.NotNil(response.Weight)
	s.InDelta(0.9, *response.Weight, 0.001)
}

func (s *GraphSuite) TestPatchRelationship_MergesProperties() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create a relationship with multiple properties
	createRec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
			"properties": map[string]any{
				"reason":   "Initial reason",
				"priority": "high",
			},
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphRelationshipResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Patch only the reason
	rec := s.Client.PATCH(
		"/api/v2/graph/relationships/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"properties": map[string]any{
				"reason": "Updated reason",
			},
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.GraphRelationshipResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Both properties should exist
	s.Equal("Updated reason", response.Properties["reason"])
	s.Equal("high", response.Properties["priority"])
}

func (s *GraphSuite) TestDeleteRelationship_Success() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create a relationship
	createRec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphRelationshipResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Delete the relationship
	rec := s.Client.DELETE(
		"/api/v2/graph/relationships/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.GraphRelationshipResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Should return tombstone
	s.NotNil(response.DeletedAt)

	// Relationship should not appear in list
	listRec := s.Client.GET(
		"/api/v2/graph/relationships/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	var listResponse graph.SearchRelationshipsResponse
	err = json.Unmarshal(listRec.Body, &listResponse)
	s.Require().NoError(err)

	s.Empty(listResponse.Data)
}

func (s *GraphSuite) TestRestoreRelationship_Success() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create and delete a relationship
	createRec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphRelationshipResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Delete
	deleteRec := s.Client.DELETE(
		"/api/v2/graph/relationships/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)
	s.Require().Equal(http.StatusOK, deleteRec.StatusCode)

	var deleted graph.GraphRelationshipResponse
	err = json.Unmarshal(deleteRec.Body, &deleted)
	s.Require().NoError(err)

	// Restore
	rec := s.Client.POST(
		"/api/v2/graph/relationships/"+deleted.ID.String()+"/restore",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusCreated, rec.StatusCode, "Response: %s", rec.String())

	var response graph.GraphRelationshipResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Nil(response.DeletedAt)
	s.Equal(created.CanonicalID, response.CanonicalID)
}

func (s *GraphSuite) TestGetRelationshipHistory_Success() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create a relationship and update it
	createRec := s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
			"properties": map[string]any{
				"reason": "Version 1",
			},
		}),
	)
	s.Require().Equal(http.StatusCreated, createRec.StatusCode)

	var created graph.GraphRelationshipResponse
	err := json.Unmarshal(createRec.Body, &created)
	s.Require().NoError(err)

	// Update to create version 2
	s.Client.PATCH(
		"/api/v2/graph/relationships/"+created.ID.String(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"properties": map[string]any{
				"reason": "Version 2",
			},
		}),
	)

	// Get history
	rec := s.Client.GET(
		"/api/v2/graph/relationships/"+created.ID.String()+"/history",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response []*graph.GraphRelationshipResponse
	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response, 2)
	// Versions should be in descending order
	s.Equal(2, response[0].Version)
	s.Equal(1, response[1].Version)
}

func (s *GraphSuite) TestGetObjectEdges_WithRelationships() {
	srcID := s.createObject("Requirement")
	dstID := s.createObject("Decision")

	// Create a relationship
	s.Client.POST(
		"/api/v2/graph/relationships",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "DEPENDS_ON",
			"src_id": srcID.String(),
			"dst_id": dstID.String(),
		}),
	)

	// Get edges for source object
	rec := s.Client.GET(
		"/api/v2/graph/objects/"+srcID.String()+"/edges",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.GetObjectEdgesResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Len(response.Outgoing, 1)
	s.Empty(response.Incoming)
	s.Equal("DEPENDS_ON", response.Outgoing[0].Type)

	// Get edges for destination object
	rec = s.Client.GET(
		"/api/v2/graph/objects/"+dstID.String()+"/edges",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	err = json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Empty(response.Outgoing)
	s.Len(response.Incoming, 1)
	s.Equal("DEPENDS_ON", response.Incoming[0].Type)
}

// ============ Search Tests ============

func (s *GraphSuite) TestFTSSearch_RequiresAuth() {
	rec := s.Client.GET(
		"/api/v2/graph/objects/fts?q=test",
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *GraphSuite) TestFTSSearch_RequiresQuery() {
	rec := s.Client.GET(
		"/api/v2/graph/objects/fts",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSuite) TestFTSSearch_EmptyResults() {
	// Search with no objects in DB
	rec := s.Client.GET(
		"/api/v2/graph/objects/fts?q=nonexistent",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.Empty(response.Data)
	s.Equal(0, response.Total)
	s.False(response.HasMore)
}

func (s *GraphSuite) TestFTSSearch_WithFilters() {
	// Create some objects (FTS index is populated by DB trigger)
	s.Client.POST(
		"/api/v2/graph/objects",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"type":   "Requirement",
			"labels": []string{"important"},
		}),
	)

	// Search with type filter
	rec := s.Client.GET(
		"/api/v2/graph/objects/fts?q=test&types=Requirement",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Results may be empty if FTS trigger doesn't index 'Requirement'
	// The main point is the API accepts the parameters
	s.NotNil(response.Data)
}

func (s *GraphSuite) TestVectorSearch_RequiresAuth() {
	rec := s.Client.POST(
		"/api/v2/graph/objects/vector-search",
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"vector": []float32{0.1, 0.2, 0.3},
		}),
	)

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *GraphSuite) TestVectorSearch_RequiresVector() {
	rec := s.Client.POST(
		"/api/v2/graph/objects/vector-search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSuite) TestVectorSearch_EmptyResults() {
	// Generate a 768-dim vector (matching embedding_v2 dimensions)
	vector := make([]float32, 768)
	for i := range vector {
		vector[i] = float32(i) * 0.001
	}

	rec := s.Client.POST(
		"/api/v2/graph/objects/vector-search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"vector": vector,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// No objects with embeddings, so empty results
	s.Empty(response.Data)
	s.Equal(0, response.Total)
	s.False(response.HasMore)
}

func (s *GraphSuite) TestVectorSearch_WithFilters() {
	// Generate a 768-dim vector
	vector := make([]float32, 768)
	for i := range vector {
		vector[i] = float32(i) * 0.001
	}

	rec := s.Client.POST(
		"/api/v2/graph/objects/vector-search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"vector":      vector,
			"types":       []string{"Requirement"},
			"limit":       10,
			"maxDistance": 0.5,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	// Results empty but API accepts the parameters
	s.NotNil(response.Data)
}

func (s *GraphSuite) TestHybridSearch_RequiresAuth() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query": "test",
		}),
	)

	s.Equal(http.StatusUnauthorized, rec.StatusCode)
}

func (s *GraphSuite) TestHybridSearch_RequiresQueryOrVector() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{}),
	)

	s.Equal(http.StatusBadRequest, rec.StatusCode)
}

func (s *GraphSuite) TestHybridSearch_QueryOnly() {
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

	// Results may be empty, but response structure is correct
	s.NotNil(response.Data)
}

func (s *GraphSuite) TestHybridSearch_VectorOnly() {
	// Generate a 768-dim vector
	vector := make([]float32, 768)
	for i := range vector {
		vector[i] = float32(i) * 0.001
	}

	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"vector": vector,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.NotNil(response.Data)
}

func (s *GraphSuite) TestHybridSearch_QueryAndVector() {
	// Generate a 768-dim vector
	vector := make([]float32, 768)
	for i := range vector {
		vector[i] = float32(i) * 0.001
	}

	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":         "authentication",
			"vector":        vector,
			"lexicalWeight": 0.7,
			"vectorWeight":  0.3,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.NotNil(response.Data)
}

func (s *GraphSuite) TestHybridSearch_WithFilters() {
	rec := s.Client.POST(
		"/api/v2/graph/search",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.ProjectID),
		testutil.WithJSONBody(map[string]any{
			"query":  "authentication",
			"types":  []string{"Requirement", "Decision"},
			"labels": []string{"security"},
			"limit":  10,
		}),
	)

	s.Equal(http.StatusOK, rec.StatusCode)

	var response graph.SearchResponse
	err := json.Unmarshal(rec.Body, &response)
	s.Require().NoError(err)

	s.NotNil(response.Data)
}

func TestGraphSuite(t *testing.T) {
	suite.Run(t, new(GraphSuite))
}
