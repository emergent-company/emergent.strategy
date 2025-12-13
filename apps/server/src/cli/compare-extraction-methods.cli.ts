#!/usr/bin/env ts-node
/**
 * Compare Entity Extraction Methods
 *
 * Tests three approaches on the same text:
 * 1. LangExtract (Google's library) - QA-style prompting with text span alignment
 * 2. Our JSON Mode - responseMimeType: 'application/json' with schema in prompt
 * 3. Structured Output - withStructuredOutput() using function calling
 *
 * Uses Genesis 4-5 which has ~30+ named entities for meaningful comparison.
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { z } from 'zod';
import { extract, ExampleData, Extraction } from 'langextract';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { AppConfigModule } from '../common/config/config.module';
import { LangfuseModule } from '../modules/langfuse/langfuse.module';
import { LangfuseService } from '../modules/langfuse/langfuse.service';
import {
  verifyEntities,
  AlignmentStatus,
} from '../modules/extraction-jobs/llm/langgraph/utils/text-span-verifier';
import * as fs from 'fs';
import * as path from 'path';

// Number of runs for statistical significance
const NUM_RUNS = 3;

// Read Genesis text (chapters 4-5 for good entity density)
const genesisPath = path.join(
  __dirname,
  '../../../../test-data/bible/books/01_Genesis.md'
);
const fullGenesis = fs.readFileSync(genesisPath, 'utf-8');

// Extract chapters 4-5 (lines between "## Chapter 4" and "## Chapter 6")
const chapter4Start = fullGenesis.indexOf('## Chapter 4');
const chapter6Start = fullGenesis.indexOf('## Chapter 6');
const documentText = fullGenesis.slice(chapter4Start, chapter6Start).trim();

// Ground truth entities from Genesis 4-5
// These are the named entities that should be extracted
// Note: Some names appear multiple times referring to DIFFERENT people (e.g., Enoch, Lamech)
// We count unique name+type combinations, not occurrences
const expectedEntities = [
  // Chapter 4 - Cain's line
  { name: 'Adam', type: 'Person' },
  { name: 'Eve', type: 'Person' },
  { name: 'Cain', type: 'Person' },
  { name: 'Abel', type: 'Person' },
  { name: 'Enoch', type: 'Person' }, // Appears twice: Cain's son (4:17) AND Jared's son (5:18) - different people!
  { name: 'Irad', type: 'Person' },
  { name: 'Mehujael', type: 'Person' },
  { name: 'Methushael', type: 'Person' },
  { name: 'Lamech', type: 'Person' }, // Appears twice: Cain's descendant (4:18) AND Methuselah's son (5:25) - different people!
  { name: 'Adah', type: 'Person' },
  { name: 'Zillah', type: 'Person' },
  { name: 'Jabal', type: 'Person' },
  { name: 'Jubal', type: 'Person' },
  { name: 'Tubal-cain', type: 'Person' },
  { name: 'Naamah', type: 'Person' },
  { name: 'Seth', type: 'Person' },
  { name: 'Enosh', type: 'Person' },
  // Chapter 5 - Seth's line (genealogy)
  { name: 'Kenan', type: 'Person' },
  { name: 'Mahalalel', type: 'Person' },
  { name: 'Jared', type: 'Person' },
  { name: 'Methuselah', type: 'Person' },
  { name: 'Noah', type: 'Person' },
  { name: 'Shem', type: 'Person' },
  { name: 'Ham', type: 'Person' },
  { name: 'Japheth', type: 'Person' },
  // Special: "Man" is used as a proper noun in 5:2 - "he blessed them and named them Man"
  { name: 'Man', type: 'Person' }, // or Group - God named humanity "Man"
  // Places
  { name: 'Eden', type: 'Place' },
  { name: 'Nod', type: 'Place' },
  { name: 'Enoch', type: 'Place' }, // The city Cain built, named after his son (4:17)
  // Divine entities
  { name: 'God', type: 'Person' }, // Could be "Deity" but keeping simple
  { name: 'Lord', type: 'Person' }, // Same entity, may be extracted separately
];

// Schema for structured output
const EntitySchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().describe('Name of the entity'),
      type: z.string().describe('Type: Person, Place, or Group'),
      description: z.string().optional().describe('Brief description'),
    })
  ),
});

type ExtractedEntity = {
  name: string;
  type: string;
  description?: string;
};

// Few-shot examples for LangExtract - now using genealogy-style text that matches our input
const langExtractExamples: ExampleData[] = [
  {
    // Example 1: Genealogy style (matches Genesis 5 format)
    text: 'And Enos lived ninety years, and begat Cainan: And Enos lived after he begat Cainan eight hundred and fifteen years, and begat sons and daughters.',
    extractions: [
      { extractionClass: 'person', extractionText: 'Enos' },
      { extractionClass: 'person', extractionText: 'Cainan' },
    ],
  },
  {
    // Example 2: Narrative with location (matches Genesis 4 format)
    text: 'And Cain went out from the presence of the Lord, and dwelt in the land of Nod, on the east of Eden.',
    extractions: [
      { extractionClass: 'person', extractionText: 'Cain' },
      { extractionClass: 'person', extractionText: 'Lord' },
      { extractionClass: 'place', extractionText: 'Nod' },
      { extractionClass: 'place', extractionText: 'Eden' },
    ],
  },
  {
    // Example 3: Birth narrative with multiple names
    text: 'And Lamech took unto him two wives: the name of the one was Adah, and the name of the other Zillah. And Adah bare Jabal: he was the father of such as dwell in tents.',
    extractions: [
      { extractionClass: 'person', extractionText: 'Lamech' },
      { extractionClass: 'person', extractionText: 'Adah' },
      { extractionClass: 'person', extractionText: 'Zillah' },
      { extractionClass: 'person', extractionText: 'Jabal' },
    ],
  },
];

const langExtractPrompt = `Extract ALL named entities from biblical text. Be thorough - extract every person and place mentioned.

Entity types:
- person: Named individuals (Adam, Eve, Cain, Methuselah, God, Lord, etc.)
- place: Named locations (Eden, Nod, etc.)
- group: Named peoples or tribes

Important: Extract EVERY name that appears in the text. In genealogies, extract all ancestors and descendants mentioned.

Use exact text from the document.`;

// Prompt for our extraction methods
const extractionPrompt = `Extract all named entities from this biblical text.

For each entity, identify:
- name: The exact name as it appears in the text
- type: One of "Person", "Place", or "Group"
- description: A brief description based on the text

Focus on:
- People (individuals mentioned by name)
- Places (geographic locations mentioned by name)
- Groups (tribes, peoples, or collectives mentioned by name)

TEXT:
${documentText}

Extract all named entities found in the text above.`;

@Module({
  imports: [AppConfigModule, LangfuseModule],
})
class ComparisonModule {}

interface ExtractionResult {
  method: string;
  entities: ExtractedEntity[];
  durationMs: number;
  error?: string;
  // For Langfuse logging
  input?: string;
  output?: any;
}

interface LangfuseContext {
  langfuse: LangfuseService;
  traceId: string;
}

interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  matched: number;
  extracted: number;
  expected: number;
}

/**
 * Fuzzy name matching
 */
