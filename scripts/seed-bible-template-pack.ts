#!/usr/bin/env tsx
/**
 * Bible Knowledge Graph Template Pack v2.0
 *
 * MAJOR CHANGES FROM v1.0:
 *
 * 1. Entity References Use Names (Not canonical_id directly in schema)
 *    - Properties like `father`, `birth_location`, `region` now store entity NAMES
 *    - The entity linking service resolves names → canonical_id during extraction
 *    - This keeps LLM prompts intuitive while ensuring robust relationships
 *
 * 2. Schema Version Tracking (First-Class Column)
 *    - Schema version is now tracked via `schema_version` column on graph_objects table
 *    - The template pack's `version` field (e.g., "2.0.0") is automatically stored
 *    - No need for `_schema_version` property in entity schemas
 *
 * 3. Enhanced Properties
 *    - Added `aliases`, `significance`, `source_references` to core entities
 *    - Better enum constraints for categorical fields
 *    - More comprehensive extraction examples
 *
 * 4. Improved Extraction Prompts
 *    - Explicit instructions to use entity NAMES for references
 *    - Clear examples showing proper format
 *    - Guidance on how system resolves names to canonical IDs
 *
 * MIGRATION FROM v1.0:
 * - This is an IN-PLACE update (same template pack ID)
 * - Existing v1.0 objects remain valid
 * - Run migration script to convert v1.0 → v2.0: npm run migrate:bible-objects
 * - New extractions automatically use v2.0 schema
 *
 * See: docs/spec/schema-versioning-and-migration-strategy.md
 */
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

const BIBLE_TEMPLATE_PACK_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';

const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[seed-bible-template] Loaded environment from ${envPath}`);
} else {
  console.warn(
    '[seed-bible-template] No .env file found at project root – proceeding with process env values only'
  );
}

// Validate required environment variables
validateEnvVars(DB_REQUIREMENTS);

const pool = new Pool(getDbConfig());

const templatePackName =
  process.env.BIBLE_TEMPLATE_PACK_NAME || 'Bible Knowledge Graph';
const templatePackVersion = process.env.BIBLE_TEMPLATE_PACK_VERSION || '2.1.0';

const entityTypes = [
  {
    type: 'Person',
    description: 'Individual person mentioned in biblical text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Full name of the person' },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Alternative names (e.g., Saul/Paul, Simon/Peter)',
        },
        role: {
          type: 'string',
          description:
            'Position, title, or role (e.g., prophet, king, apostle)',
        },
        occupation: {
          type: 'string',
          description:
            'Profession or occupation (e.g., shepherd, fisherman, tax collector)',
        },
        // References to other entities (using names - system will resolve to canonical_id)
        tribe: {
          type: 'string',
          description:
            'Israelite tribe name (e.g., "Tribe of Judah") - will be linked to Group entity',
        },
        birth_location: {
          type: 'string',
          description:
            'Place of birth name (e.g., "Bethlehem") - will be linked to Place entity',
        },
        death_location: {
          type: 'string',
          description:
            'Place of death name (e.g., "Jerusalem") - will be linked to Place entity',
        },
        father: {
          type: 'string',
          description:
            'Father\'s name (e.g., "Abraham") - will be linked to Person entity',
        },
        mother: {
          type: 'string',
          description:
            'Mother\'s name (e.g., "Sarah") - will be linked to Person entity',
        },
        significance: {
          type: 'string',
          description:
            'Why this person is important biblically (1-2 sentences)',
        },
        source_references: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Biblical references where mentioned (e.g., ["Genesis 12", "Genesis 22"])',
        },
      },
    },
    extraction: {
      system:
        'Extract all people mentioned in the biblical text with their roles, occupations, tribal affiliations, and associated locations. For references to other entities (places, tribes, family), use the ENTITY NAME which will be resolved to canonical_id by the system.',
      user: `Identify each person in the text. Return:
- name: Person's primary name
- aliases: Array of alternative names if mentioned
- role: Their role or title (e.g., prophet, king, apostle)
- occupation: Their profession if mentioned
- tribe: Name of their tribe (e.g., "Tribe of Judah")
- birth_location: Name of birthplace (e.g., "Bethlehem")
- death_location: Name of place where they died
- father: Father's name (e.g., "Abraham")
- mother: Mother's name (e.g., "Sarah")
- significance: Brief description of why they're important
- source_references: Array of chapter references where they appear

