#!/usr/bin/env tsx
/**
 * Seed Extraction Evaluation Dataset
 *
 * Creates a golden evaluation dataset in LangFuse for extraction quality assessment.
 * Uses carefully curated examples from the Bible with hand-annotated expected entities
 * and relationships.
 *
 * Usage:
 *   npx tsx scripts/seed-extraction-evaluation-dataset.ts
 *   npx tsx scripts/seed-extraction-evaluation-dataset.ts --dataset custom-name
 *   npx tsx scripts/seed-extraction-evaluation-dataset.ts --dry-run
 *
 * Prerequisites:
 *   - LangFuse configured (LANGFUSE_* environment variables)
 */

import { config } from 'dotenv';
import { Langfuse } from 'langfuse-node';
import { parseArgs } from 'util';
import type {
  ExtractionDatasetInput,
  ExtractionExpectedOutput,
  ExtractionDatasetMetadata,
} from '../apps/server/src/modules/extraction-jobs/evaluation/types';

// Load environment variables
config();

// =============================================================================
// Object Schemas (from Bible Template Pack) - Enhanced with rich descriptions
// =============================================================================

const objectSchemas = {
  Person: {
    type: 'Person',
    description:
      'An individual human being mentioned by name or clear identifying reference in the text.',

    extraction_guidelines: `EXTRACT when:
- A person is named explicitly (e.g., "Elimelech", "Ruth", "Boaz")
- A person is referenced by title + context that makes them uniquely identifiable (e.g., "the king of Moab" if only one king is discussed)

DO NOT extract:
- Generic references like "the people", "everyone", "a man" without a name (these may be Groups or not entities at all)
- Roles without a specific identifiable person (e.g., "a prophet" without naming who)
- Demonyms used as adjectives (e.g., in "Ruth the Moabite", extract Ruth as Person, but "Moabite" indicates MEMBER_OF relationship to Moabites group)

DISAMBIGUATION:
- If the same person has multiple names or titles, create ONE entity with aliases
- "Naomi's husband" and "Elimelech" are the SAME person - use one entity with the primary name
- Watch for pronouns referring to already-extracted people - don't create duplicates`,

    examples: [
      {
        temp_id: 'person_elimelech',
        name: 'Elimelech',
        type: 'Person',
        description:
          'A man from Bethlehem in Judah who moved his family to Moab during a famine. Husband of Naomi and father of Mahlon and Chilion.',
        properties: { role: 'head of household' },
        confidence: 0.95,
      },
      {
        temp_id: 'person_ruth',
        name: 'Ruth',
        type: 'Person',
        description:
          'A Moabite woman who married Mahlon. After his death, she remained loyal to her mother-in-law Naomi and later married Boaz.',
        properties: { role: 'daughter-in-law', occupation: 'gleaner' },
        confidence: 0.95,
      },
    ],

    typical_relationships: [
      'PARENT_OF - when this person is a parent (points to child)',
      'MARRIED_TO - spousal relationship (symmetric)',
      'LIVED_IN - places where this person resided',
      'BORN_IN / DIED_IN - birth and death locations',
      'MEMBER_OF - tribal, national, or clan membership',
      'TRAVELS_TO - journeys to specific places',
    ],

    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Full name of the person' },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Alternative names or titles',
        },
        role: {
          type: 'string',
          description: 'Position, title, or role (e.g., prophet, king, wife)',
        },
        occupation: { type: 'string', description: 'Profession or occupation' },
        tribe: {
          type: 'string',
          description: 'Israelite tribe name if applicable',
        },
        significance: {
          type: 'string',
          description: 'Biblical importance or notable characteristics',
        },
      },
    },
  },

  Place: {
    type: 'Place',
    description:
      'A named geographic location - city, region, country, or natural feature like a mountain or river.',

    extraction_guidelines: `EXTRACT when:
- A specific place is named (e.g., "Bethlehem", "Moab", "Judah", "Jerusalem")
- A geographic feature is named (e.g., "the Jordan River", "Mount Sinai")

DO NOT extract:
- Generic location references without names (e.g., "the field", "the city gate")
- Directions or relative locations (e.g., "to the east", "nearby")

HIERARCHY:
- Places can be LOCATED_IN other places (e.g., Bethlehem LOCATED_IN Judah)
- Extract both the specific place AND the containing region if both are mentioned
- Cities are typically LOCATED_IN regions/countries`,

    examples: [
      {
        temp_id: 'place_bethlehem',
        name: 'Bethlehem',
        type: 'Place',
        description:
          'A city in Judah, hometown of Elimelech and Naomi. Also known as Ephrath.',
        properties: { type: 'city', region: 'Judah' },
        confidence: 0.95,
      },
      {
        temp_id: 'place_moab',
        name: 'Moab',
        type: 'Place',
        description:
          'A country east of the Dead Sea where Elimelech took his family during the famine.',
        properties: { type: 'country' },
        confidence: 0.95,
      },
    ],

    typical_relationships: [
      'LOCATED_IN - this place is within a larger region (e.g., Bethlehem LOCATED_IN Judah)',
      'Persons connect via LIVED_IN, BORN_IN, DIED_IN, TRAVELS_TO',
    ],

    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Primary location name' },
        type: {
          type: 'string',
          enum: ['city', 'region', 'country', 'mountain', 'river', 'sea'],
        },
        region: { type: 'string', description: 'Parent region if known' },
        significance: { type: 'string', description: 'Biblical importance' },
      },
    },
  },

  Event: {
    type: 'Event',
    description:
      'A significant named event or occurrence in the narrative - something that happened at a specific time with identifiable participants.',

    extraction_guidelines: `EXTRACT when:
- A significant event is described with enough detail to be identifiable
- The event has clear participants and/or location
- Examples: "the famine", "the death of Elimelech", "Ruth's declaration of loyalty"

DO NOT extract:
- Ongoing states or conditions (extract the causing event instead)
- Minor actions that are part of normal narrative flow
- Events that are only hypothetical or planned but didn't happen

NAMING:
- Use descriptive names that capture what happened: "Death of Mahlon and Chilion", "Ruth's Gleaning"
- Include key participants or locations in the name when helpful`,

    examples: [
      {
        temp_id: 'event_famine_in_judah',
        name: 'Famine in Judah',
        type: 'Event',
        description:
          'A severe famine in the land of Judah that caused Elimelech to relocate his family to Moab.',
        properties: { type: 'judgment', location: 'Judah' },
        confidence: 0.9,
      },
      {
        temp_id: 'event_death_of_elimelech',
        name: 'Death of Elimelech',
        type: 'Event',
        description:
          'Elimelech died in Moab, leaving Naomi a widow with two sons.',
        properties: { type: 'death', location: 'Moab' },
        confidence: 0.95,
      },
    ],

    typical_relationships: [
      'PARTICIPATES_IN - persons or groups involved in this event',
      'Events can reference places via the location property',
    ],

    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Descriptive event name' },
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
            'other',
          ],
        },
        location: { type: 'string', description: 'Where it happened' },
        description: {
          type: 'string',
          description: 'Brief description of what occurred',
        },
      },
    },
  },

  Group: {
    type: 'Group',
    description:
      'A named collective of people - tribe, nation, family clan, religious sect, or other organized group with a shared identity.',

    extraction_guidelines: `EXTRACT when:
- A group is named explicitly (e.g., "Ephrathites", "Moabites", "Israelites")
- A family clan or house is referenced (e.g., "the house of Elimelech")
- A nation or people group is mentioned as an entity

DO NOT extract:
- Generic crowds ("the people in the city", "everyone")
- Temporary gatherings ("the reapers", "the elders at the gate" - unless they function as an ongoing body)
- Individual demonyms used as adjectives (in "Ruth the Moabite", Moabite describes Ruth's membership, extract "Moabites" as the Group)

KEY DISTINCTION from Person:
- A Group is a collective; a Person is an individual
- "The Moabites" = Group; "a Moabite woman named Ruth" = Person (Ruth) who is MEMBER_OF Group (Moabites)`,

    examples: [
      {
        temp_id: 'group_ephrathites',
        name: 'Ephrathites',
        type: 'Group',
        description:
          'A clan or family group from the Bethlehem/Ephrath area in Judah. Elimelech and his family belonged to this group.',
        properties: { type: 'family clan', region: 'Judah' },
        confidence: 0.9,
      },
      {
        temp_id: 'group_moabites',
        name: 'Moabites',
        type: 'Group',
        description:
          'The people of Moab, a nation east of the Dead Sea. Ruth and Orpah were Moabites.',
        properties: { type: 'nation', region: 'Moab' },
        confidence: 0.95,
      },
    ],

    typical_relationships: [
      'MEMBER_OF - persons who belong to this group (Person → Group)',
      'LOCATED_IN - geographic homeland of this group',
    ],

    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Name of the group' },
        type: {
          type: 'string',
          enum: [
            'tribe',
            'nation',
            'religious sect',
            'military',
            'family clan',
            'other',
          ],
        },
        region: {
          type: 'string',
          description: 'Geographic region or homeland',
        },
        description: {
          type: 'string',
          description: 'Brief description of the group',
        },
      },
    },
  },
};