function namesMatch(extracted: string, expected: string): boolean {
  const e1 = extracted.toLowerCase().trim();
  const e2 = expected.toLowerCase().trim();
  if (e1 === e2) return true;
  if (e1.includes(e2) || e2.includes(e1)) return true;
  // Handle hyphenated names
  if (e1.replace(/-/g, '') === e2.replace(/-/g, '')) return true;
  return false;
}

/**
 * Analyze what's matched and not matched
 */
function analyzeMatches(
  extracted: ExtractedEntity[],
  expected: { name: string; type: string }[]
): {
  matchedExpected: { name: string; type: string }[];
  missedExpected: { name: string; type: string }[];
  extraExtracted: ExtractedEntity[];
} {
  const matchedExpectedSet = new Set<number>();
  const matchedExtractedSet = new Set<number>();

  // Find matches
  for (let expIdx = 0; expIdx < expected.length; expIdx++) {
    const exp = expected[expIdx];
    for (let extIdx = 0; extIdx < extracted.length; extIdx++) {
      if (matchedExtractedSet.has(extIdx)) continue;

      const ext = extracted[extIdx];
      const typeMatch = ext.type.toLowerCase() === exp.type.toLowerCase();
      const nameMatch = namesMatch(ext.name, exp.name);

      if (typeMatch && nameMatch) {
        matchedExpectedSet.add(expIdx);
        matchedExtractedSet.add(extIdx);
        break;
      }
    }
  }

  const matchedExpected = expected.filter((_, i) => matchedExpectedSet.has(i));
  const missedExpected = expected.filter((_, i) => !matchedExpectedSet.has(i));
  const extraExtracted = extracted.filter(
    (_, i) => !matchedExtractedSet.has(i)
  );

  return { matchedExpected, missedExpected, extraExtracted };
}