Example:
{
  "name": "Isaac",
  "father": "Abraham",
  "mother": "Sarah",
  "birth_location": "Canaan",
  "role": "patriarch",
  "significance": "Son of Abraham, father of Jacob and Esau, central figure in covenant",
  "source_references": ["Genesis 21", "Genesis 22", "Genesis 26"]
}

IMPORTANT: Use entity NAMES (not IDs) for references. The system will automatically resolve names to canonical entity IDs.`,
    },
  },
  {
    type: 'Place',
    description: 'Geographic location referenced in biblical text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Primary location name (e.g., "Jerusalem", "Bethlehem")',
        },
        alternate_names: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Other names for this location (e.g., ["Zion", "City of David"] for Jerusalem)',
        },
        type: {
          type: 'string',
          enum: [
            'city',
            'region',
            'country',
            'mountain',
            'river',
            'sea',
            'desert',
            'garden',
            'building',
            'landmark',
          ],
          description: 'Type of location',
        },
        region: {
          type: 'string',
          description:
            'Parent region name (e.g., "Judea", "Galilee") - will be linked to Place entity',
        },
        country: {
          type: 'string',
          description:
            'Country or kingdom name (e.g., "Israel", "Roman Empire") - will be linked to Place entity',
        },
        modern_location: {
          type: 'string',
          description: 'Modern day location or country',
        },
        significance: {
          type: 'string',
          description:
            'Why this location is important biblically (1-2 sentences)',
        },
        source_references: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Biblical references where mentioned (e.g., ["Ruth 1", "Matthew 2"])',
        },
      },
    },
    extraction: {
      system:
        'Extract all geographic locations mentioned in the text with their regional context. For hierarchical references (region, country), use entity NAMES which will be resolved to canonical_id.',
      user: `Identify every location referenced. Return:
- name: Primary location name
- alternate_names: Array of other names if mentioned
- type: Type of location (city, region, mountain, etc.)
- region: Parent region name if mentioned
- country: Country or kingdom name if mentioned
- modern_location: Modern location if known
- significance: Brief description of biblical importance
- source_references: Array of chapter references

Example:
{
  "name": "Bethlehem",
  "alternate_names": ["Ephrathah", "City of David"],
  "type": "city",
  "region": "Judea",
  "modern_location": "West Bank, Palestine",
  "significance": "Birthplace of King David and Jesus Christ",
  "source_references": ["Ruth 1", "Matthew 2", "Luke 2"]
}

IMPORTANT: Use entity NAMES for region/country references. The system will resolve them to canonical IDs.`,
    },
  },
  {
    type: 'Event',
    description: 'Significant event or occurrence in biblical narrative',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description:
            'Event name or description (e.g., "Crossing of the Red Sea", "Crucifixion")',
        },
        type: {
          type: 'string',
          enum: [
            'miracle',
            'battle',
            'covenant',
            'judgment',
            'prophecy',
            'teaching',
            'journey',
            'birth',
            'death',
            'resurrection',
            'other',
          ],
          description: 'Category of event',
        },
        date_description: {
          type: 'string',
          description:
            'Textual description of when it occurred (e.g., "during the Exodus", "after three days")',
        },
        location: {
          type: 'string',
          description:
            'Where the event happened - place name (e.g., "Red Sea") - will be linked to Place entity',
        },
        description: {
          type: 'string',
          description: 'Brief description of what happened',
        },
        theological_significance: {
          type: 'string',
          description: 'Why this event matters theologically',
        },
        source_reference: {
          type: 'string',
          description:
            'Primary biblical reference (e.g., "Exodus 14", "Matthew 27")',
        },
      },
    },
    extraction: {
      system:
        'Extract significant events from the narrative including when, where they occurred. For location references, use entity NAMES which will be resolved to canonical_id. Participants should be created as explicit HAS_PARTICIPANT relationships, not embedded in the event properties.',
      user: `Identify major events in the text. Return:
- name: Event name or description
- type: Category (miracle, battle, covenant, etc.)
- date_description: When it occurred (textual description)
- location: Place name where it happened
- description: Brief description of what happened
- theological_significance: Why it matters theologically
- source_reference: Primary chapter reference

Example:
{
  "name": "Crossing of the Red Sea",
  "type": "miracle",
  "date_description": "during the Exodus from Egypt",
  "location": "Red Sea",
  "description": "God parted the Red Sea allowing Israelites to cross, then closed it over the Egyptian army",
  "theological_significance": "Demonstrates God's power to deliver His people",
  "source_reference": "Exodus 14"
}

