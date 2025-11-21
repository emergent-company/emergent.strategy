#!/usr/bin/env tsx
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
const templatePackVersion = process.env.BIBLE_TEMPLATE_PACK_VERSION || '1.0.0';

const entityTypes = [
  {
    type: 'Person',
    description: 'Individual person mentioned in biblical text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Full name of the person' },
        role: {
          type: 'string',
          description:
            'Position, title, or role (e.g., prophet, king, apostle)',
        },
        tribe: {
          type: 'string',
          description: 'Israelite tribe affiliation',
        },
        birth_location: {
          type: 'string',
          description: 'Place of birth',
        },
        death_location: {
          type: 'string',
          description: 'Place of death',
        },
        occupation: {
          type: 'string',
          description:
            'Profession or occupation (e.g., shepherd, fisherman, tax collector)',
        },
      },
    },
    extraction: {
      system:
        'Extract all people mentioned in the biblical text with their roles, occupations, tribal affiliations, and associated locations.',
      user: 'Identify each person in the text. Return their name, role (e.g., prophet, king, apostle), occupation if mentioned, tribe if mentioned, and birth/death locations if provided.',
    },
  },
  {
    type: 'Place',
    description: 'Geographic location referenced in biblical text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Location name' },
        region: {
          type: 'string',
          description: 'Geographic region (e.g., Judea, Galilee, Asia Minor)',
        },
        country: {
          type: 'string',
          description: 'Modern or ancient country/kingdom',
        },
        alternate_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Other names for this location',
        },
      },
    },
    extraction: {
      system:
        'Extract all geographic locations mentioned in the text with their regional context.',
      user: 'Identify every location referenced. Return its name, region, country/kingdom, and any alternate names mentioned.',
    },
  },
  {
    type: 'Event',
    description: 'Significant event or occurrence in biblical narrative',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Event name or description' },
        date_description: {
          type: 'string',
          description: 'Textual description of when it occurred',
        },
        location: {
          type: 'string',
          description: 'Where the event happened',
        },
        participants: {
          type: 'array',
          items: { type: 'string' },
          description: 'People involved in the event',
        },
      },
    },
    extraction: {
      system:
        'Extract significant events from the narrative including when, where, and who was involved.',
      user: 'Identify major events in the text. Return the event name, time description, location, and key participants.',
    },
  },
  {
    type: 'Book',
    description: 'Biblical book or writing referenced in the text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Book name' },
        testament: {
          type: 'string',
          enum: ['Old Testament', 'New Testament'],
          description: 'Testament classification',
        },
        category: {
          type: 'string',
          description:
            'Literary category (Law, History, Wisdom, Prophets, Gospels, Letters, Apocalyptic)',
        },
        author: {
          type: 'string',
          description: 'Traditional or attributed author',
        },
      },
    },
    extraction: {
      system:
        'Extract references to biblical books or writings mentioned in the text.',
      user: 'Identify any books referenced. Return the book name, testament, category, and author if mentioned.',
    },
  },
  {
    type: 'Quote',
    description: 'Notable quotation, prophecy, or saying from the text',
    schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'The quoted text' },
        speaker: {
          type: 'string',
          description: 'Who spoke or wrote this',
        },
        context: {
          type: 'string',
          description: 'Situational context of the quote',
        },
        book_reference: {
          type: 'string',
          description: 'Book and chapter reference (e.g., Genesis 1:1)',
        },
      },
    },
    extraction: {
      system:
        'Extract notable quotations, prophecies, commandments, or significant sayings from the text.',
      user: 'Identify important quotes or sayings. Return the text, speaker, context, and reference.',
    },
  },
  {
    type: 'Group',
    description: 'Organization, tribe, nation, or group of people',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Name of the group' },
        type: {
          type: 'string',
          description:
            'Type of group (e.g., religious sect, tribe, nation, military)',
        },
        region: {
          type: 'string',
          description: 'Geographic region associated with the group',
        },
        leader: {
          type: 'string',
          description: 'Leader or head of the group',
        },
        members_count: {
          type: 'string',
          description: 'Number of members if mentioned',
        },
      },
    },
    extraction: {
      system:
        'Extract groups, organizations, tribes, nations, or collectives mentioned in the text.',
      user: 'Identify groups of people. Return the group name, type (e.g., religious sect, tribe), region, leader if mentioned, and member count if provided.',
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
        location: {
          type: 'string',
          description: 'Where the object is located',
        },
        owner: {
          type: 'string',
          description: 'Who owns or possesses the object',
        },
      },
    },
    extraction: {
      system:
        'Extract significant objects, artifacts, structures, or physical items mentioned in the text.',
      user: 'Identify important objects or artifacts. Return the name, type (e.g., artifact, building), description, location, and owner if mentioned.',
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
        parties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Parties involved in the covenant',
        },
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
        'Extract covenants, agreements, or treaties mentioned in the text.',
      user: 'Identify covenants or agreements. Return the name, parties involved, terms, and any sign or symbol associated with it.',
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
        'Extract prophecies, predictions, or divinely inspired messages from the text.',
      user: 'Identify prophecies. Return the prophetic text, who delivered it, the subject, and any fulfillment reference.',
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
        performer: {
          type: 'string',
          description: 'Who performed the miracle',
        },
        witnesses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Who witnessed the miracle',
        },
        location: {
          type: 'string',
          description: 'Where the miracle occurred',
        },
      },
    },
    extraction: {
      system: 'Extract miracles and supernatural events from the text.',
      user: 'Identify miracles or supernatural events. Return the name, type (e.g., healing, nature), performer, witnesses, and location.',
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
      user: 'Identify angels or spiritual beings. Return the name or type, rank (e.g., archangel, cherubim), mission, and appearance details.',
    },
  },
];

