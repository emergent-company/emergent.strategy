// Package domain contains shared bun-tagged structs that represent the database tables.
// These types are used by both domain services and handlers — they are the authoritative
// Go representation of the strategy-server schema.
package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// Workspace represents a GitHub user or organisation that owns strategy instances.
type Workspace struct {
	bun.BaseModel `bun:"table:workspaces,alias:w"`

	ID          uuid.UUID  `bun:"id,pk,type:uuid"                   json:"id"`
	GithubOwner string     `bun:"github_owner,notnull"               json:"github_owner"`
	DisplayName *string    `bun:"display_name"                       json:"display_name,omitempty"`
	OrgID       *uuid.UUID `bun:"org_id,type:uuid"                   json:"org_id,omitempty"`
	CreatedBy   *uuid.UUID `bun:"created_by,type:uuid"               json:"created_by,omitempty"`
	CreatedAt   time.Time  `bun:"created_at,notnull,default:now()"   json:"created_at"`
	UpdatedAt   time.Time  `bun:"updated_at,notnull,default:now()"   json:"updated_at"`
	DeletedAt   *time.Time `bun:"deleted_at,soft_delete"             json:"deleted_at,omitempty"`

	// Relations (populated on demand)
	Instances []*StrategyInstance `bun:"rel:has-many,join:id=workspace_id" json:"instances,omitempty"`
	Org       *Org                `bun:"rel:belongs-to,join:org_id=id"     json:"org,omitempty"`
}

// StrategyInstance represents a versioned EPF instance within a workspace.
type StrategyInstance struct {
	bun.BaseModel `bun:"table:strategy_instances,alias:si"`

	ID                  uuid.UUID  `bun:"id,pk,type:uuid"                   json:"id"`
	WorkspaceID         uuid.UUID  `bun:"workspace_id,notnull,type:uuid"    json:"workspace_id"`
	Name                string     `bun:"name,notnull"                       json:"name"`
	Description         *string    `bun:"description"                        json:"description,omitempty"`
	GithubRepo          *string    `bun:"github_repo"                        json:"github_repo,omitempty"`
	GithubBasePath      *string    `bun:"github_base_path"                   json:"github_base_path,omitempty"`
	Status              string     `bun:"status,notnull,default:'draft'"     json:"status"`
	StandardPackVersion *string    `bun:"standard_pack_version"              json:"standard_pack_version,omitempty"`
	SchemaVersion       *string    `bun:"schema_version"                     json:"schema_version,omitempty"`
	Dialect             string     `bun:"dialect,notnull,default:'standard'" json:"dialect"`
	MemorySyncStatus    *string    `bun:"memory_sync_status"                 json:"memory_sync_status,omitempty"`
	MemoryLastSyncedAt  *time.Time `bun:"memory_last_synced_at"              json:"memory_last_synced_at,omitempty"`
	CreatedBy           *uuid.UUID `bun:"created_by,type:uuid"               json:"created_by,omitempty"`
	CreatedAt           time.Time  `bun:"created_at,notnull,default:now()"   json:"created_at"`
	UpdatedAt           time.Time  `bun:"updated_at,notnull,default:now()"   json:"updated_at"`
	DeletedAt           *time.Time `bun:"deleted_at,soft_delete"             json:"deleted_at,omitempty"`

	// Relations (populated on demand)
	Workspace *Workspace `bun:"rel:belongs-to,join:workspace_id=id" json:"workspace,omitempty"`
}

// StrategyMutation is an append-only record of every strategy artifact change.
// Current state is derived by reading strategy_artifacts (populated on commit).
type StrategyMutation struct {
	bun.BaseModel `bun:"table:strategy_mutations,alias:sm"`

	ID               uuid.UUID       `bun:"id,pk,type:uuid"                   json:"id"`
	InstanceID       uuid.UUID       `bun:"instance_id,notnull,type:uuid"     json:"instance_id"`
	BatchID          *uuid.UUID      `bun:"batch_id,type:uuid"                json:"batch_id,omitempty"`
	ArtifactType     string          `bun:"artifact_type,notnull"             json:"artifact_type"`
	ArtifactKey      string          `bun:"artifact_key,notnull"              json:"artifact_key"`
	Action           string          `bun:"action,notnull"                    json:"action"`
	Payload          json.RawMessage `bun:"payload,notnull,type:jsonb"        json:"payload"`
	Status           string          `bun:"status,notnull,default:'committed'" json:"status"`
	Source           string          `bun:"source,notnull,default:'system'"   json:"source"`
	AgentID          *string         `bun:"agent_id"                          json:"agent_id,omitempty"`
	BatchDescription *string         `bun:"batch_description"                 json:"batch_description,omitempty"`
	CreatedBy        *uuid.UUID      `bun:"created_by,type:uuid"              json:"created_by,omitempty"`
	CreatedAt        time.Time       `bun:"created_at,notnull,default:now()"  json:"created_at"`

	// Relations (populated on demand)
	Instance *StrategyInstance `bun:"rel:belongs-to,join:instance_id=id" json:"instance,omitempty"`
}

