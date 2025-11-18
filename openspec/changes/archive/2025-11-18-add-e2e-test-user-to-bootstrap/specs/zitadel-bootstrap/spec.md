# Zitadel Bootstrap - Spec Delta

## ADDED Requirements

### Requirement: E2E Test User SHALL Be Created Automatically

The bootstrap script SHALL create a dedicated E2E test user during the provision mode to enable automated end-to-end testing without manual setup.

#### Scenario: E2E user created during initial bootstrap

**Given** Zitadel is running and accessible  
**And** the bootstrap script is executed in provision mode  
**And** environment variables E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are set  
**When** the bootstrap process reaches the E2E user creation step  
**Then** the script shall create a human user with the configured email  
**And** the user shall have firstName="E2E", lastName="Test", displayName="E2E Test User"  
**And** the user's email shall be marked as verified (isEmailVerified=true)  
**And** the user shall not be forced to change password on first login  
**And** the bootstrap output shall display the E2E user credentials  
**And** the E2E_USER_ID shall be stored for reference

#### Scenario: E2E user already exists

**Given** an E2E test user with the configured email already exists in Zitadel  
**When** the bootstrap script runs in provision mode  
**Then** the script shall detect the existing user  
**And** the script shall log an informational message that the user already exists  
**And** the script shall not attempt to create a duplicate user  
**And** the script shall continue to the next step without error

#### Scenario: E2E user credentials configurable via environment

**Given** the bootstrap script is preparing to create an E2E test user  
**When** E2E_TEST_USER_EMAIL is set to "custom-e2e@test.local"  
**And** E2E_TEST_USER_PASSWORD is set to "CustomPass456!"  
**Then** the script shall use these custom credentials  
**And** the created user shall have email "custom-e2e@test.local"  
**And** the user shall authenticate with password "CustomPass456!"

---

### Requirement: Bootstrap SHALL Provide Default E2E User Credentials

The bootstrap script SHALL use sensible defaults for E2E test user credentials when environment variables are not set.

#### Scenario: Default E2E credentials used

**Given** E2E_TEST_USER_EMAIL is not set in the environment  
**And** E2E_TEST_USER_PASSWORD is not set in the environment  
**When** the bootstrap script runs in provision mode  
**Then** the script shall use "e2e-test@example.com" as the default email  
**And** the script shall use "E2eTestPassword123!" as the default password  
**And** the bootstrap output shall display these default credentials

---

### Requirement: Bootstrap SHALL Create Separate Test User Types

The bootstrap script SHALL create two separate test users with distinct purposes and credentials.

#### Scenario: Two test users created with different purposes

**Given** the bootstrap script is running in provision mode  
**When** the test user creation steps execute  
**Then** the script shall create TEST_USER with email from TEST_USER_EMAIL  
**And** the script shall create E2E_TEST_USER with email from E2E_TEST_USER_EMAIL  
**And** the bootstrap output shall label TEST_USER as "Test User (Application Testing)"  
**And** the bootstrap output shall label E2E_TEST_USER as "E2E Test User (Automated Testing)"  
**And** both users shall be active with verified emails

---

## MODIFIED Requirements

### Requirement: Bootstrap Output SHALL Include E2E User Credentials

**Change:** The bootstrap output SHALL include E2E test user credentials in the configuration summary.

#### Scenario: Bootstrap output displays all user credentials

**Given** the bootstrap script has completed successfully  
**When** the configuration summary is displayed  
**Then** the output shall include admin user credentials with role ORG_OWNER  
**And** the output shall include test user credentials labeled "Test User (Application Testing)"  
**And** the output shall include E2E test user credentials labeled "E2E Test User (Automated Testing)"  
**And** each user entry shall display email, password, and status  
**And** the E2E test user entry shall indicate it is for "automated E2E tests only"