/**
 * Calculate precision, recall, F1
 */
function calculateMetrics(
  extracted: ExtractedEntity[],
  expected: { name: string; type: string }[]
): Metrics {
  const matched = new Set<string>();
  const matchedExtracted = new Set<number>();

  for (const exp of expected) {
    const key = `${exp.type.toLowerCase()}:${exp.name.toLowerCase()}`;

    for (let i = 0; i < extracted.length; i++) {
      if (matchedExtracted.has(i)) continue;

      const ext = extracted[i];
      const typeMatch = ext.type.toLowerCase() === exp.type.toLowerCase();
      const nameMatch = namesMatch(ext.name, exp.name);

      if (typeMatch && nameMatch) {
        matched.add(key);
        matchedExtracted.add(i);
        break;
      }
    }
  }

  const precision = extracted.length > 0 ? matched.size / extracted.length : 0;
  const recall = expected.length > 0 ? matched.size / expected.length : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  return {
    precision,
    recall,
    f1,
    matched: matched.size,
    extracted: extracted.length,
    expected: expected.length,
  };
}

/**
 * Method 1: LangExtract
 */
async function runLangExtract(apiKey: string): Promise<ExtractionResult> {
  const startTime = Date.now();

  // LangExtract uses its own prompt format, but we can log the description
  const inputDescription = `LangExtract: ${langExtractPrompt}\nDocument length: ${documentText.length} chars`;

  try {
    // Using config with fenceOutput: true to handle Gemini's markdown-wrapped JSON responses
    const rawResult = await extract(documentText, {
      promptDescription: langExtractPrompt,
      examples: langExtractExamples,
      modelType: 'gemini',
      modelId: 'gemini-2.5-flash',
      apiKey,
      temperature: 0.1,
      fenceOutput: true, // CRITICAL: Gemini returns markdown-fenced JSON, this tells resolver to strip the fences
      debug: true,
    });

    const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
    const extractions = result?.extractions || [];

    // Debug: log the raw result structure
    console.log(
      '\n[LangExtract Debug] Raw result keys:',
      Object.keys(result || {})
    );
    console.log(
      '[LangExtract Debug] Number of extractions:',
      extractions.length
    );
    if (extractions.length > 0) {
      console.log(
        '[LangExtract Debug] First extraction:',
        JSON.stringify(extractions[0], null, 2)
      );
    } else {
      console.log('[LangExtract Debug] No extractions returned');
      console.log(
        '[LangExtract Debug] Full result:',
        JSON.stringify(result, null, 2).slice(0, 500)
      );
    }

    const entities: ExtractedEntity[] = extractions.map((ext: Extraction) => ({
      name: ext.extractionText,
      type:
        ext.extractionClass.charAt(0).toUpperCase() +
        ext.extractionClass.slice(1),
    }));

    return {
      method: 'LangExtract',
      entities,
      durationMs: Date.now() - startTime,
      input: inputDescription,
      output: { extractions: extractions.length, result },
    };
  } catch (error) {
    return {
      method: 'LangExtract',
      entities: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      input: inputDescription,
    };
  }
}

/**
 * Method 2: JSON Mode (our current approach)
 */