// StrategyArtifact is the current-state cache for a committed EPF artifact.
// One row per artifact_key per instance; upserted on every CommitBatch.
// Replaces the DISTINCT ON read pattern against strategy_mutations.
type StrategyArtifact struct {
	bun.BaseModel `bun:"table:strategy_artifacts,alias:sa"`

	ID           uuid.UUID       `bun:"id,pk,type:uuid"                  json:"id"`
	InstanceID   uuid.UUID       `bun:"instance_id,notnull,type:uuid"    json:"instance_id"`
	ArtifactType string          `bun:"artifact_type,notnull"            json:"artifact_type"`
	ArtifactKey  string          `bun:"artifact_key,notnull"             json:"artifact_key"`
	Track        *string         `bun:"track"                            json:"track,omitempty"`
	Name         *string         `bun:"name"                             json:"name,omitempty"`
	Status       string          `bun:"status,notnull,default:'active'"  json:"status"`
	Payload      json.RawMessage `bun:"payload,notnull,type:jsonb"       json:"payload"`
	MutationID   uuid.UUID       `bun:"mutation_id,notnull,type:uuid"    json:"mutation_id"`
	CreatedAt    time.Time       `bun:"created_at,notnull,default:now()" json:"created_at"`
	UpdatedAt    time.Time       `bun:"updated_at,notnull,default:now()" json:"updated_at"`
}

// StrategyRelationship is a single cross-artifact reference extracted from a payload.
// Replaced (delete + insert) whenever the source artifact is committed.
type StrategyRelationship struct {
	bun.BaseModel `bun:"table:strategy_relationships,alias:sr"`

	ID           uuid.UUID       `bun:"id,pk,type:uuid"               json:"id"`
	InstanceID   uuid.UUID       `bun:"instance_id,notnull,type:uuid" json:"instance_id"`
	SourceKey    string          `bun:"source_key,notnull"            json:"source_key"`
	SourceType   string          `bun:"source_type,notnull"           json:"source_type"`
	TargetKey    string          `bun:"target_key,notnull"            json:"target_key"`
	TargetType   string          `bun:"target_type,notnull"           json:"target_type"`
	Relationship string          `bun:"relationship,notnull"          json:"relationship"`
	Metadata     json.RawMessage `bun:"metadata,type:jsonb"           json:"metadata,omitempty"`
	CreatedAt    time.Time       `bun:"created_at,notnull,default:now()" json:"created_at"`
}

// AuditLog records all significant events on the platform.
type AuditLog struct {
	bun.BaseModel `bun:"table:audit_log,alias:al"`

	ID         uuid.UUID       `bun:"id,pk,type:uuid"                   json:"id"`
	EntityType string          `bun:"entity_type,notnull"                json:"entity_type"`
	EntityID   *uuid.UUID      `bun:"entity_id,type:uuid"                json:"entity_id,omitempty"`
	Action     string          `bun:"action,notnull"                     json:"action"`
	Source     string          `bun:"source,notnull,default:'system'"    json:"source"`
	ActorID    *uuid.UUID      `bun:"actor_id,type:uuid"                 json:"actor_id,omitempty"`
	Details    json.RawMessage `bun:"details,type:jsonb"            json:"details,omitempty"`
	CreatedAt  time.Time       `bun:"created_at,notnull,default:now()"   json:"created_at"`
}

// InstanceStatus enumerates valid values for StrategyInstance.Status.
const (
	InstanceStatusDraft    = "draft"
	InstanceStatusActive   = "active"
	InstanceStatusArchived = "archived"
)

