/**
 * TypeORM Entities - Central Export
 * ==================================
 * All database entities for the application
 */

// KB Schema Entities
export { Document, DocumentSourceType } from './document.entity';
export { Chunk } from './chunk.entity';
export { ObjectExtractionJob } from './object-extraction-job.entity';
export { GraphEmbeddingJob } from './graph-embedding-job.entity';
export { AuthIntrospectionCache } from './auth-introspection-cache.entity';
export { Tag } from './tag.entity';
export { GraphObject } from './graph-object.entity';
export { GraphRelationship } from './graph-relationship.entity';
export { Org } from './org.entity';
export { Project } from './project.entity';
export { OrganizationMembership } from './organization-membership.entity';
export { ProjectMembership } from './project-membership.entity';
export { Invite } from './invite.entity';
export { Setting } from './setting.entity';
export { Branch } from './branch.entity';
export { BranchLineage } from './branch-lineage.entity';
export { ProductVersion } from './product-version.entity';
export { ProductVersionMember } from './product-version-member.entity';
export { MergeProvenance } from './merge-provenance.entity';
export { ObjectTypeSchema } from './object-type-schema.entity';
export { ChatConversation } from './chat-conversation.entity';
export { ChatMessage } from './chat-message.entity';
export { Notification } from './notification.entity';
export { ProjectObjectTypeRegistry } from './project-object-type-registry.entity';
export { LlmCallLog } from './llm-call-log.entity';
export { SystemProcessLog } from './system-process-log.entity';
export { EmbeddingPolicy } from './embedding-policy.entity';
export { AuditLog } from './audit-log.entity';
export { ClickUpImportLog } from './clickup-import-log.entity';
export { ClickUpSyncState } from './clickup-sync-state.entity';
export { ObjectExtractionLog } from './object-extraction-log.entity';
export { ObjectChunk } from './object-chunk.entity';
export { Integration } from './integration.entity';
export { UserRecentItem } from './user-recent-item.entity';
export { Agent } from './agent.entity';
export { AgentRun } from './agent-run.entity';
export { Task } from './task.entity';
export {
  ExternalSource,
  ExternalSourceType,
  SyncPolicy,
  ExternalSourceStatus,
} from './external-source.entity';
export { EmailJob } from './email-job.entity';
export { EmailLog } from './email-log.entity';

// Release Notifications
export { ReleaseNotification } from '../modules/releases/entities/release-notification.entity';
export { ReleaseNotificationRecipient } from '../modules/releases/entities/release-notification-recipient.entity';
export { ReleaseNotificationState } from '../modules/releases/entities/release-notification-state.entity';

// Core Schema Entities
export { UserProfile } from './user-profile.entity';
export { UserEmail } from './user-email.entity';
export { Superadmin } from './superadmin.entity';

// Array of all entities for TypeORM configuration
import { Document } from './document.entity';
import { Chunk } from './chunk.entity';
import { ObjectExtractionJob } from './object-extraction-job.entity';
import { GraphEmbeddingJob } from './graph-embedding-job.entity';
import { AuthIntrospectionCache } from './auth-introspection-cache.entity';
import { Tag } from './tag.entity';
import { GraphObject } from './graph-object.entity';
import { GraphRelationship } from './graph-relationship.entity';
import { Org } from './org.entity';
import { Project } from './project.entity';
import { OrganizationMembership } from './organization-membership.entity';
import { ProjectMembership } from './project-membership.entity';
import { Invite } from './invite.entity';
import { Setting } from './setting.entity';
import { Branch } from './branch.entity';
import { BranchLineage } from './branch-lineage.entity';
import { ProductVersion } from './product-version.entity';
import { ProductVersionMember } from './product-version-member.entity';
import { MergeProvenance } from './merge-provenance.entity';
import { ObjectTypeSchema } from './object-type-schema.entity';
import { ChatConversation } from './chat-conversation.entity';
import { ChatMessage } from './chat-message.entity';
import { Notification } from './notification.entity';
import { ProjectObjectTypeRegistry } from './project-object-type-registry.entity';
import { LlmCallLog } from './llm-call-log.entity';
import { SystemProcessLog } from './system-process-log.entity';
import { EmbeddingPolicy } from './embedding-policy.entity';
import { AuditLog } from './audit-log.entity';
import { ClickUpImportLog } from './clickup-import-log.entity';
import { ClickUpSyncState } from './clickup-sync-state.entity';
import { ObjectExtractionLog } from './object-extraction-log.entity';
import { ObjectChunk } from './object-chunk.entity';
import { Integration } from './integration.entity';
import { UserRecentItem } from './user-recent-item.entity';
import { Agent } from './agent.entity';
import { AgentRun } from './agent-run.entity';
import { Task } from './task.entity';
import { UserProfile } from './user-profile.entity';
import { UserEmail } from './user-email.entity';
import { Superadmin } from './superadmin.entity';
import { ExternalSource } from './external-source.entity';
import { EmailJob } from './email-job.entity';
import { EmailLog } from './email-log.entity';
import { ReleaseNotification } from '../modules/releases/entities/release-notification.entity';
import { ReleaseNotificationRecipient } from '../modules/releases/entities/release-notification-recipient.entity';
import { ReleaseNotificationState } from '../modules/releases/entities/release-notification-state.entity';

export const entities = [
  // KB Schema
  Document,
  Chunk,
  ObjectExtractionJob,
  GraphEmbeddingJob,
  AuthIntrospectionCache,
  Tag,
  GraphObject,
  GraphRelationship,
  Org,
  Project,
  OrganizationMembership,
  ProjectMembership,
  Invite,
  Setting,
  Branch,
  BranchLineage,
  ProductVersion,
  ProductVersionMember,
  MergeProvenance,
  ObjectTypeSchema,
  ChatConversation,
  ChatMessage,
  Notification,
  ProjectObjectTypeRegistry,
  LlmCallLog,
  SystemProcessLog,
  EmbeddingPolicy,
  AuditLog,
  ClickUpImportLog,
  ClickUpSyncState,
  ObjectExtractionLog,
  ObjectChunk,
  Integration,
  UserRecentItem,
  ExternalSource,
  // Core Schema
  UserProfile,
  UserEmail,
  Superadmin,
  // Agent System
  Agent,
  AgentRun,
  Task,
  // Email System
  EmailJob,
  EmailLog,
  // Release Notifications
  ReleaseNotification,
  ReleaseNotificationRecipient,
  ReleaseNotificationState,
];
