## ADDED Requirements

### Requirement: Instance Ownership of Graph Data

The system SHALL stamp every graph object and relationship it writes to
emergent.memory with its owning strategy instance: the key SHALL be prefixed
with the full instance UUID, `properties.instance_id` SHALL hold the instance
UUID, objects SHALL carry the label `instance:<uuid>`, and both objects and
relationships SHALL carry `properties.memory_generation`. This SHALL hold for
every write path, including the command-line import.

#### Scenario: Shared artifact keys do not collide
- **WHEN** two instances in the same Memory project both contain an artifact
  with key `north_star`
- **THEN** each instance's ingest writes its own object
- **AND** neither ingest modifies the other instance's object

#### Scenario: CLI import stamps ownership
- **WHEN** an instance is imported with `strategy-server import --reingest`
- **THEN** every object it writes has the instance key prefix,
  `properties.instance_id`, the `instance:<uuid>` label and a generation

---

### Requirement: Fail-Closed Instance Isolation on Reads

Every read the system performs against emergent.memory on behalf of an
instance SHALL return only graph data owned by that instance and visible under
the instance's current generation. Data with no owner, a different owner, or a
generation older than the instance's current generation SHALL never be
returned, regardless of which component or tool wrote it.

#### Scenario: Foreign instance data is not returned
- **WHEN** a caller searches, lists neighbours, detects contradictions or
  evaluates lifecycle mode for instance A
- **AND** the Memory project also contains objects owned by instance B
- **THEN** no object owned by B is returned or counted

#### Scenario: Unowned data is not returned
- **WHEN** the Memory project contains objects without `properties.instance_id`
  (for example written by `epf-cli ingest` or an older server version)
- **THEN** no read for any instance returns or counts them

#### Scenario: Instance graph not yet built
- **WHEN** a semantic read is requested for an instance that has never
  completed a fenced ingest
- **THEN** the system returns an empty result with a `graph_not_ready` hint
- **AND** does not return data from any other source

#### Scenario: Foreign node key
- **WHEN** a caller requests the neighbourhood of a key that is not visible for
  the requested instance
- **THEN** the system responds as for a non-existent node

---

### Requirement: Graph Projection Consistency

The visible graph of an active instance SHALL equal the projection of its
current active artifacts in PostgreSQL, as of its last successful ingest.
Reads SHALL treat objects older than the instance's current generation as not
present, and garbage-collection failure SHALL NOT affect visibility.

#### Scenario: Import removes an artifact
- **WHEN** a GitHub import removes an artifact from an instance
- **THEN** after the triggered ingest completes, no read returns the removed
  artifact's artifact-layer or decomposed objects
- **AND** no server restart is required

#### Scenario: Import changes an artifact
- **WHEN** a GitHub import changes an artifact's content
- **THEN** after the triggered ingest completes, reads return the new content
  and not the old

#### Scenario: Version restore
- **WHEN** a version is restored
- **THEN** after the triggered ingest completes, reads reflect the restored
  version only

#### Scenario: Commit updates the decomposed layer
- **WHEN** a committed batch changes a North Star value
- **THEN** after the triggered ingest completes, the corresponding decomposed
  objects reflect the change

#### Scenario: Failed ingest
- **WHEN** an ingest at generation N+1 fails part-way
- **THEN** the instance's current generation stays N
- **AND** the instance stays marked dirty
- **AND** reads continue to return the generation-N projection, with any
  objects already rewritten at N+1 visible in their newer form

---

### Requirement: Ingest Trigger on Every Artifact Change

Every change to an instance's artifacts in PostgreSQL, by any path, SHALL mark
the instance dirty in the same transaction and trigger a full ingest of that
instance at a new generation. Ingests of one instance SHALL be serialised.

#### Scenario: Paths that change artifacts
- **WHEN** an instance's artifacts change through a commit, evidence ingest,
  GitHub import, instance import or version restore
- **THEN** the instance is marked dirty in the same transaction
- **AND** an ingest of the instance is triggered after the transaction commits

#### Scenario: Lost ingest job
- **WHEN** an ingest job is dropped or lost (queue full, process restart)
- **THEN** the instance remains marked dirty in PostgreSQL
- **AND** the heartbeat or startup sweep re-enqueues it until an ingest
  succeeds

#### Scenario: Concurrent changes
- **WHEN** two changes to the same instance trigger ingests at the same time
- **THEN** the ingests run one after the other
- **AND** the instance's generation strictly increases

