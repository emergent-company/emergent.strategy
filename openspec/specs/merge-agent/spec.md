# merge-agent Specification

## Purpose
TBD - created by archiving change add-agent-system. Update Purpose after archive.
## Requirements
### Requirement: Duplicate Detection

The Merge Agent MUST identify duplicate Graph Objects using vector similarity.

#### Scenario: Finding Duplicates

Given two Graph Objects "Project Alpha" and "Proj Alpha" with similarity > 0.9
When the Merge Agent runs
Then it should identify them as a potential merge pair.

### Requirement: Suggestion Throttling

The agent MUST skip execution if too many suggestions are pending.

#### Scenario: Skip when busy

Given there are 6 pending notifications of type `merge_suggestion`
When the Merge Agent attempts to run
Then it should log a "skipped" status
And no new vector searches should be performed.

### Requirement: Notification Creation

The agent MUST create a notification for identified duplicates.

#### Scenario: New Suggestion

Given a new duplicate pair is found
Then a `Notification` should be created
And `type` should be `agent:merge_suggestion`
And `details` should contain the IDs of the objects (`sourceId`, `targetId`) and `similarity` score.
And `actions` should include a link to the merge review interface.

### Requirement: Actionable Notification Handling

The system MUST support "actionable" notifications that carry execution payloads.

#### Scenario: Actionable Payload

Given a notification of type `agent:merge_suggestion`
Then the `details` field MUST contain all necessary data to perform the merge operation without further user input (other than confirmation).

#### Scenario: Read-only Notification

Given a notification of type `info`
Then it implies no state-changing action other than "mark as read" or "delete".

### Requirement: Suggestion Refinement

The agent MUST update existing suggestions if a better match is found, rather than creating duplicates.

#### Scenario: Update Existing

Given a pending suggestion for Object A and Object B (similarity 0.85)
When the agent finds a new match for Object A and Object B (similarity 0.95)
Then the existing notification should be updated with the new confidence scores.