// MutationStatus enumerates valid values for StrategyMutation.Status.
const (
	MutationStatusStaged    = "staged"
	MutationStatusCommitted = "committed"
	MutationStatusDiscarded = "discarded"
)

// MutationAction enumerates valid values for StrategyMutation.Action.
const (
	MutationActionCreate  = "create"
	MutationActionUpdate  = "update"
	MutationActionArchive = "archive"
)

// MutationSource enumerates valid values for StrategyMutation.Source.
const (
	MutationSourceMCP    = "mcp"
	MutationSourceWeb    = "web"
	MutationSourceImport = "import"
	MutationSourceSystem = "system"
)

// ArtifactStatus enumerates valid values for StrategyArtifact.Status.
const (
	ArtifactStatusActive   = "active"
	ArtifactStatusArchived = "archived"
)

// ArtifactType enumerates common EPF artifact type strings.
const (
	ArtifactTypeFeature             = "feature"
	ArtifactTypeNorthStar           = "north_star"
	ArtifactTypeStrategyFoundations = "strategy_foundations"
	ArtifactTypeStrategyFormula     = "strategy_formula"
	ArtifactTypeInsightAnalyses     = "insight_analyses"
	ArtifactTypeValueModel          = "value_model"
	ArtifactTypeRoadmap             = "roadmap_recipe"
	ArtifactTypeLRA                 = "living_reality_assessment"
	ArtifactTypeAssessmentReport    = "assessment_report"
	ArtifactTypeAIMTriggerConfig    = "aim_trigger_config"
)

// RelationshipType enumerates cross-artifact relationship kinds.
const (
	RelContributesTo   = "contributes_to"
	RelTestsAssumption = "tests_assumption"
	RelInTrack         = "in_track"
	RelDependsOn       = "depends_on"
	RelEnables         = "enables"
	RelDeliveredByKR   = "delivered_by_kr"
	RelLinkedToKR      = "linked_to_kr"
	RelMapsTo          = "maps_to"
	RelUsesValueModel  = "uses_value_model"
)

// ---------------------------------------------------------------------------
// Skill pack system
// ---------------------------------------------------------------------------

// InstalledSkill represents one skill entry from an installed pack.
type InstalledSkill struct {
	bun.BaseModel `bun:"table:installed_skills,alias:isk"`

	ID          uuid.UUID `bun:"id,pk,type:uuid"                   json:"id"`
	InstanceID  uuid.UUID `bun:"instance_id,notnull,type:uuid"     json:"instance_id"`
	PackName    string    `bun:"pack_name,notnull"                 json:"pack_name"`
	PackVersion string    `bun:"pack_version,notnull"              json:"pack_version"`
	SkillName   string    `bun:"skill_name,notnull"                json:"skill_name"`
	SkillYAML   string    `bun:"skill_yaml,notnull"                json:"skill_yaml"`
	PromptMD    *string   `bun:"prompt_md"                         json:"prompt_md,omitempty"`
	ScriptSrc   *string   `bun:"script_src"                        json:"script_src,omitempty"`
	ScriptLang  *string   `bun:"script_lang"                       json:"script_lang,omitempty"`
	Trusted     bool      `bun:"trusted,notnull"                   json:"trusted"`
	InstalledAt time.Time `bun:"installed_at,notnull,default:now()" json:"installed_at"`
	InstalledBy string    `bun:"installed_by,notnull"              json:"installed_by"`
}

// StrategyApp represents one app entry from an installed pack.
// signing_secret is stored but never serialised to JSON (write-only from MCP perspective).
type StrategyApp struct {
	bun.BaseModel `bun:"table:strategy_apps,alias:sa"`

	ID              uuid.UUID  `bun:"id,pk,type:uuid"                   json:"id"`
	InstanceID      uuid.UUID  `bun:"instance_id,notnull,type:uuid"     json:"instance_id"`
	PackName        string     `bun:"pack_name,notnull"                 json:"pack_name"`
	PackVersion     string     `bun:"pack_version,notnull"              json:"pack_version"`
	AppName         string     `bun:"app_name,notnull"                  json:"app_name"`
	AppURL          string     `bun:"app_url,notnull"                   json:"app_url"`
	ManifestYAML    string     `bun:"manifest_yaml,notnull"             json:"manifest_yaml"`
	Status          string     `bun:"status,notnull"                    json:"status"`
	Trusted         bool       `bun:"trusted,notnull"                   json:"trusted"`
	SigningSecret   string     `bun:"signing_secret,notnull"            json:"-"` // never exposed
	HealthFailCount int        `bun:"health_fail_count,notnull"         json:"health_fail_count"`
	InstalledAt     time.Time  `bun:"installed_at,notnull,default:now()" json:"installed_at"`
	InstalledBy     string     `bun:"installed_by,notnull"              json:"installed_by"`
	LastHealthAt    *time.Time `bun:"last_health_at"                    json:"last_health_at,omitempty"`
}

