#!/usr/bin/env ts-node
/**
 * Analyze relationship extraction: compare extracted vs expected
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { AppConfigModule } from '../common/config/config.module';
import { LangfuseModule } from '../modules/langfuse/langfuse.module';
import { LangGraphExtractionProvider } from '../modules/extraction-jobs/llm/langgraph-extraction.provider';
import { LangfuseService } from '../modules/langfuse/langfuse.service';
import { ExtractionPromptProvider } from '../modules/extraction-jobs/llm/langgraph/prompts/prompt-provider.service';
import { ExtractedRelationship } from '../modules/extraction-jobs/llm/llm-provider.interface';

// The test document (Ruth ch1 intro)
const documentText = `In the days when the judges ruled there was a famine in the land, and a man of Bethlehem in Judah went to sojourn in the country of Moab, he and his wife and his two sons. The name of the man was Elimelech and the name of his wife Naomi, and the names of his two sons were Mahlon and Chilion. They were Ephrathites from Bethlehem in Judah. They went into the country of Moab and remained there. But Elimelech, the husband of Naomi, died, and she was left with her two sons. These took Moabite wives; the name of the one was Orpah and the name of the other Ruth. They lived there about ten years, and both Mahlon and Chilion died, so that the woman was left without her two sons and her husband.`;

// Expected relationships (24 total)
const expectedRelationships = [
  { source: 'Elimelech', target: 'Naomi', type: 'MARRIED_TO' },
  { source: 'Elimelech', target: 'Mahlon', type: 'PARENT_OF' },
  { source: 'Elimelech', target: 'Chilion', type: 'PARENT_OF' },
  { source: 'Naomi', target: 'Mahlon', type: 'PARENT_OF' },
  { source: 'Naomi', target: 'Chilion', type: 'PARENT_OF' },
  { source: 'Mahlon', target: 'Ruth', type: 'MARRIED_TO' },
  { source: 'Chilion', target: 'Orpah', type: 'MARRIED_TO' },
  { source: 'Elimelech', target: 'Bethlehem', type: 'LIVED_IN' },
  { source: 'Naomi', target: 'Bethlehem', type: 'LIVED_IN' },
  { source: 'Bethlehem', target: 'Judah', type: 'LOCATED_IN' },
  { source: 'Elimelech', target: 'Moab', type: 'TRAVELS_TO' },
  { source: 'Naomi', target: 'Moab', type: 'TRAVELS_TO' },
  { source: 'Mahlon', target: 'Moab', type: 'TRAVELS_TO' },
  { source: 'Chilion', target: 'Moab', type: 'TRAVELS_TO' },
  { source: 'Elimelech', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Naomi', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Mahlon', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Chilion', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Ruth', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Orpah', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Elimelech', target: 'Ephrathites', type: 'MEMBER_OF' },
  { source: 'Naomi', target: 'Ephrathites', type: 'MEMBER_OF' },
  { source: 'Mahlon', target: 'Ephrathites', type: 'MEMBER_OF' },
  { source: 'Chilion', target: 'Ephrathites', type: 'MEMBER_OF' },
];

// Schemas with enhanced descriptions
const objectSchemas: Record<string, unknown> = {
  Person: {
    type: 'Person',
    description:
      'An individual human being mentioned by name or clear identifying reference.',
    extraction_guidelines: `EXTRACT when: A person is named explicitly (e.g., "Elimelech", "Ruth", "Boaz")
DO NOT extract: Generic references like "the people", "everyone", "a man" without a name`,
    typical_relationships: [
      'PARENT_OF - when this person is a parent (points to child)',
      'MARRIED_TO - spousal relationship (symmetric)',
      'LIVED_IN - places where this person resided',
      'MEMBER_OF - tribal, national, or clan membership',
      'TRAVELS_TO - journeys to specific places',
    ],
    schema: { type: 'object', properties: { name: { type: 'string' } } },
  },
  Place: {
    type: 'Place',
    description: 'A named geographic location - city, region, country.',
    extraction_guidelines: `EXTRACT when: A specific place is named (e.g., "Bethlehem", "Moab", "Judah")`,
    typical_relationships: [
      'LOCATED_IN - this place is within a larger region',
    ],
    schema: { type: 'object', properties: { name: { type: 'string' } } },
  },
  Group: {
    type: 'Group',
    description: 'A named collective of people - tribe, nation, family clan.',
    extraction_guidelines: `EXTRACT when: A group is named explicitly (e.g., "Ephrathites", "Moabites")`,
    typical_relationships: [
      'MEMBER_OF - persons who belong to this group (Person → Group)',
    ],
    schema: { type: 'object', properties: { name: { type: 'string' } } },
  },
};

const relationshipSchemas: Record<string, unknown> = {
  MARRIED_TO: {
    type: 'MARRIED_TO',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    description:
      'Spousal relationship. SYMMETRIC - only create ONE relationship per couple.',
    extraction_guidelines: `USE when text states marriage: "his wife Naomi", "Ruth married Boaz", "took Moabite wives"
SYMMETRIC: Only create one MARRIED_TO per couple.`,
    examples: [
      {
        source: 'Elimelech',
        target: 'Naomi',
        evidence: '"the name of his wife Naomi"',
      },
    ],
  },
  PARENT_OF: {
    type: 'PARENT_OF',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    description:
      'Parent-child relationship. Parent is source, child is target.',
    extraction_guidelines: `USE when text indicates parentage from parent's perspective: "his two sons", "father of"`,
    examples: [
      {
        source: 'Elimelech',
        target: 'Mahlon',
        evidence: '"his two sons were Mahlon and Chilion"',
      },
    ],
  },
  CHILD_OF: {
    type: 'CHILD_OF',
    fromTypes: ['Person'],
    toTypes: ['Person'],
    description:
      'Child-parent relationship. Child is source, parent is target.',
    extraction_guidelines: `USE when text indicates parentage from child's perspective: "son of", "daughter of"`,
    examples: [
      {
        source: 'Mahlon',
        target: 'Elimelech',
        evidence: '"Mahlon was the son of Elimelech"',
      },
    ],
  },
  LIVED_IN: {
    type: 'LIVED_IN',
    fromTypes: ['Person'],
    toTypes: ['Place'],
    description: 'Residence. Person → Place where they lived for a period.',
    extraction_guidelines: `USE when text states residence: "they lived there about ten years"
Origin implies past residence: "from Bethlehem" → LIVED_IN Bethlehem`,
    examples: [
      {
        source: 'Elimelech',
        target: 'Bethlehem',
        evidence: '"a man of Bethlehem in Judah"',
      },
    ],
  },
  TRAVELS_TO: {
    type: 'TRAVELS_TO',
    fromTypes: ['Person'],
    toTypes: ['Place'],
    description: 'Journey or movement to a place. Person → destination Place.',
    extraction_guidelines: `USE when text describes a journey: "went to sojourn in the country of Moab"`,
    examples: [
      {
        source: 'Elimelech',
        target: 'Moab',
        evidence: '"went to sojourn in the country of Moab"',
      },
    ],
  },
  MEMBER_OF: {
    type: 'MEMBER_OF',
    fromTypes: ['Person'],
    toTypes: ['Group'],
    description: 'Group membership. Person → Group they belong to.',
    extraction_guidelines: `USE when: "They were Ephrathites" → each person MEMBER_OF Ephrathites`,
    examples: [
      {
        source: 'Elimelech',
        target: 'Ephrathites',
        evidence: '"They were Ephrathites"',
      },
    ],
  },
  LOCATED_IN: {
    type: 'LOCATED_IN',
    fromTypes: ['Place'],
    toTypes: ['Place'],
    description:
      'Geographic containment. Smaller Place → larger containing Place.',
    extraction_guidelines: `USE when: "Bethlehem in Judah" → Bethlehem LOCATED_IN Judah`,
    examples: [
      {
        source: 'Bethlehem',
        target: 'Judah',
        evidence: '"Bethlehem in Judah"',
      },
    ],
  },
};

@Module({
  imports: [AppConfigModule, LangfuseModule],
  providers: [LangGraphExtractionProvider, ExtractionPromptProvider],
})
class AnalysisModule {}

interface FormattedRel {
  source: string;
  target: string;
  type: string;
  description?: string;
}

/**
 * Check if an extracted entity name matches an expected name.
 * Handles cases like "Country of Moab" matching "Moab" or "Bethlehem in Judah" matching "Bethlehem".
 */
