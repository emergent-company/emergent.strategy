# user-activity-tracking Specification

## Purpose

Tracks user activity timestamps to provide visibility into when users last interacted with the platform, enabling "last seen" displays in administrative interfaces.

## ADDED Requirements

### Requirement: Last Activity Timestamp Storage

The system SHALL store a `last_activity_at` timestamp for each user profile that reflects their most recent authenticated API request.

#### Scenario: User profile includes last activity field

- **GIVEN** a user profile exists in the database
- **WHEN** querying the user profile
- **THEN** the profile SHALL include a `last_activity_at` timestamp field
- **AND** the field MAY be null for users who have never made an authenticated request

### Requirement: Activity Tracking on Authenticated Requests

The system SHALL update the user's `last_activity_at` timestamp when they make authenticated API requests.

#### Scenario: First request sets activity timestamp

- **GIVEN** a user is authenticated
- **AND** the user has no previous activity timestamp
- **WHEN** the user makes an API request
- **THEN** the system SHALL set `last_activity_at` to the current timestamp

#### Scenario: Subsequent request updates activity timestamp

- **GIVEN** a user is authenticated
- **AND** the user has a previous activity timestamp
- **WHEN** the user makes an API request
- **THEN** the system SHALL update `last_activity_at` to the current timestamp

### Requirement: Activity Tracking Debouncing

The system SHALL debounce activity timestamp updates to prevent excessive database writes, with a minimum interval of 60 seconds between updates for the same user.

#### Scenario: Rapid requests do not cause multiple updates

- **GIVEN** a user makes an authenticated request at time T
- **AND** the system updates their activity timestamp
- **WHEN** the same user makes another request within 60 seconds
- **THEN** the system SHALL NOT update the activity timestamp again

#### Scenario: Request after debounce interval triggers update

- **GIVEN** a user's last activity update was at time T
- **WHEN** the user makes a request at time T + 61 seconds
- **THEN** the system SHALL update the activity timestamp

### Requirement: Non-Blocking Activity Updates

The system SHALL perform activity timestamp updates asynchronously without blocking the main request processing.

#### Scenario: Activity update does not delay response

- **GIVEN** a user makes an authenticated request
- **WHEN** the activity tracking middleware processes the request
- **THEN** the request SHALL proceed immediately
- **AND** the activity update SHALL be performed asynchronously

#### Scenario: Activity update failure does not fail request

- **GIVEN** a user makes an authenticated request
- **WHEN** the activity timestamp update fails due to database error
- **THEN** the main request SHALL still succeed
- **AND** the error SHALL be logged for monitoring

### Requirement: Activity Timestamp in User Queries

The system SHALL include the `last_activity_at` timestamp when returning user information to authorized requesters.

#### Scenario: User list includes activity timestamps

- **GIVEN** a superadmin requests the user list
- **WHEN** the system returns user records
- **THEN** each user record SHALL include the `last_activity_at` field

#### Scenario: User detail includes activity timestamp

- **GIVEN** an authorized user requests another user's profile details
- **WHEN** the system returns the user profile
- **THEN** the response SHALL include the `last_activity_at` field
