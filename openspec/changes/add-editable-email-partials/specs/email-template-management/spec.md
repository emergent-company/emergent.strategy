## ADDED Requirements

### Requirement: Partial Listing

The system SHALL provide superadmins with a list of all email template partials showing name, description, customization status, and last update information.

#### Scenario: Superadmin views partial list

- **GIVEN** the user is authenticated as a superadmin
- **WHEN** they navigate to `/admin/superadmin/email-partials`
- **THEN** a table displays all email partials with columns for Name, Description, Status (Customized/Default), and Last Updated
- **AND** each row is clickable to navigate to the partial editor

#### Scenario: Partial list seeded from files

- **GIVEN** no partials exist in the database
- **WHEN** a superadmin accesses the partial list API
- **THEN** the system scans `/templates/email/partials/` for `.mjml.hbs` files
- **AND** creates database records for each discovered partial with `is_customized = false`
- **AND** returns the seeded partials in the response

#### Scenario: Non-superadmin denied access

- **GIVEN** the user is authenticated but NOT a superadmin
- **WHEN** they attempt to access `/superadmin/email-partials` API
- **THEN** the system returns HTTP 403 Forbidden

### Requirement: Partial Editing

The system SHALL allow superadmins to edit the MJML content of email template partials through a code editor interface.

#### Scenario: Superadmin edits partial content

- **GIVEN** the user is viewing the partial editor for "footer"
- **WHEN** they modify the MJML content and click "Save"
- **THEN** a new version is created in `kb.email_template_partial_versions`
- **AND** the `current_version_id` in `kb.email_template_partials` is updated
- **AND** the `is_customized` flag is set to `true`
- **AND** the partial cache is invalidated
- **AND** a success notification is displayed

#### Scenario: Invalid MJML rejected

- **GIVEN** the user is editing a partial
- **WHEN** they enter invalid MJML syntax and click "Save"
- **THEN** the system displays validation errors
- **AND** the partial is NOT saved

### Requirement: Partial Preview

The system SHALL allow superadmins to preview rendered partials within the context of a sample email template.

#### Scenario: Preview partial in template context

- **GIVEN** the user is editing the "footer" partial
- **WHEN** they click "Preview"
- **THEN** the right panel displays the partial rendered inside a sample wrapper template
- **AND** the sample data variables are populated

#### Scenario: Preview updates on content change

- **GIVEN** the user is editing a partial with auto-preview enabled
- **WHEN** they modify the MJML content
- **THEN** the preview updates after a debounce delay (500ms)

### Requirement: Partial Version History

The system SHALL maintain a version history of partial changes and allow superadmins to rollback to previous versions.

#### Scenario: View partial version history

- **GIVEN** the user is on the partial editor page
- **WHEN** they expand the version history sidebar
- **THEN** a list of versions is displayed showing version number, timestamp, author, and change summary
- **AND** versions are ordered newest first

#### Scenario: Rollback partial to previous version

- **GIVEN** the user is viewing partial version history
- **WHEN** they click "Rollback" on a previous version and confirm
- **THEN** a NEW version is created with the content from the selected version
- **AND** the partial content updates to match the rolled-back version
- **AND** the partial cache is invalidated
- **AND** a success notification is displayed

### Requirement: Reset Partial to Default

The system SHALL allow superadmins to reset a customized partial back to the file-based default.

#### Scenario: Reset customized partial

- **GIVEN** the user is editing a partial with `is_customized = true`
- **WHEN** they click "Reset to Default" and confirm
- **THEN** a NEW version is created with content from the file-based partial
- **AND** the partial content matches the original file
- **AND** the partial cache is invalidated
- **AND** a success notification is displayed

#### Scenario: Reset unavailable for default partial

- **GIVEN** the user is editing a partial with `is_customized = false`
- **WHEN** the editor loads
- **THEN** the "Reset to Default" button is disabled or hidden

### Requirement: Partial Database Storage

The system SHALL store email template partials in the database with fallback to file-based partials for unmodified partials.

#### Scenario: Database partial takes precedence

- **GIVEN** a partial exists in both DB (with `is_customized = true`) and filesystem
- **WHEN** `EmailTemplateService.registerPartials()` is called
- **THEN** the database version is registered with Handlebars

#### Scenario: File-based fallback for default partials

- **GIVEN** a partial exists in DB with `is_customized = false`
- **WHEN** `EmailTemplateService.registerPartials()` is called
- **THEN** the file-based version is used for maximum freshness after deployments

#### Scenario: Partial cache invalidation

- **GIVEN** a superadmin saves changes to a partial
- **WHEN** the save completes
- **THEN** the partial cache is invalidated
- **AND** the template cache for all templates using this partial is invalidated
- **AND** subsequent renders use the new content

### Requirement: Partial Audit Trail

The system SHALL track who made changes to partials and when for audit purposes.

#### Scenario: Edit tracked with user

- **GIVEN** superadmin "admin@example.com" edits a partial
- **WHEN** the partial is saved
- **THEN** the new version records `created_by` as the superadmin's user ID
- **AND** `created_at` is set to the current timestamp

#### Scenario: Version history shows author

- **GIVEN** the user views partial version history
- **WHEN** the list loads
- **THEN** each version displays the name of the superadmin who made the change