function namesMatch(extracted: string, expected: string): boolean {
  const extractedLower = extracted.toLowerCase();
  const expectedLower = expected.toLowerCase();

  // Exact match
  if (extractedLower === expectedLower) return true;

  // Extracted contains expected (e.g., "Country of Moab" contains "Moab")
  if (extractedLower.includes(expectedLower)) return true;

  // Expected contains extracted (e.g., "Bethlehem" contained in "Bethlehem in Judah")
  if (expectedLower.includes(extractedLower)) return true;

  return false;
}

async function main() {
  Logger.overrideLogger(false); // Suppress NestJS logs

  console.log('='.repeat(80));
  console.log('Relationship Analysis: Extracted vs Expected');
  console.log('='.repeat(80));

  const app = await NestFactory.createApplicationContext(AnalysisModule, {
    logger: false,
  });
  const provider = app.get(LangGraphExtractionProvider);
  const langfuse = app.get(LangfuseService);

  // Create a Langfuse trace for this analysis run
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runId = `ruth-analysis-${timestamp}`;
  const traceId = langfuse.createJobTrace(
    runId,
    {
      name: 'Ruth Ch1 Relationship Analysis',
      documentLength: documentText.length,
      expectedRelationships: expectedRelationships.length,
    },
    undefined, // environment (use default)
    'cli-analysis' // traceType for filtering
  );
  console.log(`\nLangfuse trace: ${traceId || 'disabled'}\n`);

  // Use latest prompt version
  const promptLabel = 'latest';
  console.log(`Using prompt label: ${promptLabel}\n`);
  console.log('Running extraction...\n');

  const result = await provider.extractEntities(documentText, '', {
    objectSchemas,
    relationshipSchemas,
    allowedTypes: ['Person', 'Place', 'Group'],
    promptLabel,
    context: traceId
      ? {
          jobId: runId,
          projectId: 'analysis',
          traceId,
        }
      : undefined,
  });

  // Format extracted relationships
  const extractedRels: FormattedRel[] = result.relationships.map(
    (r: ExtractedRelationship) => ({
      source: r.source.name || r.source.id || 'unknown',
      target: r.target.name || r.target.id || 'unknown',
      type: r.relationship_type,
      description: r.description,
    })
  );

  console.log('\n' + '='.repeat(80));
  console.log('ENTITIES EXTRACTED (' + result.entities.length + '):');
  console.log('='.repeat(80));
  for (const e of result.entities) {
    console.log(`  [${e.type_name}] ${e.name}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('EXTRACTED RELATIONSHIPS (' + extractedRels.length + '):');
  console.log('='.repeat(80));
  for (const r of extractedRels) {
    console.log(`  ${r.source} --[${r.type}]--> ${r.target}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('EXPECTED RELATIONSHIPS (' + expectedRelationships.length + '):');
  console.log('='.repeat(80));
  for (const r of expectedRelationships) {
    console.log(`  ${r.source} --[${r.type}]--> ${r.target}`);
  }

  // Find matches, false positives, false negatives
  const matched = new Set<string>();
  const matchedExtracted = new Set<number>();

  // Fuzzy matching using namesMatch function
  for (const exp of expectedRelationships) {
    const key = `${exp.source}--${exp.type}-->${exp.target}`;

    for (let i = 0; i < extractedRels.length; i++) {
      if (matchedExtracted.has(i)) continue;

      const ext = extractedRels[i];

      // Check if types match and names match (fuzzy)
      const typeMatch = ext.type === exp.type;
      const sourceMatch = namesMatch(ext.source, exp.source);
      const targetMatch = namesMatch(ext.target, exp.target);

      if (typeMatch && sourceMatch && targetMatch) {
        matched.add(key);
        matchedExtracted.add(i);
        break;
      }

      // For symmetric relationships (MARRIED_TO), also try swapped direction
      if (
        exp.type === 'MARRIED_TO' &&
        ext.type === 'MARRIED_TO' &&
        namesMatch(ext.source, exp.target) &&
        namesMatch(ext.target, exp.source)
      ) {
        matched.add(key);
        matchedExtracted.add(i);
        break;
      }

      // Check inverse (CHILD_OF vs PARENT_OF) - though normalization should handle this now
      if (ext.type === 'CHILD_OF' && exp.type === 'PARENT_OF') {
        if (
          namesMatch(ext.target, exp.source) &&
          namesMatch(ext.source, exp.target)
        ) {
          matched.add(key);
          matchedExtracted.add(i);
          break;
        }
      }
    }
  }

  const precision =
    extractedRels.length > 0 ? matched.size / extractedRels.length : 0;
  const recall =
    expectedRelationships.length > 0
      ? matched.size / expectedRelationships.length
      : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  console.log('\n' + '='.repeat(80));
  console.log('ANALYSIS:');
  console.log('='.repeat(80));
  console.log(`\nExpected: ${expectedRelationships.length}`);
  console.log(`Extracted: ${extractedRels.length}`);
  console.log(`Matched: ${matched.size}`);
  console.log(
    `Precision: ${(precision * 100).toFixed(1)}% (${matched.size}/${
      extractedRels.length
    })`
  );
  console.log(
    `Recall: ${(recall * 100).toFixed(1)}% (${matched.size}/${
      expectedRelationships.length
    })`
  );
  console.log(`F1: ${(f1 * 100).toFixed(1)}%`);

  console.log('\n' + '-'.repeat(80));
  console.log('FALSE NEGATIVES (Expected but NOT extracted):');
  console.log('-'.repeat(80));
  let fnCount = 0;
  for (const exp of expectedRelationships) {
    const key = `${exp.source}--${exp.type}-->${exp.target}`;
    if (!matched.has(key)) {
      console.log(`  MISSING: ${exp.source} --[${exp.type}]--> ${exp.target}`);
      fnCount++;
    }
  }
  if (fnCount === 0) console.log('  (none)');

  console.log('\n' + '-'.repeat(80));
  console.log('FALSE POSITIVES (Extracted but NOT expected):');
  console.log('-'.repeat(80));
  let fpCount = 0;
  for (let i = 0; i < extractedRels.length; i++) {
    if (!matchedExtracted.has(i)) {
      const r = extractedRels[i];
      console.log(`  EXTRA: ${r.source} --[${r.type}]--> ${r.target}`);
      fpCount++;
    }
  }
  if (fpCount === 0) console.log('  (none)');

  // Group false positives by type
  console.log('\n' + '-'.repeat(80));
  console.log('FALSE POSITIVE BREAKDOWN BY TYPE:');
  console.log('-'.repeat(80));
  const fpByType: Record<string, number> = {};
  for (let i = 0; i < extractedRels.length; i++) {
    if (!matchedExtracted.has(i)) {
      const r = extractedRels[i];
      fpByType[r.type] = (fpByType[r.type] || 0) + 1;
    }
  }
  for (const [type, count] of Object.entries(fpByType).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${type}: ${count}`);
  }

  // Report scores to Langfuse
  if (traceId) {
    console.log('\n' + '-'.repeat(80));
    console.log('REPORTING SCORES TO LANGFUSE...');
    console.log('-'.repeat(80));

    // Calculate entity metrics
    const expectedEntityNames = new Set([
      'Elimelech',
      'Naomi',
      'Mahlon',
      'Chilion',
      'Ruth',
      'Orpah',
      'Bethlehem',
      'Judah',
      'Moab',
      'Ephrathites',
      'Moabites',
    ]);
    const extractedEntityNames = new Set(
      result.entities.map((e: { name: string }) => e.name)
    );
    const entityMatched = [...expectedEntityNames].filter((name) =>
      extractedEntityNames.has(name)
    ).length;
    const entityPrecision =
      extractedEntityNames.size > 0
        ? entityMatched / extractedEntityNames.size
        : 0;
    const entityRecall =
      expectedEntityNames.size > 0
        ? entityMatched / expectedEntityNames.size
        : 0;
    const entityF1 =
      entityPrecision + entityRecall > 0
        ? (2 * entityPrecision * entityRecall) /
          (entityPrecision + entityRecall)
        : 0;

    langfuse.scoreTraceMultiple(traceId, [
      // Entity metrics
      {
        name: 'entity_precision',
        value: entityPrecision,
        comment: `${entityMatched}/${extractedEntityNames.size} entities correct`,
      },
      {
        name: 'entity_recall',
        value: entityRecall,
        comment: `${entityMatched}/${expectedEntityNames.size} entities found`,
      },
      {
        name: 'entity_f1',
        value: entityF1,
        comment: 'Entity extraction F1 score',
      },
      // Relationship metrics
      {
        name: 'relationship_precision',
        value: precision,
        comment: `${matched.size}/${extractedRels.length} relationships correct`,
      },
      {
        name: 'relationship_recall',
        value: recall,
        comment: `${matched.size}/${expectedRelationships.length} relationships found`,
      },
      {
        name: 'relationship_f1',
        value: f1,
        comment: 'Relationship extraction F1 score',
      },
    ]);

    console.log(
      `  Entity:       P=${(entityPrecision * 100).toFixed(1)}% R=${(
        entityRecall * 100
      ).toFixed(1)}% F1=${(entityF1 * 100).toFixed(1)}%`
    );
    console.log(
      `  Relationship: P=${(precision * 100).toFixed(1)}% R=${(
        recall * 100
      ).toFixed(1)}% F1=${(f1 * 100).toFixed(1)}%`
    );
    console.log('  Scores reported to Langfuse.');
  }

  await langfuse.shutdown();
  await app.close();
}

main().catch(console.error);