// StrategyApp status values.
const (
	AppStatusActive   = "active"
	AppStatusDegraded = "degraded"
	AppStatusDisabled = "disabled"
)

// ---------------------------------------------------------------------------
// Auth and multi-tenant
// ---------------------------------------------------------------------------

// User represents an authenticated user persisted on first login.
type User struct {
	bun.BaseModel `bun:"table:users,alias:u"`

	ID        uuid.UUID  `bun:"id,pk,type:uuid"                   json:"id"`
	Sub       string     `bun:"sub,notnull"                        json:"sub"`
	Email     string     `bun:"email,notnull"                      json:"email"`
	Name      *string    `bun:"name"                               json:"name,omitempty"`
	Status    string     `bun:"status,notnull,default:'active'"    json:"status"`
	CreatedAt time.Time  `bun:"created_at,notnull,default:now()"   json:"created_at"`
	UpdatedAt time.Time  `bun:"updated_at,notnull,default:now()"   json:"updated_at"`
	DeletedAt *time.Time `bun:"deleted_at,soft_delete"             json:"deleted_at,omitempty"`
}

// UserStatus values.
const (
	UserStatusActive  = "active"
	UserStatusDeleted = "deleted"
)

// Org represents an organisation — the tenant container for workspaces.
type Org struct {
	bun.BaseModel `bun:"table:orgs,alias:o"`

	ID        uuid.UUID  `bun:"id,pk,type:uuid"                   json:"id"`
	Name      string     `bun:"name,notnull"                       json:"name"`
	Slug      string     `bun:"slug,notnull"                       json:"slug"`
	CreatedBy *uuid.UUID `bun:"created_by,type:uuid"               json:"created_by,omitempty"`
	CreatedAt time.Time  `bun:"created_at,notnull,default:now()"   json:"created_at"`
	UpdatedAt time.Time  `bun:"updated_at,notnull,default:now()"   json:"updated_at"`
	DeletedAt *time.Time `bun:"deleted_at,soft_delete"             json:"deleted_at,omitempty"`
}

// OrgMembership links a user to an org with a role.
type OrgMembership struct {
	bun.BaseModel `bun:"table:org_memberships,alias:om"`

	ID        uuid.UUID `bun:"id,pk,type:uuid"                   json:"id"`
	OrgID     uuid.UUID `bun:"org_id,notnull,type:uuid"          json:"org_id"`
	UserID    uuid.UUID `bun:"user_id,notnull,type:uuid"         json:"user_id"`
	Role      string    `bun:"role,notnull,default:'org_viewer'"  json:"role"`
	CreatedAt time.Time `bun:"created_at,notnull,default:now()"  json:"created_at"`
	UpdatedAt time.Time `bun:"updated_at,notnull,default:now()"  json:"updated_at"`

	// Relations
	User *User `bun:"rel:belongs-to,join:user_id=id" json:"user,omitempty"`
	Org  *Org  `bun:"rel:belongs-to,join:org_id=id"  json:"org,omitempty"`
}

// OrgRole values.
const (
	OrgRoleAdmin  = "org_admin"
	OrgRoleViewer = "org_viewer"
)

// OrgInvitation represents a pending invitation to join an org.
type OrgInvitation struct {
	bun.BaseModel `bun:"table:org_invitations,alias:oi"`

	ID        uuid.UUID  `bun:"id,pk,type:uuid"                   json:"id"`
	OrgID     uuid.UUID  `bun:"org_id,notnull,type:uuid"          json:"org_id"`
	Email     string     `bun:"email,notnull"                      json:"email"`
	Role      string     `bun:"role,notnull,default:'org_viewer'"  json:"role"`
	Status    string     `bun:"status,notnull,default:'pending'"   json:"status"`
	InvitedBy *uuid.UUID `bun:"invited_by,type:uuid"               json:"invited_by,omitempty"`
	CreatedAt time.Time  `bun:"created_at,notnull,default:now()"   json:"created_at"`
	UpdatedAt time.Time  `bun:"updated_at,notnull,default:now()"   json:"updated_at"`
}

