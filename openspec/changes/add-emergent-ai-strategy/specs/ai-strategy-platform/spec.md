## ADDED Requirements

### Requirement: Per-Session Compute Isolation

The system SHALL provide isolated compute environments for each agent session, ensuring that one session's artifacts, credentials, and filesystem are never accessible to another session.

Isolation SHALL be enforced at:

- **Compute**: Per-session Cloud Run jobs with ephemeral filesystems
- **Credentials**: Per-session model access credentials scoped to the subscriber
- **Artifacts**: Per-session working directory with only the relevant EPF instance artifacts mounted

#### Scenario: Session A cannot access Session B artifacts

- **WHEN** Session A is writing EPF artifacts for Subscriber A
- **THEN** the agent runs in an isolated Cloud Run job
- **AND** only Subscriber A's EPF instance artifacts and configuration are available
- **AND** Session B's data is not accessible from the execution environment

#### Scenario: Ephemeral compute cleanup

- **WHEN** an agent session completes or times out
- **THEN** the ephemeral Cloud Run job is destroyed
- **AND** no subscriber data persists in the compute layer

### Requirement: Subscription Management

The system SHALL provide subscription lifecycle management including creation, configuration, and cancellation.

Subscription management SHALL:

- Create subscriber accounts with associated EPF instance configuration
- Configure model access credentials (Vertex AI)
- Set monthly artifact operation quotas included in the subscription
- Track subscription status (active, suspended, cancelled)

#### Scenario: Create new subscription

- **WHEN** a subscriber signs up with a subscription plan
- **THEN** the system creates their account with the plan's included quota
- **AND** configures Vertex AI model access
- **AND** the subscriber can immediately submit artifact operation tasks

#### Scenario: Cancel subscription

- **WHEN** a subscriber cancels their subscription
- **THEN** active sessions are allowed to complete (grace period)
- **AND** the subscriber can no longer submit new tasks after the billing period ends
- **AND** usage data is retained for billing reconciliation

### Requirement: Subscription and Overage Billing

The system SHALL implement a subscription + overage billing model where subscribers pay a base subscription fee that includes a monthly artifact operation quota, with overage charges for additional operations.

Billing SHALL:

- Track artifact operations per subscriber per billing period
- Include a configurable monthly operation quota in the base subscription
- Charge overage fees for operations exceeding the quota
- Provide usage reports showing operations consumed vs. quota

#### Scenario: Operations within subscription quota

- **WHEN** a subscriber submits artifact operation tasks
- **AND** the subscriber has not exceeded their monthly quota
- **THEN** the tasks are executed normally
- **AND** the operation count is incremented

#### Scenario: Overage charges applied

- **WHEN** a subscriber exceeds their monthly artifact operation quota
- **THEN** additional operations are charged at the overage rate
- **AND** the subscriber is notified that they have entered overage
- **AND** operations are not blocked (soft limit, not hard cap)

#### Scenario: Usage reporting

- **WHEN** a subscriber requests their usage report
- **THEN** the system returns operations consumed, quota remaining, and overage charges
- **AND** the report covers the current and previous billing periods

### Requirement: Task Orchestrator

The system SHALL provide a task orchestrator that routes artifact operation tasks to isolated compute environments.

The orchestrator SHALL:

- Accept tasks from the ACP layer
- Provision Cloud Run jobs for each session
- Configure the agent session with the subscriber's EPF instance and MCP server
- Monitor task execution and enforce timeouts
- Collect results and clean up compute resources

#### Scenario: Route task to isolated compute

- **WHEN** the orchestrator receives a new artifact operation task
- **THEN** it provisions a Cloud Run job with the subscriber's configuration
- **AND** attaches the EPF Cloud Strategy Server as MCP
- **AND** starts the agent engine with the task parameters

#### Scenario: Task timeout enforcement

- **WHEN** an artifact operation exceeds the configured timeout (default: 10 minutes)
- **THEN** the orchestrator terminates the Cloud Run job
- **AND** returns a timeout error to the client
- **AND** any partial results (written artifacts) are preserved if available
