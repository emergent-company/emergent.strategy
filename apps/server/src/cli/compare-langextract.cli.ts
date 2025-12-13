#!/usr/bin/env ts-node
/**
 * Compare LangExtract (Google's library) ENTITY and RELATIONSHIP extraction
 * results with our pipeline for the Ruth ch1 intro text. Reports scores to Langfuse.
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { extract, ExampleData, Extraction, FormatType } from 'langextract';
import { AppConfigModule } from '../common/config/config.module';
import { LangfuseModule } from '../modules/langfuse/langfuse.module';
import { LangfuseService } from '../modules/langfuse/langfuse.service';

// The test document (Ruth ch1 intro) - same as analyze-relationships.cli.ts
const documentText = `In the days when the judges ruled there was a famine in the land, and a man of Bethlehem in Judah went to sojourn in the country of Moab, he and his wife and his two sons. The name of the man was Elimelech and the name of his wife Naomi, and the names of his two sons were Mahlon and Chilion. They were Ephrathites from Bethlehem in Judah. They went into the country of Moab and remained there. But Elimelech, the husband of Naomi, died, and she was left with her two sons. These took Moabite wives; the name of the one was Orpah and the name of the other Ruth. They lived there about ten years, and both Mahlon and Chilion died, so that the woman was left without her two sons and her husband.`;

// Expected entities
const expectedEntities = [
  { name: 'Elimelech', type: 'Person' },
  { name: 'Naomi', type: 'Person' },
  { name: 'Mahlon', type: 'Person' },
  { name: 'Chilion', type: 'Person' },
  { name: 'Ruth', type: 'Person' },
  { name: 'Orpah', type: 'Person' },
  { name: 'Bethlehem', type: 'Place' },
  { name: 'Judah', type: 'Place' },
  { name: 'Moab', type: 'Place' },
  { name: 'Ephrathites', type: 'Group' },
  { name: 'Moabites', type: 'Group' },
];

// Expected relationships (from analyze-relationships.cli.ts)
const expectedRelationships = [
  // Marriage relationships
  { source: 'Elimelech', target: 'Naomi', type: 'MARRIED_TO' },
  { source: 'Naomi', target: 'Elimelech', type: 'MARRIED_TO' },
  { source: 'Mahlon', target: 'Ruth', type: 'MARRIED_TO' },
  { source: 'Ruth', target: 'Mahlon', type: 'MARRIED_TO' },
  { source: 'Chilion', target: 'Orpah', type: 'MARRIED_TO' },
  { source: 'Orpah', target: 'Chilion', type: 'MARRIED_TO' },
  // Parent-child relationships
  { source: 'Elimelech', target: 'Mahlon', type: 'PARENT_OF' },
  { source: 'Elimelech', target: 'Chilion', type: 'PARENT_OF' },
  { source: 'Naomi', target: 'Mahlon', type: 'PARENT_OF' },
  { source: 'Naomi', target: 'Chilion', type: 'PARENT_OF' },
  // Location relationships
  { source: 'Elimelech', target: 'Bethlehem', type: 'LIVED_IN' },
  { source: 'Naomi', target: 'Bethlehem', type: 'LIVED_IN' },
  { source: 'Mahlon', target: 'Bethlehem', type: 'LIVED_IN' },
  { source: 'Chilion', target: 'Bethlehem', type: 'LIVED_IN' },
  { source: 'Elimelech', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Naomi', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Mahlon', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Chilion', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Ruth', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Orpah', target: 'Moab', type: 'LIVED_IN' },
  { source: 'Bethlehem', target: 'Judah', type: 'LOCATED_IN' },
  // Group membership
  { source: 'Elimelech', target: 'Ephrathites', type: 'MEMBER_OF' },
  { source: 'Naomi', target: 'Ephrathites', type: 'MEMBER_OF' },
  { source: 'Ruth', target: 'Moabites', type: 'MEMBER_OF' },
  { source: 'Orpah', target: 'Moabites', type: 'MEMBER_OF' },
];

// Few-shot examples for LangExtract - simple entity extraction
const examples: ExampleData[] = [
  {
    text: 'Abraham lived in Canaan with his wife Sarah. They were Hebrews from the land of Ur.',
    extractions: [
      {
        extractionClass: 'person',
        extractionText: 'Abraham',
      },
      {
        extractionClass: 'person',
        extractionText: 'Sarah',
      },
      {
        extractionClass: 'place',
        extractionText: 'Canaan',
      },
      {
        extractionClass: 'place',
        extractionText: 'Ur',
      },
      {
        extractionClass: 'group',
        extractionText: 'Hebrews',
      },
    ],
  },
];

// Prompt description for entity extraction
const entityPromptDescription = `Extract named entities from the biblical text. Extract:
- person: Named individuals (e.g., "Abraham", "Sarah", "Moses")
- place: Named locations (e.g., "Bethlehem", "Canaan", "Moab")
- group: Named groups, tribes, or peoples (e.g., "Hebrews", "Ephrathites", "Moabites")

Use exact text from the document for each extraction.`;

// Few-shot examples for relationship extraction
const relationshipExamples: ExampleData[] = [
  {
    text: 'Abraham lived in Canaan with his wife Sarah. They were Hebrews from the land of Ur.',
    extractions: [
      {
        extractionClass: 'married_to',
        extractionText: 'Abraham -> Sarah',
      },
      {
        extractionClass: 'married_to',
        extractionText: 'Sarah -> Abraham',
      },
      {
        extractionClass: 'lived_in',
        extractionText: 'Abraham -> Canaan',
      },
      {
        extractionClass: 'lived_in',
        extractionText: 'Sarah -> Canaan',
      },
      {
        extractionClass: 'member_of',
        extractionText: 'Abraham -> Hebrews',
      },
      {
        extractionClass: 'member_of',
        extractionText: 'Sarah -> Hebrews',
      },
    ],
  },
  {
    text: 'Isaac was the son of Abraham and Rebecca was his wife.',
    extractions: [
      {
        extractionClass: 'parent_of',
        extractionText: 'Abraham -> Isaac',
      },
      {
        extractionClass: 'married_to',
        extractionText: 'Isaac -> Rebecca',
      },
      {
        extractionClass: 'married_to',
        extractionText: 'Rebecca -> Isaac',
      },
    ],
  },
];

// Prompt description for relationship extraction
const relationshipPromptDescription = `Extract relationships between entities from the biblical text. Extract:
- married_to: Marriage relationship (format: "Person1 -> Person2")
- parent_of: Parent-child relationship (format: "Parent -> Child")
- lived_in: Person lived in a place (format: "Person -> Place")
- member_of: Person is member of a group/tribe (format: "Person -> Group")
- located_in: Place is located in another place (format: "Place1 -> Place2")

Use exact names from the document. Format as "Source -> Target".`;

interface FormattedEntity {
  name: string;
  type: string;
}

interface FormattedRelationship {
  source: string;
  target: string;
  type: string;
}

@Module({
  imports: [AppConfigModule, LangfuseModule],
  providers: [],
})
class LangExtractComparisonModule {}

/**
 * Check if names match (fuzzy matching)
 */