IMPORTANT: 
- Use entity NAMES for location which will be resolved to canonical IDs
- DO NOT include participants array - participants will be linked via HAS_PARTICIPANT relationships
- The system will create relationships between Event and Person entities separately`,
    },
  },
  {
    type: 'Book',
    description: 'Biblical book or writing (one of the 66 books of the Bible)',
    schema: {
      type: 'object',
      required: ['name', 'testament'],
      properties: {
        name: {
          type: 'string',
          description:
            'Full book name (e.g., "Genesis", "Matthew", "1 Corinthians")',
        },
        testament: {
          type: 'string',
          enum: ['Old Testament', 'New Testament'],
          description: 'Testament classification',
        },
        category: {
          type: 'string',
          enum: [
            'Law',
            'History',
            'Wisdom',
            'Major Prophets',
            'Minor Prophets',
            'Gospels',
            'Acts',
            'Pauline Epistles',
            'General Epistles',
            'Apocalyptic',
          ],
          description: 'Literary category',
        },
        author: {
          type: 'string',
          description:
            'Traditional or attributed author name (e.g., "Moses", "Paul") - will be linked to Person entity',
        },
        chapter_count: {
          type: 'integer',
          description: 'Total number of chapters in this book',
        },
      },
    },
    extraction: {
      system:
        'Extract the Book entity for this document. A Book is one of the 66 books of the Bible.',
      user: `Extract the Book entity. Return:
- name: Exact book name from the document title
- testament: "Old Testament" or "New Testament"
- category: Literary category
- author: Author's name (will be linked to Person entity)
- chapter_count: Total chapters if determinable

Example:
{
  "name": "Genesis",
  "testament": "Old Testament",
  "category": "Law",
  "author": "Moses",
  "chapter_count": 50
}

Extract ONE Book entity per document based on the document title/heading.`,
    },
  },
  {
    type: 'Quote',
    description: 'Notable quotation, saying, or spoken words from the text',
    schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'The quoted text or saying' },
        speaker: {
          type: 'string',
          description:
            'Who spoke these words - person name (e.g., "Jesus", "God") - will be linked to Person entity',
        },
        audience: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Who the quote was addressed to - names (e.g., ["Nicodemus"]) - will be linked to Person/Group entities',
        },
        context: {
          type: 'string',
          description: 'Situational context (when, where, why it was said)',
        },
        source_reference: {
          type: 'string',
          description: 'Biblical reference (e.g., "John 3:16", "Genesis 1:3")',
        },
        type: {
          type: 'string',
          enum: [
            'teaching',
            'commandment',
            'prophecy',
            'prayer',
            'dialogue',
            'proclamation',
          ],
          description: 'Type of quote',
        },
      },
    },
    extraction: {
      system:
        'Extract notable quotations, prophecies, commandments, or significant sayings from the text. For speaker and audience, use entity NAMES.',
      user: `Identify important quotes or sayings. Return:
- text: The exact quoted words
- speaker: Person name who spoke (e.g., "Jesus", "God")
- audience: Array of names who heard it
- context: Situational context
- source_reference: Verse or chapter reference
- type: Type of quote (teaching, commandment, etc.)

Example:
{
  "text": "For God so loved the world, that he gave his only Son...",
  "speaker": "Jesus",
  "audience": ["Nicodemus"],
  "context": "Jesus teaching Nicodemus about salvation",
  "source_reference": "John 3:16",
  "type": "teaching"
}

IMPORTANT: Use entity NAMES for speaker and audience. System will resolve to canonical IDs.`,
    },
  },
  {
    type: 'Group',
    description: 'Tribe, nation, religious sect, or organized group of people',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description:
            'Name of the group (e.g., "Israelites", "Pharisees", "Tribe of Judah")',
        },
        type: {
          type: 'string',
          enum: [
            'tribe',
            'nation',
            'religious sect',
            'military',
            'family clan',
            'political party',
            'other',
          ],
          description: 'Type of group',
        },
        region: {
          type: 'string',
          description:
            'Geographic region - place name (e.g., "Judea") - will be linked to Place entity',
        },
        leader: {
          type: 'string',
          description:
            'Leader or head - person name (e.g., "David") - will be linked to Person entity',
        },
        founded_by: {
          type: 'string',
          description:
            'Founder - person name (e.g., "Judah") - will be linked to Person entity',
        },
        description: {
          type: 'string',
          description:
            'Brief description of the group and its purpose or beliefs',
        },
        source_references: {
          type: 'array',
          items: { type: 'string' },
          description: 'Biblical references where mentioned',
        },
      },
    },
    extraction: {
      system:
        'Extract groups, organizations, tribes, nations, or collectives mentioned in the text. For leader, region, and founder, use entity NAMES.',
      user: `Identify groups of people. Return:
