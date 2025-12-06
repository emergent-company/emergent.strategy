## ADDED Requirements

### Requirement: User Activity Tracking

The system SHALL track user activity when users access documents and objects, storing this information server-side for cross-device persistence.

#### Scenario: Document viewed activity recorded

- **GIVEN** user is authenticated and has an active project
- **WHEN** user opens a document detail or preview modal
- **THEN** the system records a "document_viewed" activity with the document ID, name, and timestamp
- **AND** the record is associated with the user's Zitadel user ID and current project

#### Scenario: Document edited activity recorded

- **GIVEN** user is authenticated and has an active project
- **WHEN** user modifies a document (upload new version, change metadata)
- **THEN** the system records a "document_edited" activity with the document ID, name, and timestamp
- **AND** any previous activity record for the same document is updated rather than duplicated

#### Scenario: Object viewed activity recorded

- **GIVEN** user is authenticated and has an active project
- **WHEN** user opens an object detail modal
- **THEN** the system records an "object_viewed" activity with the object ID, name, type, and timestamp
- **AND** the record is associated with the user's Zitadel user ID and current project

#### Scenario: Object edited activity recorded

- **GIVEN** user is authenticated and has an active project
- **WHEN** user modifies an object (update properties, change status)
- **THEN** the system records an "object_edited" activity with the object ID, name, type, and timestamp
- **AND** any previous activity record for the same object is updated rather than duplicated

#### Scenario: Activity recording is non-blocking

- **GIVEN** user performs an action that triggers activity recording
- **WHEN** the activity is recorded
- **THEN** the main request completes without waiting for activity persistence
- **AND** activity recording failures do not cause the main operation to fail

### Requirement: Recent Items Retrieval API

The system SHALL provide API endpoints to retrieve recently accessed items for the current user.

#### Scenario: Retrieve recent documents

- **GIVEN** user is authenticated and has an active project
- **WHEN** user requests recent documents with `GET /user-activity/recent?resourceType=document&limit=10`
- **THEN** the system returns the 10 most recently accessed documents for this user in the current project
- **AND** items are sorted by `accessed_at` in descending order (most recent first)
- **AND** each item includes resource ID, name, action type (viewed/edited), and timestamp

#### Scenario: Retrieve recent objects

- **GIVEN** user is authenticated and has an active project
- **WHEN** user requests recent objects with `GET /user-activity/recent?resourceType=object&limit=10`
- **THEN** the system returns the 10 most recently accessed objects for this user in the current project
- **AND** items are sorted by `accessed_at` in descending order (most recent first)
- **AND** each item includes resource ID, name, object type, action type (viewed/edited), and timestamp

#### Scenario: Retrieve mixed recent items

- **GIVEN** user is authenticated and has an active project
- **WHEN** user requests recent items with `GET /user-activity/recent?limit=20`
- **THEN** the system returns up to 20 most recently accessed items (documents and objects combined)
- **AND** items are sorted by `accessed_at` in descending order regardless of type

#### Scenario: No recent items exist

- **GIVEN** user is authenticated but has no recorded activity in current project
- **WHEN** user requests recent items
- **THEN** the system returns an empty array `{ items: [] }`

### Requirement: Recent Items Page

The system SHALL provide a dedicated page for users to view and navigate to their recently accessed items, with two separate tables optimized for each resource type.

#### Scenario: Page layout with two tables

- **GIVEN** user is authenticated and navigates to `/admin/recent`
- **WHEN** the page loads
- **THEN** the page displays two separate tables in order: "Recent Objects" (first/top), then "Recent Documents" (second/below)
- **AND** each table is limited to 10 items maximum (no pagination or infinite scroll needed)

#### Scenario: Display recent objects table

- **GIVEN** user is authenticated and navigates to `/admin/recent`
- **WHEN** the page loads
- **THEN** a "Recent Objects" section displays a table with columns: Name, Type, Status, Relationships, Last Accessed
- **AND** the columns mirror the existing Objects page (`/admin/objects`) for familiarity
- **AND** the "Last Accessed" column shows human-friendly relative time with an action badge (viewed/edited)
- **AND** up to 10 recent objects are displayed

#### Scenario: Display recent documents table

- **GIVEN** user is authenticated and navigates to `/admin/recent`
- **WHEN** the page loads
- **THEN** a "Recent Documents" section displays a table with columns: Name, Type (mime type), Chunks, Extraction Status, Last Accessed
- **AND** the columns mirror the existing Documents page (`/admin/apps/documents`) for familiarity
- **AND** the "Last Accessed" column shows human-friendly relative time with an action badge (viewed/edited)
- **AND** up to 10 recent documents are displayed

#### Scenario: Navigate to document from recent items

- **GIVEN** user is on the Recent Items page with documents listed
- **WHEN** user clicks on a document row
- **THEN** the system navigates to the Documents page with the document detail visible

#### Scenario: Navigate to object from recent items

- **GIVEN** user is on the Recent Items page with objects listed
- **WHEN** user clicks on an object row
- **THEN** the system opens the Object Detail Modal for that object

#### Scenario: Handle deleted items gracefully

- **GIVEN** a recent item record references a document or object that has been deleted
- **WHEN** user views the Recent Items page
- **THEN** the item is shown with a visual indicator that it may no longer exist
- **AND** clicking the item shows a toast message "This item no longer exists" rather than an error page

#### Scenario: Empty state display

- **GIVEN** user has no recent activity
- **WHEN** user navigates to `/admin/recent`
- **THEN** a friendly empty state message is displayed: "No recent items. Start browsing documents and objects to see them here."

### Requirement: Human-Friendly Relative Time Display

The system SHALL format timestamps in a human-friendly relative format for display in the Recent Items page.

#### Scenario: Very recent timestamp

- **GIVEN** an item was accessed less than 1 minute ago
- **WHEN** the timestamp is displayed
- **THEN** it shows "just now"

#### Scenario: Minutes ago timestamp

- **GIVEN** an item was accessed between 1 and 59 minutes ago
- **WHEN** the timestamp is displayed
- **THEN** it shows "X minutes ago" (e.g., "5 minutes ago", "45 minutes ago")

#### Scenario: Hours ago timestamp

- **GIVEN** an item was accessed between 1 and 23 hours ago
- **WHEN** the timestamp is displayed
- **THEN** it shows "X hours ago" (e.g., "2 hours ago", "12 hours ago")

#### Scenario: Yesterday timestamp

- **GIVEN** an item was accessed between 24 and 48 hours ago
- **WHEN** the timestamp is displayed
- **THEN** it shows "yesterday"

#### Scenario: Days ago timestamp

- **GIVEN** an item was accessed between 2 and 6 days ago
- **WHEN** the timestamp is displayed
- **THEN** it shows "X days ago" (e.g., "3 days ago")

#### Scenario: Older timestamp

- **GIVEN** an item was accessed 7 or more days ago
- **WHEN** the timestamp is displayed
- **THEN** it shows the formatted date (e.g., "Nov 25, 2024")

### Requirement: Activity Retention Policy

The system SHALL limit the number of activity records stored per user to prevent unbounded growth.

#### Scenario: Activity limit enforced

- **GIVEN** user has 100 activity records in a project
- **WHEN** a new activity is recorded
- **THEN** the oldest activity record is removed to maintain the 100-record limit
- **AND** the new activity record is successfully stored

#### Scenario: Activity is project-scoped

- **GIVEN** user works across multiple projects
- **WHEN** user switches projects
- **THEN** the Recent Items page shows only items from the currently active project
- **AND** activity limits are applied per-project (100 items per user per project)