function namesMatch(extracted: string, expected: string): boolean {
  const extractedLower = extracted.toLowerCase();
  const expectedLower = expected.toLowerCase();

  if (extractedLower === expectedLower) return true;
  if (extractedLower.includes(expectedLower)) return true;
  if (expectedLower.includes(extractedLower)) return true;

  return false;
}

/**
 * Parse LangExtract extractions into our entity format
 */
function parseExtractions(extractions: Extraction[]): FormattedEntity[] {
  const entities: FormattedEntity[] = [];

  for (const ext of extractions) {
    const type =
      ext.extractionClass.charAt(0).toUpperCase() +
      ext.extractionClass.slice(1);
    entities.push({
      name: ext.extractionText,
      type,
    });
  }

  return entities;
}

/**
 * Parse LangExtract relationship extractions
 */
function parseRelationshipExtractions(
  extractions: Extraction[]
): FormattedRelationship[] {
  const relationships: FormattedRelationship[] = [];

  for (const ext of extractions) {
    const type = ext.extractionClass.toUpperCase();
    // Parse "Source -> Target" format
    const parts = ext.extractionText.split('->').map((s: string) => s.trim());
    if (parts.length === 2) {
      relationships.push({
        source: parts[0],
        target: parts[1],
        type,
      });
    }
  }

  return relationships;
}