async function runJsonMode(): Promise<ExtractionResult> {
  const startTime = Date.now();

  const jsonSchema = {
    entities: [{ name: '...', type: 'Person|Place|Group', description: '...' }],
  };

  const prompt = `${extractionPrompt}

Return a JSON object with this structure:
${JSON.stringify(jsonSchema, null, 2)}

Return ONLY valid JSON, no markdown or explanation.`;

  // Structured input for Langfuse logging
  const structuredInput = {
    prompt: extractionPrompt,
    outputSchema: jsonSchema,
    method: 'responseMimeType: application/json (JSON mode)',
  };

  try {
    const model = new ChatVertexAI({
      model: 'gemini-2.5-flash',
      temperature: 0.1,
      maxOutputTokens: 8192,
      // Note: Using 'as any' because responseMimeType isn't in the type definitions
      // but IS supported by the underlying API
      responseMimeType: 'application/json',
    } as any);

    const result = await model.invoke(prompt);
    const content =
      typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content);

    // Clean markdown if present
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    const entities: ExtractedEntity[] = parsed.entities || [];

    return {
      method: 'JSON Mode',
      entities,
      durationMs: Date.now() - startTime,
      input: JSON.stringify(structuredInput, null, 2),
      output: parsed,
    };
  } catch (error) {
    return {
      method: 'JSON Mode',
      entities: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      input: JSON.stringify(structuredInput, null, 2),
    };
  }
}

/**
 * Method 3: Structured Output (withStructuredOutput)
 */
async function runStructuredOutput(): Promise<ExtractionResult> {
  const startTime = Date.now();

  // Schema definition for logging - shows what structure the LLM is asked to produce
  const schemaDefinition = {
    name: 'extract_entities',
    schema: {
      entities: [
        {
          name: 'string - Name of the entity',
          type: 'string - Type: Person, Place, or Group',
          description: 'string (optional) - Brief description',
        },
      ],
    },
  };

  // Structured input for Langfuse logging
  const structuredInput = {
    prompt: extractionPrompt,
    outputSchema: schemaDefinition,
    method: 'withStructuredOutput (function calling)',
  };

  try {
    const model = new ChatVertexAI({
      model: 'gemini-2.5-flash',
      temperature: 0.1,
      maxOutputTokens: 8192,
    });

    // Use withStructuredOutput with Zod schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structuredModel = (model as any).withStructuredOutput(EntitySchema, {
      name: 'extract_entities',
    });

    const result = await structuredModel.invoke(extractionPrompt);

    // Result should already be parsed according to our schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entities: ExtractedEntity[] = (result as any).entities || [];

    return {
      method: 'Structured Output',
      entities,
      durationMs: Date.now() - startTime,
      input: JSON.stringify(structuredInput, null, 2),
      output: result,
    };
  } catch (error) {
    return {
      method: 'Structured Output',
      entities: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      input: JSON.stringify(structuredInput, null, 2),
    };
  }
}

interface VerificationResult {
  total: number;
  exact: number;
  fuzzy: number;
  notFound: number;
  notFoundNames: string[];
}

/**
 * Verify entities against source text
 */
function verifyEntitySpans(
  entities: ExtractedEntity[],
  sourceText: string
): VerificationResult {
  // Convert to the format expected by verifyEntities
  const entityInput = entities.map((e) => ({
    name: e.name,
    type: e.type || 'Unknown',
  }));
  const { summary } = verifyEntities(entityInput, sourceText, {
    logWarnings: false,
  });

  return {
    total: summary.total,
    exact: summary.exactMatches,
    fuzzy: summary.fuzzyMatches,
    notFound: summary.notFound,
    notFoundNames: summary.notFoundEntities,
  };
}

interface AggregatedMetrics {
  precision: { avg: number; min: number; max: number };
  recall: { avg: number; min: number; max: number };
  f1: { avg: number; min: number; max: number };
  durationMs: { avg: number; min: number; max: number };
  extracted: { avg: number; min: number; max: number };
  matched: { avg: number; min: number; max: number };
  expected: number;
  verification: {
    exact: { avg: number; min: number; max: number };
    fuzzy: { avg: number; min: number; max: number };
    notFound: { avg: number; min: number; max: number };
  };
  runs: number;
}

/**
 * Aggregate metrics from multiple runs
 */