---

### Requirement: Graph Purge and Orphan Sweep

The system SHALL purge an instance's graph data (objects, relationships and
scenario branches) when the instance is deleted, and SHALL NOT re-ingest
deleted instances. The system SHALL provide an administrative sweep, dry-run by
default, that reports and optionally deletes graph objects with no owner, an
owner that is not an active instance, a stale generation, or a legacy key
format.

#### Scenario: Instance deletion
- **WHEN** an instance is deleted
- **THEN** its graph objects, relationships and scenario branches are deleted
  from emergent.memory
- **AND** a server restart does not re-create them

#### Scenario: Sweep dry run
- **WHEN** an administrator runs the sweep without `apply`
- **THEN** the system reports counts per class (`no_owner`, `unknown_owner`,
  `stale`, `legacy_key`)
- **AND** deletes nothing

#### Scenario: Sweep apply
- **WHEN** an administrator runs the sweep with `apply`
- **THEN** the reported objects are deleted, with their relationships
- **AND** instances with an ingest in progress are skipped

---

### Requirement: Strategy Content Contract

The system SHALL serve only an instance's own strategy content and the
canonical framework definitions installed into that instance. The system SHALL
NOT serve artifact template placeholders as strategy content and SHALL NOT fill
parts an instance does not define with template content. Structured reads
backed by PostgreSQL SHALL be the authoritative source for an instance's
strategy; semantic search SHALL be described to clients as discovery.

#### Scenario: Instance is silent on a part
- **WHEN** an instance does not define a READY section
- **THEN** structured reads report it as not defined
- **AND** neither structured nor semantic reads return template placeholder
  content for it

#### Scenario: Tool descriptions
- **WHEN** a client lists the `search_strategy` and `get_template` tools
- **THEN** `search_strategy` is described as discovery over the instance's own
  content, pointing to the structured tools for authoritative values
- **AND** `get_template` is described as an authoring template, not the
  instance's strategy

## MODIFIED Requirements

### Requirement: Strategy Graph Ingestion

The system SHALL keep the emergent.memory graph in sync with the PostgreSQL
ledger by running a full, fenced ingest of an instance after every change to
its artifacts, as defined by *Graph Projection Consistency*.

#### Scenario: Ingest on commit
- **WHEN** a batch is committed
- **THEN** the instance is marked dirty in the same transaction
- **AND** a fenced full ingest of the instance is triggered asynchronously
- **AND** ingestion failure does not roll back the commit
- **AND** ingestion errors are logged and the instance stays dirty until an
  ingest succeeds

#### Scenario: Full re-ingest
- **WHEN** an admin triggers a full re-ingest for an instance
- **THEN** all current active artifacts are ingested at a new generation
- **AND** after completion the visible graph equals the projection of the
  current PostgreSQL state, with no objects from earlier states visible

---

### Requirement: Semantic Search

The system SHALL proxy semantic search queries to emergent.memory and return
ranked results owned by and visible for the requested instance.

#### Scenario: Natural language search
- **WHEN** a caller queries with a natural-language string (e.g., "features
  targeting growth")
- **THEN** the system returns the instance's visible results ranked by semantic
  similarity
- **AND** each result includes: artifact_type, artifact_key, snippet,
  relevance_score, instance_id, layer, and source_artifact when known

#### Scenario: Limit results
- **WHEN** a caller specifies a `limit` parameter
- **THEN** at most `limit` results are returned
- **AND** results filtered out for ownership or generation do not reduce the
  count below `limit` while enough visible matches exist within the over-fetch
  bound

---

### Requirement: Graph Neighborhood

The system SHALL return the semantic graph neighborhood of a given strategy
node, restricted to nodes visible for the requested instance.

#### Scenario: Get neighbors
- **WHEN** a caller requests neighbors for a node (e.g., feature fd-001) of an
  instance
- **THEN** the system returns connected nodes visible for that instance with
  edge types and directions
- **AND** orphaned or weakly connected nodes are flagged in the response
- **AND** nodes owned by other instances or without an owner are omitted

---

### Requirement: Contradiction Detection

The system SHALL detect structural contradictions within an instance's strategy
graph.

#### Scenario: Detect contradictions
- **WHEN** a caller requests a contradiction scan for an instance
- **THEN** the system evaluates only graph data visible for that instance
- **AND** returns a list of contradiction descriptions with fix recommendations
- **AND** this is a read-only operation
