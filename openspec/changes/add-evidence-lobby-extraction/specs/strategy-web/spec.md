## ADDED Requirements

### Requirement: Drop-material Lobby UI

The web UI SHALL provide a low-friction way to drop raw potential material (file upload
and paste) into the evidence lobby, creating unprocessed lobby items.

#### Scenario: Drop raw material

- **WHEN** a user uploads a file or pastes text on the Evidence page
- **THEN** an unprocessed lobby item is created with auto-suggested tags

#### Scenario: Lobby backlog visible

- **WHEN** unprocessed lobby items exist
- **THEN** the Evidence page lists them with an action to extract evidence from each

### Requirement: Extracted Candidate Review UI

The web UI SHALL let a reviewer inspect extracted candidate evidence alongside the raw
source material and accept, edit, or reject it before it becomes formal evidence.

#### Scenario: Review a candidate

- **WHEN** extraction has produced candidates for a lobby item
- **THEN** the reviewer sees the raw material next to the proposed formal evidence
  (summary, tags, confidence, suggested links) and can edit it before accepting

#### Scenario: Accept promotes to formal evidence

- **WHEN** the reviewer accepts a candidate
- **THEN** the promotion batch is committed and the candidate becomes formal evidence

#### Scenario: Reject keeps material in the lobby

- **WHEN** the reviewer rejects a candidate
- **THEN** no formal evidence is created and the source material remains in the lobby