function aggregateMetrics(
  runs: {
    metrics: Metrics;
    durationMs: number;
    verification: VerificationResult;
  }[]
): AggregatedMetrics {
  const precisions = runs.map((r) => r.metrics.precision);
  const recalls = runs.map((r) => r.metrics.recall);
  const f1s = runs.map((r) => r.metrics.f1);
  const durations = runs.map((r) => r.durationMs);
  const extracteds = runs.map((r) => r.metrics.extracted);
  const matcheds = runs.map((r) => r.metrics.matched);
  const exacts = runs.map((r) => r.verification.exact);
  const fuzzys = runs.map((r) => r.verification.fuzzy);
  const notFounds = runs.map((r) => r.verification.notFound);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    precision: {
      avg: avg(precisions),
      min: Math.min(...precisions),
      max: Math.max(...precisions),
    },
    recall: {
      avg: avg(recalls),
      min: Math.min(...recalls),
      max: Math.max(...recalls),
    },
    f1: { avg: avg(f1s), min: Math.min(...f1s), max: Math.max(...f1s) },
    durationMs: {
      avg: avg(durations),
      min: Math.min(...durations),
      max: Math.max(...durations),
    },
    extracted: {
      avg: avg(extracteds),
      min: Math.min(...extracteds),
      max: Math.max(...extracteds),
    },
    matched: {
      avg: avg(matcheds),
      min: Math.min(...matcheds),
      max: Math.max(...matcheds),
    },
    expected: runs[0].metrics.expected,
    verification: {
      exact: {
        avg: avg(exacts),
        min: Math.min(...exacts),
        max: Math.max(...exacts),
      },
      fuzzy: {
        avg: avg(fuzzys),
        min: Math.min(...fuzzys),
        max: Math.max(...fuzzys),
      },
      notFound: {
        avg: avg(notFounds),
        min: Math.min(...notFounds),
        max: Math.max(...notFounds),
      },
    },
    runs: runs.length,
  };
}

/**
 * Print results for a method with aggregated stats
 */
function printAggregatedResults(
  method: string,
  agg: AggregatedMetrics,
  extraEntities: Map<string, number>,
  missedEntities: Map<string, number>
) {
  console.log('\n' + '='.repeat(80));
  console.log(`${method.toUpperCase()} (${agg.runs} runs)`);
  console.log('='.repeat(80));

  console.log(
    `Duration: ${agg.durationMs.avg.toFixed(0)}ms avg (${agg.durationMs.min}-${
      agg.durationMs.max
    }ms)`
  );
  console.log(
    `Extracted: ${agg.extracted.avg.toFixed(1)} avg (${agg.extracted.min}-${
      agg.extracted.max
    })`
  );
  console.log(`Expected: ${agg.expected} entities`);
  console.log(
    `Matched: ${agg.matched.avg.toFixed(1)} avg (${agg.matched.min}-${
      agg.matched.max
    })`
  );

  console.log(`\nMetrics (avg / min-max):`);
  console.log(
    `  Precision: ${(agg.precision.avg * 100).toFixed(1)}% (${(
      agg.precision.min * 100
    ).toFixed(1)}-${(agg.precision.max * 100).toFixed(1)}%)`
  );
  console.log(
    `  Recall: ${(agg.recall.avg * 100).toFixed(1)}% (${(
      agg.recall.min * 100
    ).toFixed(1)}-${(agg.recall.max * 100).toFixed(1)}%)`
  );
  console.log(
    `  F1: ${(agg.f1.avg * 100).toFixed(1)}% (${(agg.f1.min * 100).toFixed(
      1
    )}-${(agg.f1.max * 100).toFixed(1)}%)`
  );

  console.log(`\nText Span Verification (avg):`);
  console.log(
    `  Exact matches: ${agg.verification.exact.avg.toFixed(1)} (${
      agg.verification.exact.min
    }-${agg.verification.exact.max})`
  );
  console.log(
    `  Fuzzy matches: ${agg.verification.fuzzy.avg.toFixed(1)} (${
      agg.verification.fuzzy.min
    }-${agg.verification.fuzzy.max})`
  );
  console.log(
    `  Not found (potential hallucinations): ${agg.verification.notFound.avg.toFixed(
      1
    )} (${agg.verification.notFound.min}-${agg.verification.notFound.max})`
  );

  // Show extra entities (extracted but not in expected list)
  if (extraEntities.size > 0) {
    console.log(
      `\n  EXTRA entities (not in expected list, count = times appeared across ${agg.runs} runs):`
    );
    const sorted = [...extraEntities.entries()].sort((a, b) => b[1] - a[1]);
    for (const [entity, count] of sorted) {
      console.log(`    ${entity} (${count}/${agg.runs} runs)`);
    }
  }

  // Show missed entities (in expected but not extracted)
  if (missedEntities.size > 0) {
    console.log(`\n  MISSED entities (in expected but not extracted):`);
    const sorted = [...missedEntities.entries()].sort((a, b) => b[1] - a[1]);
    for (const [entity, count] of sorted) {
      console.log(`    ${entity} (missed in ${count}/${agg.runs} runs)`);
    }
  }
}