// InvitationStatus values.
const (
	InvitationStatusPending  = "pending"
	InvitationStatusAccepted = "accepted"
	InvitationStatusRevoked  = "revoked"
)

// ---------------------------------------------------------------------------
// Schema registry
// ---------------------------------------------------------------------------

// StrategyVersion is an atomic snapshot of all artifacts and relationships in an instance.
type StrategyVersion struct {
	bun.BaseModel `bun:"table:strategy_versions,alias:sv"`

	ID              uuid.UUID       `bun:"id,pk,type:uuid"                    json:"id"`
	InstanceID      uuid.UUID       `bun:"instance_id,notnull,type:uuid"      json:"instance_id"`
	Version         int             `bun:"version,notnull"                     json:"version"`
	Label           *string         `bun:"label"                               json:"label,omitempty"`
	Description     *string         `bun:"description"                         json:"description,omitempty"`
	Status          string          `bun:"status,notnull,default:'published'"  json:"status"`
	ParentVersionID *uuid.UUID      `bun:"parent_version_id,type:uuid"         json:"parent_version_id,omitempty"`
	Snapshot        json.RawMessage `bun:"snapshot,notnull,type:jsonb"         json:"snapshot"`
	PublishedBy     *uuid.UUID      `bun:"published_by,type:uuid"              json:"published_by,omitempty"`
	PublishedAt     time.Time       `bun:"published_at,notnull,default:now()"  json:"published_at"`
	CreatedAt       time.Time       `bun:"created_at,notnull,default:now()"    json:"created_at"`
}

// VersionStatus enumerates valid values for StrategyVersion.Status.
const (
	VersionStatusPublished  = "published"
	VersionStatusSuperseded = "superseded"
	VersionStatusRestored   = "restored"
)

// GithubSyncLog records each sync attempt from strategy-server to a GitHub repo.
type GithubSyncLog struct {
	bun.BaseModel `bun:"table:github_sync_log,alias:gsl"`

	ID            uuid.UUID  `bun:"id,pk,type:uuid"                    json:"id"`
	InstanceID    uuid.UUID  `bun:"instance_id,notnull,type:uuid"      json:"instance_id"`
	VersionID     *uuid.UUID `bun:"version_id,type:uuid"               json:"version_id,omitempty"`
	GithubRepo    string     `bun:"github_repo,notnull"                json:"github_repo"`
	BranchName    string     `bun:"branch_name,notnull"                json:"branch_name"`
	PRNumber      *int       `bun:"pr_number"                          json:"pr_number,omitempty"`
	PRUrl         *string    `bun:"pr_url"                             json:"pr_url,omitempty"`
	Status        string     `bun:"status,notnull,default:'pending'"   json:"status"`
	ArtifactCount int        `bun:"artifact_count,notnull"             json:"artifact_count"`
	ErrorMessage  *string    `bun:"error_message"                      json:"error_message,omitempty"`
	CreatedBy     *uuid.UUID `bun:"created_by,type:uuid"               json:"created_by,omitempty"`
	CreatedAt     time.Time  `bun:"created_at,notnull,default:now()"   json:"created_at"`
}

// SyncStatus enumerates valid values for GithubSyncLog.Status.
const (
	SyncStatusPending   = "pending"
	SyncStatusPushed    = "pushed"
	SyncStatusPRCreated = "pr_created"
	SyncStatusMerged    = "merged"
	SyncStatusFailed    = "failed"
)

// SchemaRegistryEntry stores a single JSON schema document in the runtime registry.
type SchemaRegistryEntry struct {
	bun.BaseModel `bun:"table:schema_registry,alias:scr"`

	ID         uuid.UUID       `bun:"id,pk,type:uuid"                   json:"id"`
	Version    string          `bun:"version,notnull"                    json:"version"`
	Dialect    string          `bun:"dialect,notnull,default:'standard'" json:"dialect"`
	SchemaName string          `bun:"schema_name,notnull"                json:"schema_name"`
	Content    json.RawMessage `bun:"content,notnull,type:jsonb"         json:"content"`
	CreatedAt  time.Time       `bun:"created_at,notnull,default:now()"   json:"created_at"`
}
