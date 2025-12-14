/**
 * Normalize Bible entities from text-format extraction to our target schema
 * Maps the model's invented categories to our defined entity types
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, '../../bible-entities-partial.json');
const OUTPUT_FILE = path.join(
  __dirname,
  '../../bible-entities-normalized.json'
);

// Our target entity types from the schema
type EntityType =
  | 'Person'
  | 'Place'
  | 'Event'
  | 'Group'
  | 'Quote'
  | 'Object'
  | 'Covenant'
  | 'Prophecy'
  | 'Miracle'
  | 'Angel'
  | 'Deity';

interface RawEntity {
  type: string;
  name: string;
}

interface NormalizedEntity {
  type: EntityType;
  name: string;
  originalType: string;
  confidence: 'high' | 'medium' | 'low';
}

// Mapping from model's categories to our schema types
const TYPE_MAPPINGS: Record<string, EntityType> = {
  'Deities/Divine Beings:': 'Deity',
  'People/Groups:': 'Person', // Will further classify groups
  'Places/Geographical Features:': 'Place',
  'Objects/Concepts:': 'Object',
};

// Known groups (tribes, nations, peoples) - should be type 'Group'
const KNOWN_GROUPS = new Set([
  'Amalekites',
  'Ammonites',
  'Amorites',
  'Assyrians',
  'Babylonians',
  'Canaanites',
  'Chaldeans',
  'Edomites',
  'Egyptians',
  'Gibeonites',
  'Hittites',
  'Hivites',
  'Israelites',
  'Jebusites',
  'Levites',
  'Midianites',
  'Moabites',
  'Perizzites',
  'Philistines',
  'Samaritans',
  // Tribes
  'Tribe of Benjamin',
  'Tribe of Dan',
  'Tribe of Judah',
  'Tribe of Levi',
  // Other collective groups
  'Angels',
  'Apostles',
  'Disciples',
  'Pharisees',
  'Sadducees',
  'Scribes',
  'Prophets',
  'Priests',
  'Elders',
  'Sons of God',
  'Sons of Israel',
]);

// Known angels
const KNOWN_ANGELS = new Set([
  'Gabriel',
  'Michael',
  'Angel of the Lord',
  'Angel of God',
  'Cherubim',
  'Seraphim',
  'Angels of God',
]);

// Patterns that suggest a group rather than individual
const GROUP_PATTERNS = [
  /^tribe of/i,
  /^sons of/i,
  /^children of/i,
  /^house of/i,
  /^people of/i,
  /ites$/i, // Israelites, Moabites, etc.
  /ians$/i, // Assyrians, Babylonians, etc.
];

function classifyPerson(name: string): EntityType {
  // Check if it's a known angel
  if (KNOWN_ANGELS.has(name)) {
    return 'Angel';
  }

  // Check if it's a known group
  if (KNOWN_GROUPS.has(name)) {
    return 'Group';
  }

  // Check patterns
  for (const pattern of GROUP_PATTERNS) {
    if (pattern.test(name)) {
      return 'Group';
    }
  }

  return 'Person';
}

function normalizeEntity(raw: RawEntity): NormalizedEntity {
  const baseType = TYPE_MAPPINGS[raw.type] || 'Object';

  let finalType: EntityType = baseType;
  let confidence: 'high' | 'medium' | 'low' = 'high';

  // Further classify People/Groups
  if (raw.type === 'People/Groups:') {
    finalType = classifyPerson(raw.name);
    // Lower confidence for auto-classified groups
    if (finalType === 'Group' && !KNOWN_GROUPS.has(raw.name)) {
      confidence = 'medium';
    }
  }

  // Deities need validation
  if (raw.type === 'Deities/Divine Beings:') {
    // Some of these might be angels or prophets misclassified
    if (KNOWN_ANGELS.has(raw.name)) {
      finalType = 'Angel';
      confidence = 'high';
    } else if (['Elijah', 'Elisha', 'Moses', 'Samuel'].includes(raw.name)) {
      // Prophets misclassified as deities
      finalType = 'Person';
      confidence = 'high';
    }
  }

  return {
    type: finalType,
    name: raw.name,
    originalType: raw.type,
    confidence,
  };
}

async function main() {
  console.log('Loading raw entities...');
  const raw: RawEntity[] = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));

  console.log(`Processing ${raw.length} entities...`);
  const normalized = raw.map(normalizeEntity);

  // Group by type and count
  const byType = new Map<EntityType, NormalizedEntity[]>();
  for (const entity of normalized) {
    if (!byType.has(entity.type)) {
      byType.set(entity.type, []);
    }
    byType.get(entity.type)!.push(entity);
  }

  console.log('\n=== Entity Type Distribution ===');
  const sortedTypes = [...byType.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );
  for (const [type, entities] of sortedTypes) {
    console.log(`  ${type}: ${entities.length}`);
  }

  // Count by confidence
  const byConfidence = { high: 0, medium: 0, low: 0 };
  for (const entity of normalized) {
    byConfidence[entity.confidence]++;
  }
  console.log('\n=== Confidence Distribution ===');
  console.log(`  High: ${byConfidence.high}`);
  console.log(`  Medium: ${byConfidence.medium}`);
  console.log(`  Low: ${byConfidence.low}`);

  // Save normalized entities
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(normalized, null, 2));
  console.log(
    `\nSaved ${normalized.length} normalized entities to ${OUTPUT_FILE}`
  );

  // Show some examples of each type
  console.log('\n=== Sample Entities by Type ===');
  for (const [type, entities] of sortedTypes) {
    console.log(`\n${type}:`);
    const samples = entities.slice(0, 5);
    for (const s of samples) {
      console.log(
        `  - ${s.name}${
          s.confidence !== 'high' ? ` (${s.confidence} confidence)` : ''
        }`
      );
    }
    if (entities.length > 5) {
      console.log(`  ... and ${entities.length - 5} more`);
    }
  }
}

main().catch(console.error);
