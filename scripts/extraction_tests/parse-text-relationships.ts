#!/usr/bin/env npx tsx
/**
 * Parse text-format relationship extraction results from Vertex AI batch API
 * 
 * Since the batch API ignored our JSON schema and returned plain text,
 * this script parses the markdown-formatted relationship output.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTITIES_FILE = path.join(__dirname, '../../bible-entities-normalized.json');
const OUTPUT_FILE = path.join(__dirname, '../../bible-relationships-parsed.json');

interface Entity {
  type: string;
  name: string;
  originalType: string;
  confidence: string;
}

interface Relationship {
  source: string;
  target: string;
  type: string;
  sourceType?: string;
  targetType?: string;
  confidence: 'high' | 'medium' | 'low';
  rawLine?: string;
}

// Load entities to validate relationship endpoints
const entities: Entity[] = JSON.parse(fs.readFileSync(ENTITIES_FILE, 'utf-8'));
const entityNames = new Set(entities.map(e => e.name.toLowerCase()));
const entityMap = new Map(entities.map(e => [e.name.toLowerCase(), e]));

// Standard relationship type mappings
const RELATIONSHIP_TYPE_MAPPINGS: Record<string, string> = {
  'father of': 'PARENT_OF',
  'mother of': 'PARENT_OF',
  'parent of': 'PARENT_OF',
  'son of': 'CHILD_OF',
  'daughter of': 'CHILD_OF',
  'child of': 'CHILD_OF',
  'married to': 'MARRIED_TO',
  'wife of': 'MARRIED_TO',
  'husband of': 'MARRIED_TO',
  'brother of': 'SIBLING_OF',
  'sister of': 'SIBLING_OF',
  'sibling of': 'SIBLING_OF',
  'ancestor of': 'ANCESTOR_OF',
  'descendant of': 'DESCENDANT_OF',
  'born in': 'BORN_IN',
  'died in': 'DIED_IN',
  'lived in': 'LIVED_IN',
  'ruled': 'RULED',
  'ruled over': 'RULED',
  'traveled to': 'TRAVELED_TO',
  'traveled from': 'TRAVELED_FROM',
  'performed miracle at': 'PERFORMED_MIRACLE',
  'made covenant with': 'MADE_COVENANT',
  'prophesied to': 'PROPHESIED_TO',
  'taught': 'TAUGHT',
  'succeeded': 'SUCCEEDED',
  'preceded': 'PRECEDED',
  'killed': 'KILLED',
  'healed': 'HEALED',
  'baptized': 'BAPTIZED',
  'followed': 'FOLLOWED',
  'led': 'LED',
  'member of': 'MEMBER_OF',
  'leader of': 'LEADER_OF',
  'king of': 'RULED',
  'located in': 'LOCATED_IN',
  'near': 'NEAR',
  'part of': 'PART_OF',
};

// Common relationship patterns in text
const RELATIONSHIP_PATTERNS = [
  // "X is the father of Y"
  /^([^,]+)\s+is\s+the\s+(father|mother|son|daughter|brother|sister|wife|husband)\s+of\s+([^.]+)/i,
  // "X married Y"
  /^([^,]+)\s+(married|killed|healed|baptized|followed|led|ruled|taught)\s+([^.]+)/i,
  // "X traveled from Y to Z"
  /^([^,]+)\s+traveled\s+from\s+([^,]+)\s+to\s+([^.]+)/i,
  // "X was born in Y"
  /^([^,]+)\s+was\s+(born|buried|killed|healed)\s+in\s+([^.]+)/i,
  // "X, son of Y"
  /^([^,]+),\s+(son|daughter)\s+of\s+([^,]+)/i,
  // "X -> Y (TYPE)"
  /^([^-]+)\s*-+>\s*([^(]+)\s*\(([^)]+)\)/,
  // "X | TYPE | Y"
  /^([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)/,
];

function parseRelationshipLine(line: string): Relationship | null {
  line = line.trim();
  if (!line || line.startsWith('#') || line.startsWith('**')) {
    return null;
  }
  
  // Try each pattern
  for (const pattern of RELATIONSHIP_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      const [_, part1, part2, part3] = match;
      
      // Determine relationship structure based on pattern
      let source = part1.trim();
      let target = part3?.trim() || part2.trim();
      let relType = part2?.trim() || 'RELATED_TO';
      
      // Normalize relationship type
      const normalizedType = RELATIONSHIP_TYPE_MAPPINGS[relType.toLowerCase()] || 
                            relType.toUpperCase().replace(/\s+/g, '_');
      
      return {
        source,
        target,
        type: normalizedType,
        confidence: entityNames.has(source.toLowerCase()) && entityNames.has(target.toLowerCase()) ? 'high' : 'medium',
        rawLine: line,
      };
    }
  }
  
  return null;
}

function parseTextOutput(text: string): Relationship[] {
  const relationships: Relationship[] = [];
  const lines = text.split('\n');
  
  let currentSection = '';
  
  for (const line of lines) {
    // Track section headers
    if (line.startsWith('##') || line.startsWith('**')) {
      currentSection = line.replace(/[#*]/g, '').trim();
      continue;
    }
    
    // Skip list markers
    const cleanLine = line.replace(/^[\s*-•]+/, '').trim();
    if (!cleanLine) continue;
    
    const rel = parseRelationshipLine(cleanLine);
    if (rel) {
      relationships.push(rel);
    }
  }
  
  return relationships;
}

async function main() {
  const inputFile = process.argv[2];
  
  if (!inputFile) {
    console.log('Usage: npx tsx parse-text-relationships.ts <input-file>');
    console.log('\nThis script parses text-format relationship extraction results.');
    console.log('Input can be raw API response or extracted text content.');
    return;
  }
  
  console.log(`Loading ${inputFile}...`);
  const content = fs.readFileSync(inputFile, 'utf-8');
  
  console.log('Parsing relationships...');
  const relationships = parseTextOutput(content);
  
  console.log(`\nFound ${relationships.length} relationships`);
  
  // Group by type
  const byType = new Map<string, Relationship[]>();
  for (const rel of relationships) {
    if (!byType.has(rel.type)) {
      byType.set(rel.type, []);
    }
    byType.get(rel.type)!.push(rel);
  }
  
  console.log('\n=== Relationship Type Distribution ===');
  const sortedTypes = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [type, rels] of sortedTypes.slice(0, 15)) {
    console.log(`  ${type}: ${rels.length}`);
  }
  
  // Count by confidence
  const highConf = relationships.filter(r => r.confidence === 'high').length;
  const medConf = relationships.filter(r => r.confidence === 'medium').length;
  console.log('\n=== Confidence Distribution ===');
  console.log(`  High (both endpoints found): ${highConf}`);
  console.log(`  Medium (partial match): ${medConf}`);
  
  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(relationships, null, 2));
  console.log(`\nSaved to ${OUTPUT_FILE}`);
  
  // Show samples
  console.log('\n=== Sample Relationships ===');
  for (const [type, rels] of sortedTypes.slice(0, 5)) {
    console.log(`\n${type}:`);
    for (const r of rels.slice(0, 3)) {
      console.log(`  ${r.source} -> ${r.target}`);
    }
  }
}

main().catch(console.error);