const relationshipTypes = [
  {
    type: 'APPEARS_IN',
    description: 'Entity appears in a book',
    fromTypes: ['Person', 'Place', 'Event', 'Group', 'Object', 'Angel'],
    toTypes: ['Book'],
  },
  {
    type: 'LOCATED_IN',
    description: 'Geographic containment (place within place)',
    fromTypes: ['Place'],
    toTypes: ['Place'],
  },
  {
    type: 'PARENT_OF',
    description: 'Parental relationship',
    fromTypes: ['Person'],
    toTypes: ['Person'],
  },
  {
    type: 'CHILD_OF',
    description: 'Child relationship',
    fromTypes: ['Person'],
    toTypes: ['Person'],
  },
  {
    type: 'BORN_IN',
    description: 'Person born in location',
    fromTypes: ['Person'],
    toTypes: ['Place'],
  },
  {
    type: 'DIED_IN',
    description: 'Person died in location',
    fromTypes: ['Person'],
    toTypes: ['Place'],
  },
  {
    type: 'TRAVELS_TO',
    description: 'Person or group travels to location',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Place'],
  },
  {
    type: 'OCCURS_IN',
    description: 'Event or miracle occurs in location',
    fromTypes: ['Event', 'Miracle'],
    toTypes: ['Place'],
  },
  {
    type: 'PARTICIPATES_IN',
    description: 'Person, group, or angel participates in event',
    fromTypes: ['Person', 'Group', 'Angel'],
    toTypes: ['Event'],
  },
  {
    type: 'MEMBER_OF',
    description: 'Person is member of group',
    fromTypes: ['Person'],
    toTypes: ['Group'],
  },
  {
    type: 'LEADER_OF',
    description: 'Person leads group',
    fromTypes: ['Person'],
    toTypes: ['Group'],
  },
  {
    type: 'FULFILLS',
    description: 'Event or person fulfills prophecy',
    fromTypes: ['Event', 'Person'],
    toTypes: ['Prophecy'],
  },
  {
    type: 'MAKES_COVENANT',
    description: 'Person or group makes covenant',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Covenant'],
  },
  {
    type: 'PERFORMS_MIRACLE',
    description: 'Person or angel performs miracle',
    fromTypes: ['Person', 'Angel'],
    toTypes: ['Miracle'],
  },
  {
    type: 'WITNESSES',
    description: 'Person or group witnesses miracle or event',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Miracle', 'Event'],
  },
  {
    type: 'OWNS',
    description: 'Person or group owns object',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Object'],
  },
  {
    type: 'DESCENDED_FROM',
    description: 'Genealogical descent or lineage',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Person', 'Group'],
  },
  {
    type: 'PROPHESIED_BY',
    description: 'Prophecy delivered by person',
    fromTypes: ['Prophecy'],
    toTypes: ['Person'],
  },
  {
    type: 'SPEAKS',
    description: 'Person or angel speaks quote',
    fromTypes: ['Person', 'Angel'],
    toTypes: ['Quote'],
  },
];

async function upsertBibleTemplatePack(client: PoolClient): Promise<void> {
  const objectTypeSchemas: Record<string, unknown> = {};
  const extractionPrompts: Record<string, unknown> = {};
  const uiConfigs: Record<string, unknown> = {};

  for (const type of entityTypes) {
    objectTypeSchemas[type.type] = type.schema;
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

  const relationshipTypeSchemas: Record<string, unknown> = {};
  for (const rel of relationshipTypes) {
    relationshipTypeSchemas[rel.type] = {
      description: rel.description,
      fromTypes: rel.fromTypes,
      toTypes: rel.toTypes,
    };
  }

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
        'Bible-specific template pack with Person, Place, Event, Book, Quote, Group, Object, Covenant, Prophecy, Miracle, and Angel entities for comprehensive biblical text extraction.',
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
        'Bible-specific template pack with Person, Place, Event, Book, Quote, Group, Object, Covenant, Prophecy, Miracle, and Angel entities for comprehensive biblical text extraction.',
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