/**
 * Run a method multiple times and aggregate results
 */
async function runMethodMultipleTimes(
  methodName: string,
  runFn: () => Promise<ExtractionResult>,
  numRuns: number,
  lfContext?: LangfuseContext
): Promise<{
  aggregated: AggregatedMetrics;
  allRuns: {
    result: ExtractionResult;
    metrics: Metrics;
    verification: VerificationResult;
  }[];
  extraEntitiesSummary: Map<string, number>;
  missedEntitiesSummary: Map<string, number>;
}> {
  const allRuns: {
    result: ExtractionResult;
    metrics: Metrics;
    verification: VerificationResult;
  }[] = [];

  // Track extra and missed entities across all runs
  const extraEntitiesSummary = new Map<string, number>();
  const missedEntitiesSummary = new Map<string, number>();

  // Create a span for this method if Langfuse context is provided
  const methodSpan = lfContext
    ? lfContext.langfuse.createSpan(lfContext.traceId, methodName, {
        numRuns,
        expectedEntities: expectedEntities.length,
      })
    : null;

  for (let i = 0; i < numRuns; i++) {
    console.log(`  Run ${i + 1}/${numRuns}...`);
    const result = await runFn();

    // Log generation for this run
    if (lfContext && result.input) {
      const generation = lfContext.langfuse.createObservation(
        lfContext.traceId,
        `${methodName}_run_${i + 1}`,
        result.input,
        {
          model: 'gemini-2.5-flash',
          runNumber: i + 1,
        },
        methodSpan?.id
      );
      if (generation) {
        generation.end({
          output: result.output || { error: result.error },
          metadata: {
            durationMs: result.durationMs,
            entitiesExtracted: result.entities.length,
            hasError: !!result.error,
          },
        });
      }
    }

    if (result.error) {
      console.log(`    ERROR: ${result.error}`);
      continue;
    }

    const metrics = calculateMetrics(result.entities, expectedEntities);
    const verification = verifyEntitySpans(result.entities, documentText);
    const analysis = analyzeMatches(result.entities, expectedEntities);

    // Track extra entities (extracted but not in expected)
    for (const extra of analysis.extraExtracted) {
      const key = `[${extra.type}] ${extra.name}`;
      extraEntitiesSummary.set(key, (extraEntitiesSummary.get(key) || 0) + 1);
    }

    // Track missed entities (in expected but not extracted)
    for (const missed of analysis.missedExpected) {
      const key = `[${missed.type}] ${missed.name}`;
      missedEntitiesSummary.set(key, (missedEntitiesSummary.get(key) || 0) + 1);
    }

    allRuns.push({
      result,
      metrics,
      verification,
    });

    console.log(
      `    ${result.entities.length} entities, ${metrics.matched} matched, ${analysis.extraExtracted.length} extra, ${analysis.missedExpected.length} missed, ${result.durationMs}ms`
    );
  }

  // End the method span with aggregated output
  if (methodSpan && allRuns.length > 0) {
    const avgPrecision =
      allRuns.reduce((sum, r) => sum + r.metrics.precision, 0) / allRuns.length;
    const avgRecall =
      allRuns.reduce((sum, r) => sum + r.metrics.recall, 0) / allRuns.length;
    const avgF1 =
      allRuns.reduce((sum, r) => sum + r.metrics.f1, 0) / allRuns.length;
    methodSpan.end({
      output: {
        runsCompleted: allRuns.length,
        avgPrecision,
        avgRecall,
        avgF1,
      },
    });
  }

  if (allRuns.length === 0) {
    // All runs failed, return empty aggregation
    return {
      aggregated: {
        precision: { avg: 0, min: 0, max: 0 },
        recall: { avg: 0, min: 0, max: 0 },
        f1: { avg: 0, min: 0, max: 0 },
        durationMs: { avg: 0, min: 0, max: 0 },
        extracted: { avg: 0, min: 0, max: 0 },
        matched: { avg: 0, min: 0, max: 0 },
        expected: expectedEntities.length,
        verification: {
          exact: { avg: 0, min: 0, max: 0 },
          fuzzy: { avg: 0, min: 0, max: 0 },
          notFound: { avg: 0, min: 0, max: 0 },
        },
        runs: 0,
      },
      allRuns,
      extraEntitiesSummary,
      missedEntitiesSummary,
    };
  }

  const aggregated = aggregateMetrics(
    allRuns.map((r) => ({
      metrics: r.metrics,
      durationMs: r.result.durationMs,
      verification: r.verification,
    }))
  );

  return { aggregated, allRuns, extraEntitiesSummary, missedEntitiesSummary };
}

