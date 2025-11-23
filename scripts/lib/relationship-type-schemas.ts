/**
 * Relationship Type Schemas for Migration
 *
 * IMPORTANT: These schemas are meant to be ADDED to the existing template pack,
 * not replace it. The template pack (seed-bible-template-pack.ts) is the source
 * of truth for relationship types.
 *
 * This file defines NEW relationship types that will be added to the Bible
 * template pack to support migrating embedded references to explicit relationships.
 *
 * Current Bible template pack has these relationship types:
 * - APPEARS_IN, LOCATED_IN, PARENT_OF, CHILD_OF, BORN_IN, DIED_IN
 * - TRAVELS_TO, OCCURS_IN, PARTICIPATES_IN, MEMBER_OF, LEADER_OF
 * - FULFILLS, MAKES_COVENANT, PERFORMS_MIRACLE, WITNESSES, OWNS, DESCENDED_FROM
 *
 * We need to ADD these types to handle embedded property migration:
 * - HAS_PARTY (for properties.parties)
 * - HAS_PARTICIPANT (for properties.participants and participants_canonical_ids)
 * - HAS_WITNESS (for properties.witnesses)
 * - PERFORMED_BY (for properties.performer)
 *
 * Format matches template pack relationship_type_schemas structure.
 */

export interface TemplatePackRelationshipTypeSchema {
  description: string;
  fromTypes: string[]; // Source types allowed
  toTypes: string[]; // Destination types allowed
  label?: string; // User-friendly display name (e.g., "Has Party")
  inverseLabel?: string; // Display name for reverse direction (e.g., "Party Of")
  // Note: multiplicity is NOT stored in template packs currently
  // SchemaRegistryService.getRelationshipMultiplicity() returns default many-to-many
}

/**
 * UI configuration for relationship types
 * Stored separately in ui_configs field of template pack
 */
export interface RelationshipTypeUIConfig {
  label: string; // Display name shown in UI
  inverseLabel?: string; // Display name for reverse direction
  icon?: string; // Lucide icon name (e.g., "lucide--users")
  color?: string; // Color theme (e.g., "primary", "accent")
  description?: string; // Longer explanation for tooltips
  hiddenInUI?: boolean; // Hide from relationship creation UI
}

/**
 * NEW relationship types to add to Bible template pack for migration support
 *
 * Based on analysis of 6,337 objects with embedded relationships:
 * - parties: 170 objects (string names)
 * - participants: 570 objects (string names)
 * - witnesses: 357 objects (string names)
 * - performer: 454 objects (string names)
 * - participants_canonical_ids: 12 objects (UUIDs - ready for migration)
 *
 * Note: These use internal type names (HAS_PARTY) but have user-friendly labels in UI config
 */
export const NEW_RELATIONSHIP_TYPES_FOR_TEMPLATE_PACK: Record<
  string,
  TemplatePackRelationshipTypeSchema
> = {
  HAS_PARTY: {
    description:
      'Indicates a party involved in a covenant, agreement, or contract. ' +
      'Parties have legal/spiritual obligations under the agreement.',
    label: 'Party To',
    inverseLabel: 'Has Party',
    fromTypes: ['Covenant', 'Agreement', 'Contract'],
    toTypes: ['Person', 'Group', 'Angel', 'Entity'],
  },
  HAS_PARTICIPANT: {
    description:
      'Indicates a participant in an event, meeting, or activity. ' +
      'Participants are present and involved but may not have legal obligations.',
    label: 'Participant In',
    inverseLabel: 'Has Participant',
    fromTypes: ['Event', 'Meeting', 'Activity', 'Gathering'],
    toTypes: ['Person', 'Group', 'Angel', 'Entity'],
  },
  HAS_WITNESS: {
    description:
      'Indicates a witness to an event, miracle, covenant, or testimony. ' +
      'Witnesses observe and can attest to the occurrence.',
    label: 'Witnessed By',
    inverseLabel: 'Witnessed',
    fromTypes: ['Event', 'Miracle', 'Covenant', 'Testimony', 'Sign'],
    toTypes: ['Person', 'Group', 'Angel'],
  },
  PERFORMED_BY: {
    description:
      'Indicates who performed a miracle, action, or event. ' +
      'The performer is the agent who caused or executed the action.',
    label: 'Performed By',
    inverseLabel: 'Performed',
    fromTypes: ['Miracle', 'Event', 'Action', 'Sign', 'Wonder'],
    toTypes: ['Person', 'Angel', 'Entity'],
  },
};

/**
 * UI configurations for new relationship types
 * These provide user-friendly labels, icons, and colors for display
 */
export const NEW_RELATIONSHIP_UI_CONFIGS: Record<
  string,
  RelationshipTypeUIConfig
> = {
  HAS_PARTY: {
    label: 'Party To',
    inverseLabel: 'Has Party',
    icon: 'lucide--handshake',
    color: 'primary',
    description:
      'A party to a covenant or agreement with legal/spiritual obligations',
  },
  HAS_PARTICIPANT: {
    label: 'Participant In',
    inverseLabel: 'Has Participant',
    icon: 'lucide--users',
    color: 'info',
    description: 'Someone who participated in or attended an event',
  },
  HAS_WITNESS: {
    label: 'Witnessed By',
    inverseLabel: 'Witnessed',
    icon: 'lucide--eye',
    color: 'secondary',
    description: 'Someone who observed and can testify to what happened',
  },
  PERFORMED_BY: {
    label: 'Performed By',
    inverseLabel: 'Performed',
    icon: 'lucide--zap',
    color: 'warning',
    description: 'The person or being who performed this action or miracle',
  },
};

/**
 * Map embedded property names to relationship types
 */
export const EMBEDDED_FIELD_TO_RELATIONSHIP_TYPE: Record<string, string> = {
  parties: 'HAS_PARTY',
  participants: 'HAS_PARTICIPANT',
  participants_canonical_ids: 'HAS_PARTICIPANT',
  witnesses: 'HAS_WITNESS',
  performer: 'PERFORMED_BY',
};

/**
 * Fields that contain canonical_ids (UUIDs) vs string names
 */
export const CANONICAL_ID_FIELDS = ['participants_canonical_ids'];
export const STRING_NAME_FIELDS = [
  'parties',
  'participants',
  'witnesses',
  'performer',
];

/**
 * Relationship properties schema for migration metadata
 * This will be stored in the relationship.properties field
 */
export interface MigrationRelationshipProperties {
  _migrated_from: string; // e.g., "parties", "participants_canonical_ids"
  _original_name?: string; // Original string name before entity resolution
  _resolution_confidence?: number; // Entity resolution confidence (0.0-1.0)
  _migration_date: string; // ISO 8601 timestamp
  _migration_strategy?: 'canonical_id' | 'name_match' | 'manual'; // How entity was resolved
}