const relationshipSchemas = {
  PARENT_OF: {
    type: 'PARENT_OF',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    label: 'Parent Of',
    description:
      'Biological or adoptive parent-child relationship. The source is the PARENT, target is the CHILD.',

    extraction_guidelines: `USE when:
- Text explicitly states parentage: "X, the father of Y", "X bore Y", "Y was born to X"
- Text implies parentage: "his sons Mahlon and Chilion" → parent PARENT_OF each son
- Genealogies: "A begat B" → A PARENT_OF B

DIRECTION: Always parent → child. Use PARENT_OF, not CHILD_OF.

BOTH PARENTS: Create separate relationships for each parent.
- "Elimelech and Naomi had two sons Mahlon and Chilion"
- Creates 4 relationships: Elimelech→Mahlon, Elimelech→Chilion, Naomi→Mahlon, Naomi→Chilion`,

    examples: [
      {
        source: 'Elimelech',
        target: 'Mahlon',
        evidence: '"his two sons were Mahlon and Chilion"',
      },
      {
        source: 'Naomi',
        target: 'Chilion',
        evidence: '"she was left with her two sons"',
      },
    ],
  },

  CHILD_OF: {
    type: 'CHILD_OF',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    label: 'Child Of',
    description:
      'Inverse of PARENT_OF. Source is the CHILD, target is the PARENT. Generally prefer PARENT_OF direction.',

    extraction_guidelines: `PREFER PARENT_OF over CHILD_OF in most cases.
Only use CHILD_OF when the text specifically emphasizes the child's perspective.

The deduplication system will remove CHILD_OF if PARENT_OF exists for the same pair.`,

    examples: [],
  },

  MARRIED_TO: {
    type: 'MARRIED_TO',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    label: 'Married To',
    description:
      'Spousal relationship. This is SYMMETRIC - only create ONE relationship per couple.',

    extraction_guidelines: `USE when:
- Text states marriage: "his wife Naomi", "Ruth married Boaz", "took Moabite wives"
- Text implies marriage: "husband of X", "wife of Y"

SYMMETRIC: Only create one MARRIED_TO per couple.
- Alphabetically first name should be source (handled by deduplication)
- "Elimelech and his wife Naomi" → Elimelech MARRIED_TO Naomi (one relationship, not two)

MULTIPLE MARRIAGES: Create separate relationships for each marriage.
- Boaz MARRIED_TO Ruth (second marriage after first wife)`,

    examples: [
      {
        source: 'Elimelech',
        target: 'Naomi',
        evidence:
          '"the name of the man was Elimelech and the name of his wife Naomi"',
      },
      {
        source: 'Mahlon',
        target: 'Ruth',
        evidence:
          '"These took Moabite wives; the name of the one was Orpah and the name of the other Ruth"',
      },
    ],
  },

  BORN_IN: {
    type: 'BORN_IN',
    fromTypes: ['Person'],
    toTypes: ['Place'],
    label: 'Born In',
    description: 'Place of birth. Person → Place where they were born.',

    extraction_guidelines: `USE when:
- Text explicitly states birthplace
- Context strongly implies birthplace (e.g., "native of Bethlehem")

DO NOT use when:
- Only residence is mentioned (use LIVED_IN instead)
- Person merely visited the place (use TRAVELS_TO)`,

    examples: [],
  },

  DIED_IN: {
    type: 'DIED_IN',
    fromTypes: ['Person'],
    toTypes: ['Place'],
    label: 'Died In',
    description: 'Place of death. Person → Place where they died.',

    extraction_guidelines: `USE when:
- Text states someone died in a specific place
- "Elimelech died" while the family was in Moab → Elimelech DIED_IN Moab`,

    examples: [
      {
        source: 'Elimelech',
        target: 'Moab',
        evidence: '"But Elimelech, the husband of Naomi, died" (while in Moab)',
      },
    ],
  },

  LIVED_IN: {
    type: 'LIVED_IN',
    fromTypes: ['Person'],
    toTypes: ['Place'],
    label: 'Lived In',
    description:
      'Residence or dwelling place. Person → Place where they lived for a period.',

    extraction_guidelines: `USE when:
- Text states residence: "they lived there about ten years"
- Text implies ongoing residence: "remained there", "settled in", "dwelt in"
- Origin implies past residence: "from Bethlehem" → LIVED_IN Bethlehem

MULTIPLE RESIDENCES: Create separate relationships for each place.
- Naomi LIVED_IN Bethlehem (before famine)
- Naomi LIVED_IN Moab (during sojourn)

DISTINGUISH from TRAVELS_TO:
- LIVED_IN = resided for a period
- TRAVELS_TO = journey/movement (can be temporary)`,

    examples: [
      {
        source: 'Elimelech',
        target: 'Bethlehem',
        evidence: '"a man of Bethlehem in Judah"',
      },
      {
        source: 'Ruth',
        target: 'Moab',
        evidence: '"They lived there about ten years"',
      },
    ],
  },

  TRAVELS_TO: {
    type: 'TRAVELS_TO',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Place'],
    label: 'Traveled To',
    description:
      'Journey or movement to a place. Person/Group → destination Place.',

    extraction_guidelines: `USE when:
- Text describes a journey: "went to", "came to", "returned to"
- Movement is emphasized: "set out for Moab"

TRAVELS_TO captures the journey itself, while LIVED_IN captures residence after arrival.
Both can apply: Naomi TRAVELS_TO Moab AND Naomi LIVED_IN Moab`,

    examples: [
      {
        source: 'Elimelech',
        target: 'Moab',
        evidence: '"went to sojourn in the country of Moab"',
      },
      {
        source: 'Naomi',
        target: 'Bethlehem',
        evidence: '"she started to return...to the land of Judah"',
      },
    ],
  },

  MEMBER_OF: {
    type: 'MEMBER_OF',
    fromTypes: ['Person'],
    toTypes: ['Group'],
    label: 'Member Of',
    description:
      'Group membership. Person → Group they belong to (tribe, nation, clan, sect).',

    extraction_guidelines: `USE when:
- Demonym adjectives: "Ruth the Moabite" → Ruth MEMBER_OF Moabites
- Explicit membership: "They were Ephrathites" → each person MEMBER_OF Ephrathites
- Tribal identity: "of the tribe of Judah" → person MEMBER_OF Tribe of Judah
- National identity: "a Moabite woman" → person MEMBER_OF Moabites

CREATE THE GROUP: If "Moabites" group doesn't exist, extract it as a Group entity.

DO NOT use for:
- Temporary associations (visiting a place)
- Employment (would need EMPLOYED_BY relationship type)`,

    examples: [
      {
        source: 'Elimelech',
        target: 'Ephrathites',
        evidence: '"They were Ephrathites from Bethlehem in Judah"',
      },
      {
        source: 'Ruth',
        target: 'Moabites',
        evidence: '"Ruth the Moabite"',
      },
    ],
  },

  PARTICIPATES_IN: {
    type: 'PARTICIPATES_IN',
    fromTypes: ['Person', 'Group'],
    toTypes: ['Event'],
    label: 'Participated In',
    description:
      'Involvement in an event. Person/Group → Event they participated in.',

    extraction_guidelines: `USE when:
- A person is directly involved in a named event
- A group collectively participates in something

Examples:
- Ruth PARTICIPATES_IN "Ruth's Declaration of Loyalty"
- The family PARTICIPATES_IN "Migration to Moab"`,

    examples: [],
  },

  LOCATED_IN: {
    type: 'LOCATED_IN',
    fromTypes: ['Place'],
    toTypes: ['Place'],
    label: 'Located In',
    description:
      'Geographic containment. Smaller Place → larger containing Place.',

    extraction_guidelines: `USE when:
- Text indicates geographic hierarchy: "Bethlehem in Judah" → Bethlehem LOCATED_IN Judah
- A city is within a region or country
- A feature is within a territory

DIRECTION: Smaller → Larger (contained → container)
- Bethlehem LOCATED_IN Judah (correct)
- Judah LOCATED_IN Bethlehem (wrong!)`,

    examples: [
      {
        source: 'Bethlehem',
        target: 'Judah',
        evidence: '"Bethlehem in Judah"',
      },
    ],
  },
};