async function main() {
  Logger.overrideLogger(false);

  console.log('='.repeat(80));
  console.log('ENTITY EXTRACTION METHOD COMPARISON');
  console.log(
    `(Running each method ${NUM_RUNS} times for statistical significance)`
  );
  console.log('='.repeat(80));
  console.log(`\nTest document: Genesis chapters 4-5`);
  console.log(`Document length: ${documentText.length} characters`);
  console.log(`Expected entities: ${expectedEntities.length}`);

  // Verify ground truth entities against source text
  console.log('\n' + '-'.repeat(80));
  console.log('GROUND TRUTH VERIFICATION');
  console.log('-'.repeat(80));
  const groundTruthVerification = verifyEntitySpans(
    expectedEntities.map((e) => ({ name: e.name, type: e.type })),
    documentText
  );
  console.log(`Total expected entities: ${groundTruthVerification.total}`);
  console.log(`  Exact matches in text: ${groundTruthVerification.exact}`);
  console.log(`  Fuzzy matches in text: ${groundTruthVerification.fuzzy}`);
  console.log(`  NOT FOUND in text: ${groundTruthVerification.notFound}`);
  if (groundTruthVerification.notFoundNames.length > 0) {
    console.log(
      `  Missing: ${groundTruthVerification.notFoundNames.join(', ')}`
    );
    console.log(
      '\n  WARNING: Some expected entities are not in the source text!'
    );
    console.log('  This may indicate errors in the ground truth list.');
  }

  // Initialize app
  const app = await NestFactory.createApplicationContext(ComparisonModule, {
    logger: false,
  });
  const langfuse = app.get(LangfuseService);

  // Create Langfuse trace
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runId = `extraction-comparison-${timestamp}`;
  const traceId = langfuse.createJobTrace(
    runId,
    {
      name: 'Extraction Method Comparison',
      document: 'Genesis 4-5',
      documentLength: documentText.length,
      expectedEntities: expectedEntities.length,
      numRuns: NUM_RUNS,
      groundTruthVerification: {
        exact: groundTruthVerification.exact,
        fuzzy: groundTruthVerification.fuzzy,
        notFound: groundTruthVerification.notFound,
      },
    },
    'test', // Environment
    'cli-benchmark' // traceType for filtering
  );
  console.log(`\nLangfuse trace: ${traceId || 'disabled'} (environment: test)`);

  // Create Langfuse context for detailed logging
  const lfContext: LangfuseContext | undefined = traceId
    ? { langfuse, traceId }
    : undefined;

  // Get API key for LangExtract (Google AI Studio key)
  // Uses LANGEXTRACT_API_KEY to avoid conflicts with Vertex AI auth
  // Falls back to GOOGLE_API_KEY if not set
  const apiKey =
    process.env.LANGEXTRACT_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;

  const aggregatedResults: { method: string; aggregated: AggregatedMetrics }[] =
    [];

  // Run all methods
  console.log('\n' + '-'.repeat(80));
  console.log(`Running extraction methods (${NUM_RUNS} runs each)...`);
  console.log('-'.repeat(80));

  // Method 1: LangExtract
  if (apiKey) {
    console.log('\n1. LangExtract:');
    const langExtractResults = await runMethodMultipleTimes(
      'LangExtract',
      () => runLangExtract(apiKey),
      NUM_RUNS,
      lfContext
    );
    aggregatedResults.push({
      method: 'LangExtract',
      aggregated: langExtractResults.aggregated,
    });
    printAggregatedResults(
      'LangExtract',
      langExtractResults.aggregated,
      langExtractResults.extraEntitiesSummary,
      langExtractResults.missedEntitiesSummary
    );
  } else {
    console.log('\n1. LangExtract SKIPPED (no API key)');
  }

  // Method 2: JSON Mode
  console.log('\n2. JSON Mode:');
  const jsonModeResults = await runMethodMultipleTimes(
    'JSON Mode',
    runJsonMode,
    NUM_RUNS,
    lfContext
  );
  aggregatedResults.push({
    method: 'JSON Mode',
    aggregated: jsonModeResults.aggregated,
  });
  printAggregatedResults(
    'JSON Mode',
    jsonModeResults.aggregated,
    jsonModeResults.extraEntitiesSummary,
    jsonModeResults.missedEntitiesSummary
  );

  // Method 3: Structured Output
  console.log('\n3. Structured Output:');
  const structuredResults = await runMethodMultipleTimes(
    'Structured Output',
    runStructuredOutput,
    NUM_RUNS,
    lfContext
  );
  aggregatedResults.push({
    method: 'Structured Output',
    aggregated: structuredResults.aggregated,
  });
  printAggregatedResults(
    'Structured Output',
    structuredResults.aggregated,
    structuredResults.extraEntitiesSummary,
    structuredResults.missedEntitiesSummary
  );

  // Summary comparison table
  console.log('\n\n' + '='.repeat(80));
  console.log(`SUMMARY COMPARISON (${NUM_RUNS} runs averaged)`);
  console.log('='.repeat(80));
  console.log(
    '\n| Method            | Precision   | Recall      | F1          | Time       | Halluc. |'
  );
  console.log(
    '|-------------------|-------------|-------------|-------------|------------|---------|'
  );

  for (const { method, aggregated: agg } of aggregatedResults) {
    const name = method.padEnd(17);
    const prec = `${(agg.precision.avg * 100).toFixed(1)}%`.padStart(11);
    const rec = `${(agg.recall.avg * 100).toFixed(1)}%`.padStart(11);
    const f1 = `${(agg.f1.avg * 100).toFixed(1)}%`.padStart(11);
    const time = `${agg.durationMs.avg.toFixed(0)}ms`.padStart(10);
    const halluc = `${agg.verification.notFound.avg.toFixed(1)}`.padStart(7);
    console.log(`| ${name} | ${prec} | ${rec} | ${f1} | ${time} | ${halluc} |`);
  }

  console.log(
    '\nNote: Halluc. = avg entities not found in source text (potential hallucinations)'
  );

  // Report to Langfuse with aggregated metrics
  if (traceId) {
    for (const { method, aggregated: agg } of aggregatedResults) {
      const methodKey = method.toLowerCase().replace(/\s+/g, '_');
      langfuse.scoreTraceMultiple(traceId, [
        {
          name: `${methodKey}_precision_avg`,
          value: agg.precision.avg,
          comment: `${method} precision (avg of ${NUM_RUNS} runs)`,
        },
        {
          name: `${methodKey}_recall_avg`,
          value: agg.recall.avg,
          comment: `${method} recall (avg of ${NUM_RUNS} runs)`,
        },
        {
          name: `${methodKey}_f1_avg`,
          value: agg.f1.avg,
          comment: `${method} F1 score (avg of ${NUM_RUNS} runs)`,
        },
        {
          name: `${methodKey}_latency_ms_avg`,
          value: agg.durationMs.avg,
          comment: `${method} latency (avg of ${NUM_RUNS} runs)`,
        },
        {
          name: `${methodKey}_hallucinations_avg`,
          value: agg.verification.notFound.avg,
          comment: `${method} entities not in source text (avg)`,
        },
        {
          name: `${methodKey}_precision_variance`,
          value: agg.precision.max - agg.precision.min,
          comment: `${method} precision variance across runs`,
        },
      ]);
    }
    console.log('\nScores reported to Langfuse.');
  }

  await langfuse.shutdown();
  await app.close();

  console.log('\n' + '='.repeat(80));
  console.log('Comparison complete.');
  console.log('='.repeat(80));
}

main().catch(console.error);