async function main() {
  Logger.overrideLogger(false); // Suppress NestJS logs

  console.log('='.repeat(80));
  console.log('LangExtract Comparison: ENTITY Extraction');
  console.log('='.repeat(80));

  // Initialize NestJS app for Langfuse
  const app = await NestFactory.createApplicationContext(
    LangExtractComparisonModule,
    { logger: false }
  );
  const langfuse = app.get(LangfuseService);

  // Create a Langfuse trace for this analysis run
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runId = `langextract-ruth-${timestamp}`;
  const traceId = langfuse.createJobTrace(
    runId,
    {
      name: 'LangExtract Ruth Ch1 Entity Extraction',
      library: 'langextract',
      model: 'gemini-2.5-flash',
      documentLength: documentText.length,
      expectedEntities: expectedEntities.length,
    },
    undefined, // environment (use default)
    'cli-benchmark' // traceType for filtering
  );
  console.log(`\nLangfuse trace: ${traceId || 'disabled'}\n`);

  // Check for API key
  const apiKey =
    process.env.LANGEXTRACT_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log('\nERROR: No API key found.');
    console.log('Please set GOOGLE_AI_API_KEY environment variable.\n');
    await app.close();
    process.exit(1);
  }

  console.log(`Using API key (${apiKey.slice(0, 12)}...)\n`);
  console.log('Running LangExtract entity extraction...\n');

  const startTime = Date.now();

  try {
    const rawResult = await extract(documentText, {
      promptDescription: entityPromptDescription,
      examples,
      modelType: 'gemini',
      modelId: 'gemini-2.5-flash',
      apiKey,
      formatType: FormatType.YAML,
      fenceOutput: true,
      debug: false,
    });

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    console.log(`Extraction completed in ${(durationMs / 1000).toFixed(2)}s\n`);

    // Handle both single document and array results
    const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
    const extractions = result?.extractions || [];

    // Parse the extractions
    const extractedEntities = parseExtractions(extractions);

    console.log('='.repeat(80));
    console.log(
      'LANGEXTRACT EXTRACTED ENTITIES (' + extractedEntities.length + '):'
    );
    console.log('='.repeat(80));
    for (const e of extractedEntities) {
      console.log(`  [${e.type}] ${e.name}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('EXPECTED ENTITIES (' + expectedEntities.length + '):');
    console.log('='.repeat(80));
    for (const e of expectedEntities) {
      console.log(`  [${e.type}] ${e.name}`);
    }

    // Calculate metrics
    const matched = new Set<string>();
    const matchedExtracted = new Set<number>();

    for (const exp of expectedEntities) {
      const key = `${exp.type}:${exp.name}`;

      for (let i = 0; i < extractedEntities.length; i++) {
        if (matchedExtracted.has(i)) continue;

        const ext = extractedEntities[i];
        const typeMatch = ext.type.toLowerCase() === exp.type.toLowerCase();
        const nameMatch = namesMatch(ext.name, exp.name);

        if (typeMatch && nameMatch) {
          matched.add(key);
          matchedExtracted.add(i);
          break;
        }
      }
    }

    const precision =
      extractedEntities.length > 0
        ? matched.size / extractedEntities.length
        : 0;
    const recall =
      expectedEntities.length > 0 ? matched.size / expectedEntities.length : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    console.log('\n' + '='.repeat(80));
    console.log('LANGEXTRACT ENTITY RESULTS:');
    console.log('='.repeat(80));
    console.log(`\nExpected: ${expectedEntities.length}`);
    console.log(`Extracted: ${extractedEntities.length}`);
    console.log(`Matched: ${matched.size}`);
    console.log(
      `Precision: ${(precision * 100).toFixed(1)}% (${matched.size}/${
        extractedEntities.length
      })`
    );
    console.log(
      `Recall: ${(recall * 100).toFixed(1)}% (${matched.size}/${
        expectedEntities.length
      })`
    );
    console.log(`F1: ${(f1 * 100).toFixed(1)}%`);

    console.log('\n' + '-'.repeat(80));
    console.log('FALSE NEGATIVES (Expected but NOT extracted):');
    console.log('-'.repeat(80));
    let fnCount = 0;
    for (const exp of expectedEntities) {
      const key = `${exp.type}:${exp.name}`;
      if (!matched.has(key)) {
        console.log(`  MISSING: [${exp.type}] ${exp.name}`);
        fnCount++;
      }
    }
    if (fnCount === 0) console.log('  (none)');

    console.log('\n' + '-'.repeat(80));
    console.log('FALSE POSITIVES (Extracted but NOT expected):');
    console.log('-'.repeat(80));
    let fpCount = 0;
    for (let i = 0; i < extractedEntities.length; i++) {
      if (!matchedExtracted.has(i)) {
        const e = extractedEntities[i];
        console.log(`  EXTRA: [${e.type}] ${e.name}`);
        fpCount++;
      }
    }
    if (fpCount === 0) console.log('  (none)');

    // Report scores to Langfuse
    if (traceId) {
      console.log('\n' + '-'.repeat(80));
      console.log('REPORTING SCORES TO LANGFUSE...');
      console.log('-'.repeat(80));

      langfuse.scoreTraceMultiple(traceId, [
        {
          name: 'entity_precision',
          value: precision,
          comment: `${matched.size}/${extractedEntities.length} entities correct`,
        },
        {
          name: 'entity_recall',
          value: recall,
          comment: `${matched.size}/${expectedEntities.length} entities found`,
        },
        {
          name: 'entity_f1',
          value: f1,
          comment: 'LangExtract entity extraction F1 score',
        },
        {
          name: 'latency_ms',
          value: durationMs,
          comment: 'Extraction duration in milliseconds',
        },
      ]);

      console.log(
        `  Entity: P=${(precision * 100).toFixed(1)}% R=${(
          recall * 100
        ).toFixed(1)}% F1=${(f1 * 100).toFixed(1)}%`
      );
      console.log(`  Latency: ${durationMs}ms`);
      console.log('  Entity scores reported to Langfuse.');
    }

    // ==========================================
    // RELATIONSHIP EXTRACTION
    // ==========================================
    console.log('\n\n' + '='.repeat(80));
    console.log('LangExtract Comparison: RELATIONSHIP Extraction');
    console.log('='.repeat(80));
    console.log('\nRunning LangExtract relationship extraction...\n');

    const relStartTime = Date.now();

    const relRawResult = await extract(documentText, {
      promptDescription: relationshipPromptDescription,
      examples: relationshipExamples,
      modelType: 'gemini',
      modelId: 'gemini-2.5-flash',
      apiKey,
      formatType: FormatType.YAML,
      fenceOutput: true,
      debug: false,
    });

    const relEndTime = Date.now();
    const relDurationMs = relEndTime - relStartTime;
    console.log(
      `Relationship extraction completed in ${(relDurationMs / 1000).toFixed(
        2
      )}s\n`
    );

    // Handle both single document and array results
    const relResult = Array.isArray(relRawResult)
      ? relRawResult[0]
      : relRawResult;
    const relExtractions = relResult?.extractions || [];

    // Parse the relationship extractions
    const extractedRelationships = parseRelationshipExtractions(relExtractions);

    console.log('='.repeat(80));
    console.log(
      'LANGEXTRACT EXTRACTED RELATIONSHIPS (' +
        extractedRelationships.length +
        '):'
    );
    console.log('='.repeat(80));
    for (const r of extractedRelationships) {
      console.log(`  [${r.type}] ${r.source} -> ${r.target}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(
      'EXPECTED RELATIONSHIPS (' + expectedRelationships.length + '):'
    );
    console.log('='.repeat(80));
    for (const r of expectedRelationships) {
      console.log(`  [${r.type}] ${r.source} -> ${r.target}`);
    }

    // Calculate relationship metrics
    const relMatched = new Set<string>();
    const relMatchedExtracted = new Set<number>();

    for (const exp of expectedRelationships) {
      const key = `${exp.type}:${exp.source}:${exp.target}`;

      for (let i = 0; i < extractedRelationships.length; i++) {
        if (relMatchedExtracted.has(i)) continue;

        const ext = extractedRelationships[i];
        const typeMatch = ext.type.toLowerCase() === exp.type.toLowerCase();
        const sourceMatch = namesMatch(ext.source, exp.source);
        const targetMatch = namesMatch(ext.target, exp.target);

        if (typeMatch && sourceMatch && targetMatch) {
          relMatched.add(key);
          relMatchedExtracted.add(i);
          break;
        }
      }
    }

    const relPrecision =
      extractedRelationships.length > 0
        ? relMatched.size / extractedRelationships.length
        : 0;
    const relRecall =
      expectedRelationships.length > 0
        ? relMatched.size / expectedRelationships.length
        : 0;
    const relF1 =
      relPrecision + relRecall > 0
        ? (2 * relPrecision * relRecall) / (relPrecision + relRecall)
        : 0;

    console.log('\n' + '='.repeat(80));
    console.log('LANGEXTRACT RELATIONSHIP RESULTS:');
    console.log('='.repeat(80));
    console.log(`\nExpected: ${expectedRelationships.length}`);
    console.log(`Extracted: ${extractedRelationships.length}`);
    console.log(`Matched: ${relMatched.size}`);
    console.log(
      `Precision: ${(relPrecision * 100).toFixed(1)}% (${relMatched.size}/${
        extractedRelationships.length
      })`
    );
    console.log(
      `Recall: ${(relRecall * 100).toFixed(1)}% (${relMatched.size}/${
        expectedRelationships.length
      })`
    );
    console.log(`F1: ${(relF1 * 100).toFixed(1)}%`);

    console.log('\n' + '-'.repeat(80));
    console.log('FALSE NEGATIVES (Expected but NOT extracted):');
    console.log('-'.repeat(80));
    let relFnCount = 0;
    for (const exp of expectedRelationships) {
      const key = `${exp.type}:${exp.source}:${exp.target}`;
      if (!relMatched.has(key)) {
        console.log(`  MISSING: [${exp.type}] ${exp.source} -> ${exp.target}`);
        relFnCount++;
      }
    }
    if (relFnCount === 0) console.log('  (none)');

    console.log('\n' + '-'.repeat(80));
    console.log('FALSE POSITIVES (Extracted but NOT expected):');
    console.log('-'.repeat(80));
    let relFpCount = 0;
    for (let i = 0; i < extractedRelationships.length; i++) {
      if (!relMatchedExtracted.has(i)) {
        const r = extractedRelationships[i];
        console.log(`  EXTRA: [${r.type}] ${r.source} -> ${r.target}`);
        relFpCount++;
      }
    }
    if (relFpCount === 0) console.log('  (none)');

    // Report relationship scores to Langfuse
    if (traceId) {
      console.log('\n' + '-'.repeat(80));
      console.log('REPORTING RELATIONSHIP SCORES TO LANGFUSE...');
      console.log('-'.repeat(80));

      langfuse.scoreTraceMultiple(traceId, [
        {
          name: 'relationship_precision',
          value: relPrecision,
          comment: `${relMatched.size}/${extractedRelationships.length} relationships correct`,
        },
        {
          name: 'relationship_recall',
          value: relRecall,
          comment: `${relMatched.size}/${expectedRelationships.length} relationships found`,
        },
        {
          name: 'relationship_f1',
          value: relF1,
          comment: 'LangExtract relationship extraction F1 score',
        },
        {
          name: 'relationship_latency_ms',
          value: relDurationMs,
          comment: 'Relationship extraction duration in milliseconds',
        },
      ]);

      console.log(
        `  Relationship: P=${(relPrecision * 100).toFixed(1)}% R=${(
          relRecall * 100
        ).toFixed(1)}% F1=${(relF1 * 100).toFixed(1)}%`
      );
      console.log(`  Latency: ${relDurationMs}ms`);
      console.log('  Relationship scores reported to Langfuse.');
    }

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log('\n\n' + '='.repeat(80));
    console.log('LANGEXTRACT SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nEntity Extraction:`);
    console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`  Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`  F1: ${(f1 * 100).toFixed(1)}%`);
    console.log(`  Latency: ${durationMs}ms`);
    console.log(`\nRelationship Extraction:`);
    console.log(`  Precision: ${(relPrecision * 100).toFixed(1)}%`);
    console.log(`  Recall: ${(relRecall * 100).toFixed(1)}%`);
    console.log(`  F1: ${(relF1 * 100).toFixed(1)}%`);
    console.log(`  Latency: ${relDurationMs}ms`);
    console.log(`\nTotal Latency: ${durationMs + relDurationMs}ms`);
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\nError running LangExtract:', error);
    await langfuse.shutdown();
    await app.close();
    process.exit(1);
  }

  await langfuse.shutdown();
  await app.close();
}

main().catch(console.error);