// =============================================================================
// Golden Dataset Items
// =============================================================================

interface GoldenDatasetItem {
  id: string;
  input: ExtractionDatasetInput;
  expected_output: ExtractionExpectedOutput;
  metadata: ExtractionDatasetMetadata;
}

const goldenDatasetItems: GoldenDatasetItem[] = [
  // ---------------------------------------------------------------------------
  // Item 1: Ruth Chapter 1 - Introduction and Family
  // ---------------------------------------------------------------------------
  {
    id: 'ruth-ch1-intro',
    input: {
      document_text: `In the days when the judges ruled there was a famine in the land, and a man of Bethlehem in Judah went to sojourn in the country of Moab, he and his wife and his two sons. The name of the man was Elimelech and the name of his wife Naomi, and the names of his two sons were Mahlon and Chilion. They were Ephrathites from Bethlehem in Judah. They went into the country of Moab and remained there. But Elimelech, the husband of Naomi, died, and she was left with her two sons. These took Moabite wives; the name of the one was Orpah and the name of the other Ruth. They lived there about ten years, and both Mahlon and Chilion died, so that the woman was left without her two sons and her husband.`,
      object_schemas: objectSchemas,
      relationship_schemas: relationshipSchemas,
      allowed_types: ['Person', 'Place', 'Group', 'Event'],
    },
    expected_output: {
      entities: [
        {
          name: 'Elimelech',
          type: 'Person',
          description:
            'A man from Bethlehem in Judah who moved to Moab during a famine',
        },
        {
          name: 'Naomi',
          type: 'Person',
          description: "Elimelech's wife, widowed after his death",
        },
        {
          name: 'Mahlon',
          type: 'Person',
          description: 'Son of Elimelech and Naomi',
        },
        {
          name: 'Chilion',
          type: 'Person',
          description: 'Son of Elimelech and Naomi',
        },
        {
          name: 'Orpah',
          type: 'Person',
          description: 'Moabite wife of one of the sons',
        },
        {
          name: 'Ruth',
          type: 'Person',
          description: 'Moabite wife of one of the sons',
        },
        {
          name: 'Bethlehem',
          type: 'Place',
          description: 'City in Judah where Elimelech and his family were from',
        },
        {
          name: 'Judah',
          type: 'Place',
          description: 'Region in Israel where Bethlehem is located',
        },
        {
          name: 'Moab',
          type: 'Place',
          description: 'Country where the family moved to escape the famine',
        },
        {
          name: 'Ephrathites',
          type: 'Group',
          description: 'Clan from Bethlehem in Judah',
        },
      ],
      relationships: [
        // Core marriage: Elimelech and Naomi
        {
          source_name: 'Elimelech',
          target_name: 'Naomi',
          relationship_type: 'MARRIED_TO',
        },
        // Parent-child: Elimelech to sons
        {
          source_name: 'Elimelech',
          target_name: 'Mahlon',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Elimelech',
          target_name: 'Chilion',
          relationship_type: 'PARENT_OF',
        },
        // Parent-child: Naomi to sons
        {
          source_name: 'Naomi',
          target_name: 'Mahlon',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Naomi',
          target_name: 'Chilion',
          relationship_type: 'PARENT_OF',
        },
        // Marriages of sons to Moabite wives (text: "These took Moabite wives")
        {
          source_name: 'Mahlon',
          target_name: 'Ruth',
          relationship_type: 'MARRIED_TO',
        },
        {
          source_name: 'Chilion',
          target_name: 'Orpah',
          relationship_type: 'MARRIED_TO',
        },
        // Location: Family from Bethlehem
        {
          source_name: 'Elimelech',
          target_name: 'Bethlehem',
          relationship_type: 'LIVED_IN',
        },
        {
          source_name: 'Naomi',
          target_name: 'Bethlehem',
          relationship_type: 'LIVED_IN',
        },
        // Location: Bethlehem in Judah
        {
          source_name: 'Bethlehem',
          target_name: 'Judah',
          relationship_type: 'LOCATED_IN',
        },
        // Travel: Family went to Moab
        {
          source_name: 'Elimelech',
          target_name: 'Moab',
          relationship_type: 'TRAVELS_TO',
        },
        {
          source_name: 'Naomi',
          target_name: 'Moab',
          relationship_type: 'TRAVELS_TO',
        },
        {
          source_name: 'Mahlon',
          target_name: 'Moab',
          relationship_type: 'TRAVELS_TO',
        },
        {
          source_name: 'Chilion',
          target_name: 'Moab',
          relationship_type: 'TRAVELS_TO',
        },
        // Lived in Moab (text: "They lived there about ten years")
        {
          source_name: 'Elimelech',
          target_name: 'Moab',
          relationship_type: 'LIVED_IN',
        },
        {
          source_name: 'Naomi',
          target_name: 'Moab',
          relationship_type: 'LIVED_IN',
        },
        {
          source_name: 'Mahlon',
          target_name: 'Moab',
          relationship_type: 'LIVED_IN',
        },
        {
          source_name: 'Chilion',
          target_name: 'Moab',
          relationship_type: 'LIVED_IN',
        },
        {
          source_name: 'Ruth',
          target_name: 'Moab',
          relationship_type: 'LIVED_IN',
        },
        {
          source_name: 'Orpah',
          target_name: 'Moab',
          relationship_type: 'LIVED_IN',
        },
        // Clan membership (text: "They were Ephrathites")
        {
          source_name: 'Elimelech',
          target_name: 'Ephrathites',
          relationship_type: 'MEMBER_OF',
        },
        {
          source_name: 'Naomi',
          target_name: 'Ephrathites',
          relationship_type: 'MEMBER_OF',
        },
        {
          source_name: 'Mahlon',
          target_name: 'Ephrathites',
          relationship_type: 'MEMBER_OF',
        },
        {
          source_name: 'Chilion',
          target_name: 'Ephrathites',
          relationship_type: 'MEMBER_OF',
        },
      ],
    },
    metadata: {
      document_category: 'narrative',
      difficulty: 'medium',
      notes:
        'Introduction to Ruth - establishes main characters, family relationships, marriages, and locations',
      tags: ['ruth', 'chapter-1', 'family', 'migration'],
    },
  },

  // ---------------------------------------------------------------------------
  // Item 2: Ruth Chapter 2 - Boaz Introduction
  // ---------------------------------------------------------------------------
  {
    id: 'ruth-ch2-boaz',
    input: {
      document_text: `Now Naomi had a relative of her husband's, a worthy man of the clan of Elimelech, whose name was Boaz. And Ruth the Moabite said to Naomi, Let me go to the field and glean among the ears of grain after him in whose sight I shall find favor. And she said to her, Go, my daughter. So she set out and went and gleaned in the field after the reapers, and she happened to come to the part of the field belonging to Boaz, who was of the clan of Elimelech. And behold, Boaz came from Bethlehem. And he said to the reapers, The Lord be with you! And they answered, The Lord bless you.`,
      object_schemas: objectSchemas,
      relationship_schemas: relationshipSchemas,
      allowed_types: ['Person', 'Place', 'Group'],
    },
    expected_output: {
      entities: [
        {
          name: 'Naomi',
          type: 'Person',
          description: 'Mother-in-law of Ruth',
        },
        {
          name: 'Ruth',
          type: 'Person',
          description: 'A Moabite woman who gleans in the fields',
          properties: { occupation: 'gleaner' },
        },
        {
          name: 'Boaz',
          type: 'Person',
          description:
            'A worthy man, relative of Elimelech, owner of fields in Bethlehem',
        },
        {
          name: 'Elimelech',
          type: 'Person',
          description: 'Deceased relative of Boaz, former husband of Naomi',
        },
        {
          name: 'Bethlehem',
          type: 'Place',
          description: "City where Boaz's fields are located",
        },
        {
          name: 'Moabites',
          type: 'Group',
          description: 'People from Moab, Ruth is identified as one',
        },
      ],
      relationships: [
        // Ruth's identity as Moabite (text: "Ruth the Moabite")
        {
          source_name: 'Ruth',
          target_name: 'Moabites',
          relationship_type: 'MEMBER_OF',
        },
        // Boaz from Bethlehem (text: "Boaz came from Bethlehem")
        {
          source_name: 'Boaz',
          target_name: 'Bethlehem',
          relationship_type: 'LIVED_IN',
        },
        // Boaz is of clan of Elimelech (text: "of the clan of Elimelech")
        // Note: This implies Boaz is an Ephrathite, but we accept the Group entity
        // as "Moabites" for Ruth - could also add "Ephrathites" entity if needed
      ],
    },
    metadata: {
      document_category: 'narrative',
      difficulty: 'easy',
      notes:
        'Introduces Boaz and sets up the gleaning scene. Minimal relationships as text focuses on scene-setting.',
      tags: ['ruth', 'chapter-2', 'boaz', 'gleaning'],
    },
  },

  // ---------------------------------------------------------------------------
  // Item 3: Ruth Chapter 4 - Genealogy (More Complex)
  // ---------------------------------------------------------------------------
  {
    id: 'ruth-ch4-genealogy',
    input: {
      document_text: `So Boaz took Ruth, and she became his wife. And he went in to her, and the Lord gave her conception, and she bore a son. Then the women said to Naomi, Blessed be the Lord, who has not left you this day without a redeemer, and may his name be renowned in Israel! He shall be to you a restorer of life and a nourisher of your old age, for your daughter-in-law who loves you, who is more to you than seven sons, has given birth to him. Then Naomi took the child and laid him on her lap and became his nurse. And the women of the neighborhood gave him a name, saying, A son has been born to Naomi. They named him Obed. He was the father of Jesse, the father of David. Now these are the generations of Perez: Perez fathered Hezron, Hezron fathered Ram, Ram fathered Amminadab, Amminadab fathered Nahshon, Nahshon fathered Salmon, Salmon fathered Boaz, Boaz fathered Obed, Obed fathered Jesse, and Jesse fathered David.`,
      object_schemas: objectSchemas,
      relationship_schemas: relationshipSchemas,
      allowed_types: ['Person', 'Place', 'Event'],
    },
    expected_output: {
      entities: [
        { name: 'Boaz', type: 'Person', description: 'Husband of Ruth' },
        {
          name: 'Ruth',
          type: 'Person',
          description: 'Wife of Boaz, mother of Obed',
        },
        {
          name: 'Naomi',
          type: 'Person',
          description: 'Mother-in-law of Ruth, nurse of Obed',
        },
        {
          name: 'Obed',
          type: 'Person',
          description: 'Son of Boaz and Ruth, father of Jesse',
        },
        {
          name: 'Jesse',
          type: 'Person',
          description: 'Son of Obed, father of David',
        },
        { name: 'David', type: 'Person', description: 'Son of Jesse' },
        { name: 'Perez', type: 'Person', description: 'Ancestor of Boaz' },
        {
          name: 'Hezron',
          type: 'Person',
          description: 'Son of Perez, ancestor of Boaz',
        },
        {
          name: 'Ram',
          type: 'Person',
          description: 'Son of Hezron, ancestor of Boaz',
        },
        {
          name: 'Amminadab',
          type: 'Person',
          description: 'Son of Ram, ancestor of Boaz',
        },
        {
          name: 'Nahshon',
          type: 'Person',
          description: 'Son of Amminadab, ancestor of Boaz',
        },
        {
          name: 'Salmon',
          type: 'Person',
          description: 'Son of Nahshon, father of Boaz',
        },
      ],
      relationships: [
        {
          source_name: 'Boaz',
          target_name: 'Ruth',
          relationship_type: 'MARRIED_TO',
        },
        {
          source_name: 'Boaz',
          target_name: 'Obed',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Ruth',
          target_name: 'Obed',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Obed',
          target_name: 'Jesse',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Jesse',
          target_name: 'David',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Perez',
          target_name: 'Hezron',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Hezron',
          target_name: 'Ram',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Ram',
          target_name: 'Amminadab',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Amminadab',
          target_name: 'Nahshon',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Nahshon',
          target_name: 'Salmon',
          relationship_type: 'PARENT_OF',
        },
        {
          source_name: 'Salmon',
          target_name: 'Boaz',
          relationship_type: 'PARENT_OF',
        },
      ],
    },
    metadata: {
      document_category: 'narrative',
      difficulty: 'hard',
      notes:
        'Complex genealogy with many parent-child relationships - tests entity deduplication',
      tags: ['ruth', 'chapter-4', 'genealogy', 'david-lineage'],
    },
  },

  // ---------------------------------------------------------------------------
  // Item 4: Ruth's Declaration (Quote-heavy passage)
  // ---------------------------------------------------------------------------
  {
    id: 'ruth-ch1-declaration',
    input: {
      document_text: `But Naomi said, Turn back, my daughters; why will you go with me? Have I yet sons in my womb that they may become your husbands? Then they lifted up their voices and wept again. And Orpah kissed her mother-in-law, but Ruth clung to her. And she said, See, your sister-in-law has gone back to her people and to her gods; return after your sister-in-law. But Ruth said, Do not urge me to leave you or to return from following you. For where you go I will go, and where you lodge I will lodge. Your people shall be my people, and your God my God. Where you die I will die, and there will I be buried. May the Lord do so to me and more also if anything but death parts me from you. And when Naomi saw that she was determined to go with her, she said no more.`,
      object_schemas: objectSchemas,
      relationship_schemas: relationshipSchemas,
      allowed_types: ['Person', 'Place', 'Event'],
    },
    expected_output: {
      entities: [
        {
          name: 'Naomi',
          type: 'Person',
          description:
            'Mother-in-law urging her daughters-in-law to return home',
        },
        {
          name: 'Ruth',
          type: 'Person',
          description:
            'Daughter-in-law who pledges loyalty to Naomi and her God',
        },
        {
          name: 'Orpah',
          type: 'Person',
          description: 'Sister-in-law of Ruth who returned to her people',
        },
      ],
      relationships: [],
    },
    metadata: {
      document_category: 'narrative',
      difficulty: 'medium',
      notes:
        "Famous passage with Ruth's declaration - tests handling of dialogue-heavy text",
      tags: ['ruth', 'chapter-1', 'declaration', 'loyalty'],
    },
  },

  // ---------------------------------------------------------------------------
  // Item 5: Short passage with minimal entities
  // ---------------------------------------------------------------------------
  {
    id: 'ruth-ch1-return',
    input: {
      document_text: `So the two of them went on until they came to Bethlehem. And when they came to Bethlehem, the whole town was stirred because of them. And the women said, Is this Naomi? She said to them, Do not call me Naomi; call me Mara, for the Almighty has dealt very bitterly with me. I went away full, and the Lord has brought me back empty.`,
      object_schemas: objectSchemas,
      relationship_schemas: relationshipSchemas,
      allowed_types: ['Person', 'Place'],
    },
    expected_output: {
      entities: [
        {
          name: 'Naomi',
          type: 'Person',
          description:
            'Woman returning to Bethlehem, also called Mara (bitter)',
          properties: { aliases: ['Mara'] },
        },
        {
          name: 'Ruth',
          type: 'Person',
          description: 'Companion traveling with Naomi to Bethlehem',
        },
        {
          name: 'Bethlehem',
          type: 'Place',
          description: 'Town that Naomi returned to, stirred by her arrival',
        },
      ],
      relationships: [
        // Travel: Both Naomi and Ruth traveled (text: "So the two of them went on until they came to Bethlehem")
        {
          source_name: 'Naomi',
          target_name: 'Bethlehem',
          relationship_type: 'TRAVELS_TO',
        },
        {
          source_name: 'Ruth',
          target_name: 'Bethlehem',
          relationship_type: 'TRAVELS_TO',
        },
      ],
    },
    metadata: {
      document_category: 'narrative',
      difficulty: 'easy',
      notes: 'Simple passage with alias (Naomi/Mara)',
      tags: ['ruth', 'chapter-1', 'return', 'bethlehem'],
    },
  },
];

