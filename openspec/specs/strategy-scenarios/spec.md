# Capability: strategy-scenarios

Primary user journey test scenarios. Each scenario must be completable via MCP tools
(Phase 2 exit gate) and via the web UI (Phase 3 exit gate).

---

## Scenarios

### Scenario: Onboard a new workspace and import strategy

1. User creates a workspace linked to their GitHub owner (`create_workspace`)
2. User imports a strategy instance from a GitHub repository (`import_instance`)
3. User commits the staging batch to make the instance active
4. User calls `get_strategy_context` and receives a complete strategic context
5. User calls `health_check` and sees a clean health report

**Acceptance:** All five steps complete without errors. Health report shows no critical issues.

---

### Scenario: Update the north star

1. User calls `get_product_vision` and reads the current vision
2. User calls `update_north_star` with a revised payload
3. System returns a `batch_id`
4. User calls `get_product_vision` again — the old vision is still returned (staged, not committed)
5. User reviews the staged change
6. User calls `commit_batch`
7. User calls `get_product_vision` — the new vision is returned
8. User calls `list_mutations` and sees the north_star mutation in history

**Acceptance:** Steps 1–8 complete without errors. Old vision visible before commit, new vision visible after.

---

### Scenario: Create a new feature

1. User calls `list_features` — feature does not exist yet
2. User calls `create_feature` with a valid feature payload
3. System returns a `batch_id`
4. User calls `list_features` — feature is NOT in the list (staged)
5. User calls `commit_batch`
6. User calls `list_features` — feature IS now in the list
7. User calls `get_feature` with the new feature's key — full detail is returned

**Acceptance:** Feature invisible before commit, visible after.

---

### Scenario: Update a feature and discard the change

1. User calls `get_feature` for an existing feature
2. User calls `update_feature` with modified content
3. System returns a `batch_id`
4. User changes their mind — calls `discard_batch`
5. User calls `get_feature` — the original feature content is returned unchanged

**Acceptance:** Discard leaves visible state unchanged.

---

### Scenario: Archive a feature

1. User calls `list_features` — feature is in the list
2. User calls `archive_feature` for the feature
3. System returns a `batch_id`
4. User calls `commit_batch`
5. User calls `list_features` — the feature is no longer in the default list
6. User calls `list_features?include_archived=true` — the feature appears with status=archived

**Acceptance:** Archived features excluded from default list, visible with filter.

---

### Scenario: Semantic search

1. User calls `search_strategy` with query "features targeting enterprise"
2. System returns ranked results including relevant features
3. User calls `get_neighbors` for one of the returned nodes
4. System returns graph neighborhood with edge types

**Acceptance:** Search returns results; neighbor graph returns connected nodes.

---

### Scenario: Detect contradictions and fix

1. User calls `detect_contradictions` on an instance with known contradictions
2. System returns a list of contradictions with fix recommendations
3. User uses `update_feature` to apply one of the recommended fixes
4. User commits the batch
5. User calls `detect_contradictions` again — the fixed contradiction is resolved

**Acceptance:** Contradictions detected; resolved contradiction disappears after fix and commit.

---

### Scenario: What-if scenario exploration

1. User calls `run_scenario` with description "What if we deprioritise feature fd-003?"
2. System returns a `scenario_id`
3. User evaluates the scenario — system returns impact summary
4. User is satisfied and calls the scenario commit
5. The scenario mutations are staged for review
6. User calls `commit_batch` to commit to main

**Acceptance:** Scenario created, evaluated, committed; mutations visible in history.

---

### Scenario: History and audit trail

1. User makes several changes (create, update, archive) across multiple features
2. User calls `list_mutations` — all changes appear in reverse chronological order
3. User filters by `artifact_type=feature` — only feature mutations shown
4. User calls `get_mutation` for a specific mutation — full payload (artifact snapshot) returned

**Acceptance:** Complete history visible; each mutation has full artifact snapshot.
