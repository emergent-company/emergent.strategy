# E2E Testing - Spec Delta

## ADDED Requirements

### Requirement: Script SHALL Provide E2E Credential Retrieval

A dedicated script SHALL provide E2E test user credentials in a format consumable by tests and CI/CD pipelines.

#### Scenario: Script outputs E2E credentials from environment

**Given** the file `.env` contains E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD  
**When** the script `scripts/get-e2e-credentials.sh` is executed  
**Then** the script shall output the email value  
**And** the script shall output the password value  
**And** the output shall be formatted for easy reading with color coding  
**And** the script shall exit with status code 0

#### Scenario: Script uses default credentials when not in environment

**Given** the file `.env` does not contain E2E_TEST_USER_EMAIL  
**And** the file `.env` does not contain E2E_TEST_USER_PASSWORD  
**When** the script `scripts/get-e2e-credentials.sh` is executed  
**Then** the script shall output email "e2e-test@example.com"  
**And** the script shall output password "E2eTestPassword123!"  
**And** the script shall indicate these are default values

#### Scenario: Script provides usage instructions

**Given** the script `scripts/get-e2e-credentials.sh` exists  
**When** a developer views the script output  
**Then** the output shall include application URLs (admin, API, Zitadel)  
**And** the output shall include instructions for manual testing with DevTools MCP  
**And** the output shall include example AI commands for browser inspection

---

## MODIFIED Requirements

### Requirement: E2E Tests SHALL Load Credentials from Environment

**Change:** E2E tests SHALL read credentials from environment variables populated by the bootstrap process instead of requiring manual user creation.

#### Scenario: E2E tests authenticate with bootstrap-created user

**Given** the bootstrap script has created an E2E test user  
**And** the environment variable E2E_TEST_USER_EMAIL is set from bootstrap  
**And** the environment variable E2E_TEST_USER_PASSWORD is set from bootstrap  
**When** E2E tests call `getTestUserCredentials()` helper  
**Then** the helper shall return the email and password from environment variables  
**And** the tests shall authenticate successfully with Zitadel  
**And** no manual user creation steps shall be required

#### Scenario: Missing E2E credentials cause clear error

**Given** E2E_TEST_USER_EMAIL is not set in the environment  
**When** E2E tests call `getTestUserCredentials()` helper  
**Then** the helper shall throw an error with message "E2E_TEST_USER_EMAIL environment variable is required"  
**And** the error message shall reference `apps/admin/.env.e2e` as the configuration source  
**And** the tests shall not proceed with undefined credentials

---

## REMOVED Requirements

None. This change is additive and does not remove existing functionality.