// =============================================================================
// CLI Implementation
// =============================================================================

interface CliArgs {
  dataset: string;
  description?: string;
  dryRun: boolean;
  help: boolean;
}

function printUsage(): void {
  console.log(`
Seed Extraction Evaluation Dataset

Creates a golden dataset in LangFuse for extraction quality assessment.

Usage:
  npx tsx scripts/seed-extraction-evaluation-dataset.ts [options]

Options:
  --dataset <name>       Dataset name in LangFuse (default: extraction-golden)
  --description <text>   Dataset description
  --dry-run              Preview items without creating dataset
  --help                 Show this help message

Examples:
  # Create default dataset
  npx tsx scripts/seed-extraction-evaluation-dataset.ts

  # Create with custom name
  npx tsx scripts/seed-extraction-evaluation-dataset.ts --dataset my-eval-set

  # Dry run to preview items
  npx tsx scripts/seed-extraction-evaluation-dataset.ts --dry-run
`);
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      dataset: { type: 'string', short: 'd', default: 'extraction-golden' },
      description: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  return {
    dataset: values.dataset as string,
    description: values.description as string | undefined,
    dryRun: values['dry-run'] as boolean,
    help: values.help as boolean,
  };
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logError(message: string): void {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  log('='.repeat(60));
  log('Seed Extraction Evaluation Dataset');
  log('='.repeat(60));
  log(`Dataset: ${args.dataset}`);
  log(`Items: ${goldenDatasetItems.length}`);
  log(`Dry Run: ${args.dryRun}`);
  log('='.repeat(60));

  // Preview items
  log('');
  log('Dataset Items:');
  log('-'.repeat(60));
  for (const item of goldenDatasetItems) {
    const entityCount = item.expected_output.entities.length;
    const relCount = item.expected_output.relationships.length;
    log(
      `  ${item.id.padEnd(25)} entities=${entityCount
        .toString()
        .padStart(2)}, ` +
        `relationships=${relCount.toString().padStart(2)}, ` +
        `difficulty=${item.metadata.difficulty}`
    );
  }
  log('');

  if (args.dryRun) {
    log('Dry run complete. No dataset created.');
    log('');
    log('Sample item structure:');
    log(JSON.stringify(goldenDatasetItems[0], null, 2));
    process.exit(0);
  }

  // Validate LangFuse configuration
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASE_URL;

  if (!secretKey || !publicKey) {
    logError('LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY are required');
    process.exit(1);
  }

  // Initialize LangFuse
  const langfuse = new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
  });

  try {
    // Create or get dataset
    log(`Creating/updating dataset "${args.dataset}"...`);

    const dataset = await langfuse.createDataset({
      name: args.dataset,
      description:
        args.description ||
        'Golden evaluation dataset for extraction quality assessment. Contains hand-annotated examples from the Book of Ruth.',
      metadata: {
        version: '1.0.0',
        source: 'seed-extraction-evaluation-dataset.ts',
        created_at: new Date().toISOString(),
        entity_types: Object.keys(objectSchemas),
        relationship_types: Object.keys(relationshipSchemas),
        document_source: 'Book of Ruth (ESV translation)',
      },
    });

    log(`Dataset created/updated: ${dataset.id}`);

    // Create dataset items
    let successCount = 0;
    let errorCount = 0;

    for (const item of goldenDatasetItems) {
      try {
        log(`  Creating item: ${item.id}`);
        await langfuse.createDatasetItem({
          datasetName: args.dataset,
          id: item.id,
          input: item.input,
          expectedOutput: item.expected_output,
          metadata: item.metadata,
        });
        successCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // Check if it's a duplicate ID error - that's expected on re-runs
        if (errorMessage.includes('already exists')) {
          log(`    (Item ${item.id} already exists, skipping)`);
          successCount++;
        } else {
          logError(`  Failed to create item ${item.id}: ${errorMessage}`);
          errorCount++;
        }
      }
    }

    // Flush to ensure all data is sent
    await langfuse.flushAsync();

    log('');
    log('='.repeat(60));
    log('SEEDING COMPLETE');
    log('='.repeat(60));
    log(`Successful: ${successCount}/${goldenDatasetItems.length}`);
    log(`Errors: ${errorCount}`);
    log('');
    log(`View in LangFuse: Datasets > ${args.dataset}`);
    log('='.repeat(60));

    await langfuse.shutdownAsync();
    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    logError(
      `Seeding failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    await langfuse.shutdownAsync();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