- name: Group name
- type: Type of group (tribe, nation, religious sect, etc.)
- region: Place name where located
- leader: Leader's name
- founded_by: Founder's name
- description: Brief description
- source_references: Chapter references

Example:
{
  "name": "Tribe of Judah",
  "type": "tribe",
  "region": "Judea",
  "founded_by": "Judah",
  "description": "One of the twelve tribes of Israel, from which King David and Jesus descended",
  "source_references": ["Genesis 49", "Revelation 5"]
}

IMPORTANT: Use entity NAMES for region, leader, founded_by. System will resolve to canonical IDs.`,
    },
  },
  {
    type: 'Object',
    description: 'Physical object, artifact, or structure of significance',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Name of the object' },
        type: {
          type: 'string',
          description:
            'Type of object (e.g., artifact, building, weapon, vessel)',
        },
        description: {
          type: 'string',
          description: 'Physical description or purpose',
        },
        owner: {
          type: 'string',
          description:
            'Who owns or possesses the object - person/group name - will be linked to Person/Group entity',
        },
        location: {
          type: 'string',
          description:
            'Where the object is located - place name - will be linked to Place entity',
        },
      },
    },
    extraction: {
      system:
        'Extract significant objects, artifacts, structures, or physical items mentioned in the text. For owner and location, use entity NAMES.',
      user: 'Identify important objects or artifacts. Return the name, type (e.g., artifact, building), description, location (place name), and owner (person/group name) if mentioned. Use entity NAMES which will be resolved to canonical IDs.',
    },
  },
  {
    type: 'Covenant',
    description: 'Agreement, covenant, or treaty between parties',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Name of the covenant' },
        terms: {
          type: 'string',
          description: 'Terms or conditions of the covenant',
        },
        sign: {
          type: 'string',
          description: 'Physical sign or symbol of the covenant',
        },
      },
    },
    extraction: {
      system:
        'Extract covenants, agreements, or treaties mentioned in the text. Parties should be represented as HAS_PARTY relationships, not embedded in properties.',
      user: 'Identify covenants or agreements. Return the name, terms, and any sign or symbol associated with it. Do NOT include a parties array - parties will be linked via explicit HAS_PARTY relationships.',
    },
  },
  {
    type: 'Prophecy',
    description: 'Prophecy, prediction, or divinely inspired message',
    schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'The prophetic text or message' },
        prophet: {
          type: 'string',
          description: 'Who delivered the prophecy',
        },
        subject: {
          type: 'string',
          description: 'Subject or topic of the prophecy',
        },
        fulfillment_reference: {
          type: 'string',
          description: 'Reference to where/how the prophecy was fulfilled',
        },
      },
    },
    extraction: {
      system:
        'Extract prophecies, predictions, or divinely inspired messages from the text. For prophet, use entity NAME.',
      user: 'Identify prophecies. Return the prophetic text, who delivered it (prophet name), the subject, and any fulfillment reference. Use entity NAMES which will be resolved to canonical IDs.',
    },
  },
  {
    type: 'Miracle',
    description: 'Supernatural event or miracle',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Name or description of the miracle',
        },
        type: {
          type: 'string',
          description: 'Type of miracle (e.g., healing, nature, resurrection)',
        },
        location: {
          type: 'string',
          description:
            'Where the miracle occurred - place name - will be linked to Place entity',
        },
      },
    },
    extraction: {
      system:
        'Extract miracles and supernatural events from the text. Performer and witnesses should be represented as PERFORMED_BY and HAS_WITNESS relationships, not embedded in properties.',
      user: 'Identify miracles or supernatural events. Return the name, type (e.g., healing, nature), and location (place name). Do NOT include performer or witnesses fields - these will be linked via explicit PERFORMED_BY and HAS_WITNESS relationships.',
    },
  },
  {
    type: 'Angel',
    description: 'Angel or spiritual being',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the angel or type of spiritual being',
        },
        rank: {
          type: 'string',
          description:
            'Rank or classification (e.g., archangel, cherubim, seraphim)',
        },
        mission: {
          type: 'string',
          description: 'Mission or purpose of appearance',
        },
        appearances: {
          type: 'array',
          items: { type: 'string' },
          description: 'When/where the angel appeared',
        },
      },
    },
    extraction: {
      system: 'Extract angels and spiritual beings mentioned in the text.',
      user: 'Identify angels or spiritual beings. Return the name or type, rank (e.g., archangel, cherubim), mission, and appearance details. Appearances should include locations (place names will be resolved to canonical IDs).',
    },
  },
];

const relationshipTypes = [
  {
    type: 'APPEARS_IN',
    description: 'Entity appears in a book',
    label: 'Appears In',
    inverseLabel: 'Contains',
    fromTypes: ['Person', 'Place', 'Event', 'Group', 'Object', 'Angel'],
    toTypes: ['Book'],
    semanticHints: [
      'mentioned in',
      'found in',
      'referenced in',
      'occurs in',
      'is in',
      'features in',
    ],
  },
  {
    type: 'LOCATED_IN',
    description: 'Geographic containment (place within place)',
    label: 'Located In',
    inverseLabel: 'Contains',
    fromTypes: ['Place'],
    toTypes: ['Place'],
    semanticHints: [
      'within',
      'inside',
      'part of',
      'in the region of',
      'in the land of',
      'near',
      'beside',
    ],
  },
  {
    type: 'PARENT_OF',
    description: 'Parental relationship',
    label: 'Parent Of',
    inverseLabel: 'Child Of',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    semanticHints: [
      'father of',
      'mother of',
      'begat',
      'fathered',
      'bore',
      'gave birth to',
      'sired',
      'progenitor of',
    ],
  },
  {
    type: 'CHILD_OF',
    description: 'Child relationship',
    label: 'Child Of',
    inverseLabel: 'Parent Of',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    semanticHints: [
      'son of',
      'daughter of',
      'offspring of',
      'born to',
      'begotten by',
      'descended from',
      'child of',
    ],
  },
  {
    type: 'BORN_IN',
    description: 'Person born in location',
    label: 'Born In',
    inverseLabel: 'Birthplace Of',
    fromTypes: ['Person'],
    toTypes: ['Place'],
    semanticHints: [
      'birthplace',
      'native of',
      'came from',
      'originated from',
      'from',
    ],
  },
  {
    type: 'DIED_IN',
    description: 'Person died in location',
    label: 'Died In',
    inverseLabel: 'Death Place Of',
    fromTypes: ['Person'],
    toTypes: ['Place'],
    semanticHints: [
      'death place',
      'perished in',
      'fell in',
      'buried in',
      'resting place',
    ],
  },
  {
    type: 'TRAVELS_TO',
    description: 'Person or group travels to location',
    label: 'Traveled To',
    inverseLabel: 'Visited By',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Place'],
    semanticHints: [
      'went to',
      'journeyed to',
      'visited',
      'arrived at',
      'came to',
      'departed to',
      'fled to',
      'sojourned in',
    ],
  },
  {
    type: 'OCCURS_IN',
    description: 'Event or miracle occurs in location',
    label: 'Occurred In',
    inverseLabel: 'Location Of',
    fromTypes: ['Event', 'Miracle'],
    toTypes: ['Place'],
    semanticHints: [
      'happened in',
      'took place in',
      'at',
      'location of',
      'site of',
      'scene of',
    ],
  },
  {
    type: 'PARTICIPATES_IN',
    description: 'Person, group, or angel participates in event',
    label: 'Participated In',
    inverseLabel: 'Had Participant',
    fromTypes: ['Person', 'Group', 'Angel'],
    toTypes: ['Event'],
    semanticHints: [
      'involved in',
      'took part in',
      'was present at',
      'joined',
      'attended',
      'engaged in',
    ],
  },
  {
    type: 'MEMBER_OF',
    description: 'Person is member of group',
    label: 'Member Of',
    inverseLabel: 'Has Member',
    fromTypes: ['Person'],
    toTypes: ['Group'],
    semanticHints: [
      'belongs to',
      'part of',
      'one of the',
      'among the',
      'in the tribe of',
      'of the house of',
    ],
  },
  {
    type: 'LEADER_OF',
    description: 'Person leads group',
    label: 'Leader Of',
    inverseLabel: 'Led By',
    fromTypes: ['Person'],
    toTypes: ['Group'],
    semanticHints: [
      'king of',
      'ruler of',
      'chief of',
      'head of',
      'captain of',
      'prince of',
      'judge of',
      'governor of',
      'commanded',
    ],
  },
  {
    type: 'FULFILLS',
    description: 'Event or person fulfills prophecy',
    label: 'Fulfills',
    inverseLabel: 'Fulfilled By',
    fromTypes: ['Event', 'Person'],
    toTypes: ['Prophecy'],
    semanticHints: [
      'fulfilled',
      'accomplished',
      'came to pass',
      'as foretold',
      'according to the word',
      'as prophesied',
    ],
  },
  {
    type: 'MAKES_COVENANT',
    description: 'Person or group makes covenant',
    label: 'Made Covenant',
    inverseLabel: 'Covenant By',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Covenant'],
    semanticHints: [
      'entered covenant',
      'established covenant',
      'swore oath',
      'made promise',
      'bound by',
      'agreed to',
    ],
  },
  {
    type: 'PERFORMS_MIRACLE',
    description: 'Person or angel performs miracle',
    label: 'Performed Miracle',
    inverseLabel: 'Performed By',
    fromTypes: ['Person', 'Angel'],
    toTypes: ['Miracle'],
    semanticHints: [
      'did miracle',
      'worked wonder',
      'performed sign',
      'showed power',
      'healed',
      'raised',
      'cast out',
    ],
  },
  {
    type: 'WITNESSES',
    description: 'Person or group witnesses miracle or event',
    label: 'Witnessed',
    inverseLabel: 'Witnessed By',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Miracle', 'Event'],
    semanticHints: [
      'saw',
      'beheld',
      'observed',
      'was present at',
      'testified to',
      'looked upon',
    ],
  },
  {
    type: 'OWNS',
    description: 'Person or group owns object',
    label: 'Owns',
    inverseLabel: 'Owned By',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Object'],
    semanticHints: [
      'possesses',
      'has',
      'holds',
      'keeper of',
      'guardian of',
      'master of',
    ],
  },
  {
    type: 'DESCENDED_FROM',
    description: 'Genealogical descent or lineage',
    label: 'Descended From',
    inverseLabel: 'Ancestor Of',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Person', 'Group'],
    semanticHints: [
      'lineage of',
      'offspring of',
      'seed of',
      'house of',
      'tribe of',
      'clan of',
      'generations of',
      'genealogy',
    ],
  },
  {
    type: 'PROPHESIED_BY',
    description: 'Prophecy delivered by person',
    label: 'Prophesied By',
    inverseLabel: 'Prophesied',
    fromTypes: ['Prophecy'],
    toTypes: ['Person'],
    semanticHints: [
      'spoken by',
      'declared by',
      'foretold by',
      'revealed through',
      'word of',
      'oracle of',
    ],
  },
  {
    type: 'SPEAKS',
    description: 'Person or angel speaks quote',
    label: 'Spoke',
    inverseLabel: 'Spoken By',
    fromTypes: ['Person', 'Angel'],
    toTypes: ['Quote'],
    semanticHints: [
      'said',
      'declared',
      'proclaimed',
      'uttered',
      'answered',
      'cried out',
      'commanded',
      'words of',
    ],
  },
  // NEW RELATIONSHIP TYPES for migrating embedded references
  {
    type: 'HAS_PARTY',
    description:
      'Party involved in a covenant or agreement with legal/spiritual obligations',
    label: 'Has Party',
    inverseLabel: 'Party To',
    fromTypes: ['Covenant', 'Agreement', 'Contract'],
    toTypes: ['Person', 'Group', 'Angel'],
    semanticHints: [
      'between',
      'with',
      'involving',
      'party to',
      'signatory',
      'bound to',
    ],
  },
  {
    type: 'HAS_PARTICIPANT',
    description: 'Participant in an event, meeting, or activity',
    label: 'Has Participant',
    inverseLabel: 'Participant In',
    fromTypes: ['Event', 'Meeting', 'Activity', 'Gathering'],
    toTypes: ['Person', 'Group', 'Angel'],
    semanticHints: [
      'involved',
      'attended by',
      'included',
      'with',
      'among those present',
    ],
  },
  {
    type: 'HAS_WITNESS',
    description: 'Witness who observed and can testify to what happened',
    label: 'Witnessed By',
    inverseLabel: 'Witnessed',
    fromTypes: ['Event', 'Miracle', 'Covenant', 'Testimony', 'Sign'],
    toTypes: ['Person', 'Group', 'Angel'],
    semanticHints: [
      'seen by',
      'observed by',
      'testified by',
      'in presence of',
      'before',
    ],
  },
  {
    type: 'PERFORMED_BY',
    description: 'Performed by a person or being who executed the action',
    label: 'Performed By',
    inverseLabel: 'Performed',
    fromTypes: ['Miracle', 'Event', 'Action', 'Sign', 'Wonder'],
    toTypes: ['Person', 'Angel'],
    semanticHints: [
      'done by',
      'executed by',
      'carried out by',
      'through',
      'by the hand of',
    ],
  },
];

async function upsertBibleTemplatePack(client: PoolClient): Promise<void> {
  const objectTypeSchemas: Record<string, unknown> = {};
  const extractionPrompts: Record<string, unknown> = {};
  const uiConfigs: Record<string, unknown> = {};
  const relationshipTypeSchemas: Record<string, unknown> = {};
  const relationshipUIConfigs: Record<string, unknown> = {};

  for (const type of entityTypes) {
    objectTypeSchemas[type.type] = {
      ...type.schema,
      description: type.description, // Include description at schema level for API access
    };
    extractionPrompts[type.type] = type.extraction;
    const iconMap: Record<string, string> = {
      Person: 'lucide--user',
      Place: 'lucide--map-pin',
      Event: 'lucide--calendar',
      Book: 'lucide--book-open',
      Quote: 'lucide--quote',
      Group: 'lucide--users',
      Object: 'lucide--box',
      Covenant: 'lucide--handshake',
      Prophecy: 'lucide--sparkles',
      Miracle: 'lucide--zap',
      Angel: 'lucide--bird',
    };

    const colorMap: Record<string, string> = {
      Person: 'primary',
      Place: 'info',
      Event: 'warning',
      Book: 'accent',
      Quote: 'secondary',
      Group: 'primary',
      Object: 'neutral',
      Covenant: 'success',
      Prophecy: 'warning',
      Miracle: 'error',
      Angel: 'info',
    };

    uiConfigs[type.type] = {
      icon: iconMap[type.type] || 'lucide--circle',
      color: colorMap[type.type] || 'neutral',
    };
  }

  // Process relationship types
  for (const rel of relationshipTypes) {
    relationshipTypeSchemas[rel.type] = {
      description: rel.description,
      fromTypes: rel.fromTypes,
      toTypes: rel.toTypes,
      label: rel.label,
      inverseLabel: rel.inverseLabel,
      semanticHints: rel.semanticHints,
    };

    // Add UI config for relationships
    const relationshipIconMap: Record<string, string> = {
      APPEARS_IN: 'lucide--book-open',
      LOCATED_IN: 'lucide--map-pin',
      PARENT_OF: 'lucide--users',
      CHILD_OF: 'lucide--baby',
      BORN_IN: 'lucide--cake',
      DIED_IN: 'lucide--cross',
      TRAVELS_TO: 'lucide--plane',
      OCCURS_IN: 'lucide--map-pin',
      PARTICIPATES_IN: 'lucide--user-check',
      MEMBER_OF: 'lucide--users',
      LEADER_OF: 'lucide--crown',
      FULFILLS: 'lucide--check-circle',
      MAKES_COVENANT: 'lucide--handshake',
      PERFORMS_MIRACLE: 'lucide--zap',
      WITNESSES: 'lucide--eye',
      OWNS: 'lucide--package',
      DESCENDED_FROM: 'lucide--git-branch',
      PROPHESIED_BY: 'lucide--message-circle',
      SPEAKS: 'lucide--quote',
      // NEW relationship types
      HAS_PARTY: 'lucide--handshake',
      HAS_PARTICIPANT: 'lucide--users',
      HAS_WITNESS: 'lucide--eye',
      PERFORMED_BY: 'lucide--zap',
    };

    const relationshipColorMap: Record<string, string> = {
      APPEARS_IN: 'info',
      LOCATED_IN: 'primary',
      PARENT_OF: 'secondary',
      CHILD_OF: 'secondary',
      BORN_IN: 'success',
      DIED_IN: 'error',
      TRAVELS_TO: 'info',
      OCCURS_IN: 'warning',
      PARTICIPATES_IN: 'primary',
      MEMBER_OF: 'primary',
      LEADER_OF: 'warning',
      FULFILLS: 'success',
      MAKES_COVENANT: 'accent',
      PERFORMS_MIRACLE: 'error',
      WITNESSES: 'info',
      OWNS: 'neutral',
      DESCENDED_FROM: 'secondary',
      PROPHESIED_BY: 'warning',
      SPEAKS: 'accent',
      // NEW relationship types
      HAS_PARTY: 'primary',
      HAS_PARTICIPANT: 'info',
      HAS_WITNESS: 'secondary',
      PERFORMED_BY: 'warning',
    };

    relationshipUIConfigs[rel.type] = {
      label: rel.label,
      inverseLabel: rel.inverseLabel,
      icon: relationshipIconMap[rel.type] || 'lucide--arrow-right',
      color: relationshipColorMap[rel.type] || 'neutral',
      description: rel.description,
    };
  }

  // Merge relationship UI configs into main uiConfigs
  // Store under '__relationships__' key to differentiate from object type configs
  uiConfigs['__relationships__'] = relationshipUIConfigs;

  const existing = await client.query(
    'SELECT id FROM kb.graph_template_packs WHERE id = $1',
    [BIBLE_TEMPLATE_PACK_ID]
  );

  if (existing.rowCount) {
    await client.query(
      `UPDATE kb.graph_template_packs
             SET name = $1,
                 version = $2,
                 description = $3,
                 author = $4,
                 object_type_schemas = $5::jsonb,
                 relationship_type_schemas = $6::jsonb,
                 ui_configs = $7::jsonb,
                 extraction_prompts = $8::jsonb,
                 updated_at = now(),
                 deprecated_at = NULL
             WHERE id = $9`,
      [
        templatePackName,
        templatePackVersion,
        'Bible Knowledge Graph v2.0 - Enhanced template pack with canonical_id-based entity references for reliable linking. Includes Person, Place, Event, Book, Quote, Group, Object, Covenant, Prophecy, Miracle, and Angel entities. Schema version tracking enabled.',
        'Spec Server Seed Script',
        JSON.stringify(objectTypeSchemas),
        JSON.stringify(relationshipTypeSchemas),
        JSON.stringify(uiConfigs),
        JSON.stringify(extractionPrompts),
        BIBLE_TEMPLATE_PACK_ID,
      ]
    );
    console.log('✓ Updated existing Bible template pack');
  } else {
    await client.query(
      `INSERT INTO kb.graph_template_packs (
                id, name, version, description, author,
                object_type_schemas, relationship_type_schemas,
                ui_configs, extraction_prompts, published_at, source
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, now(), $10)`,
      [
        BIBLE_TEMPLATE_PACK_ID,
        templatePackName,
        templatePackVersion,
        'Bible Knowledge Graph v2.0 - Enhanced template pack with canonical_id-based entity references for reliable linking. Includes Person, Place, Event, Book, Quote, Group, Object, Covenant, Prophecy, Miracle, and Angel entities. Schema version tracking enabled.',
        'Spec Server Seed Script',
        JSON.stringify(objectTypeSchemas),
        JSON.stringify(relationshipTypeSchemas),
        JSON.stringify(uiConfigs),
        JSON.stringify(extractionPrompts),
        'system', // Mark as built-in/system template pack
      ]
    );
    console.log('✓ Created Bible template pack');
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n=== Bible Template Pack Seed ===\n');

    await upsertBibleTemplatePack(client);

    console.log('\n✓ Bible template pack seed completed successfully\n');
    console.log('Template Pack ID:', BIBLE_TEMPLATE_PACK_ID);
    console.log('Name:', templatePackName);
    console.log('Version:', templatePackVersion);
    console.log('\nEntity Types:', entityTypes.map((t) => t.type).join(', '));
    console.log(
      'Relationship Types:',
      relationshipTypes.map((r) => r.type).join(', ')
    );
    console.log(
      '\nNext Steps:\n- Use this template pack when configuring extraction jobs via the interface\n- Upload Bible documents with: npm run seed:bible -- --project-id=<uuid>\n'
    );
  } catch (err) {
    console.error('Error seeding Bible template pack:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
