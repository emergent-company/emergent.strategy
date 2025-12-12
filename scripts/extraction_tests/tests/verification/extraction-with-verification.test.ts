#!/usr/bin/env npx tsx
/**
 * Full Extraction + Verification Test
 *
 * This test demonstrates the complete pipeline:
 * 1. Extract entities from a document using Vertex AI
 * 2. Verify extracted entities using the 3-tier verification cascade
 * 3. Track everything in Langfuse for observability
 *
 * Run with: npx tsx scripts/extraction_tests/tests/verification/extraction-with-verification.test.ts
 */

import { GoogleGenAI } from '@google/genai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as fs from 'fs';

// Verification imports
import {
  verifyEntitiesBatch,
  checkVerificationHealth,
  shutdownLangfuse,
  EntityToVerify,
} from '../../lib/verification';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set credentials before anything else
const credPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'spec-server-dev-vertex-ai.json'
);

// Verify credentials file exists
if (!fs.existsSync(credPath)) {
  console.error(`❌ Credentials file not found: ${credPath}`);
  process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

const projectId = 'spec-server-dev';
const location = 'europe-central2';
const modelName = 'gemini-2.5-flash-lite';

// Entity type definition
interface ExtractedEntity {
  name: string;
  type: string;
  description?: string;
}

// Build extraction prompt
function buildExtractionPrompt(
  documentText: string,
  allowedTypes: string[]
): string {
  return `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, provide:
1. name: Clear, descriptive name of the entity
2. type: Entity type from the allowed list
3. description: Brief description of what this entity represents

RULES:
- Extract ALL entities that match the allowed types
- Be thorough - don't miss important entities
- Use consistent naming
- Keep descriptions concise but informative

## Allowed Entity Types

Extract ONLY these types: ${allowedTypes.join(', ')}

${allowedTypes.map((t) => `- **${t}**`).join('\n')}

## Document

${documentText}

## Output Format

Return a JSON object with an "entities" array. Each entity must have:
- name (string): Entity name
- type (string): One of the allowed types above
- description (string, optional): Brief description

Extract all entities now.`;
}

// Sample document for testing
const SAMPLE_DOCUMENT = `
# TechVentures Inc. Company Overview

TechVentures Inc. is a leading artificial intelligence company founded in 2015 by Dr. Maria Garcia.
The company is headquartered in San Francisco, California, with additional offices in New York and London.

## Leadership

Dr. Maria Garcia serves as the Chief Executive Officer (CEO). She holds a PhD in Computer Science from MIT
and previously worked at Google as a Senior Research Scientist.

John Smith is the Chief Technology Officer (CTO), responsible for the company's AI platform development.
He joined TechVentures in 2016 from Amazon Web Services.

Sarah Johnson leads the Sales division as VP of Sales, having grown revenue by 300% in the past three years.

## Products

TechVentures' flagship product is "AIAssist", an enterprise AI platform that helps companies automate
document processing. The product was launched in 2018 and now serves over 500 enterprise customers.

The company also offers "DataMiner", a data extraction tool that uses machine learning to identify
patterns in unstructured data. DataMiner was acquired from StartupXYZ in 2020.

## Financials

TechVentures has raised a total of $150 million in funding:
- Series A: $10 million (2016) led by Sequoia Capital
- Series B: $40 million (2018) led by Andreessen Horowitz
- Series C: $100 million (2021) led by SoftBank Vision Fund

The company currently has over 500 employees worldwide and reported annual revenue of $75 million in 2023.
`;

const ALLOWED_TYPES = [
  'Person',
  'Organization',
  'Product',
  'Location',
  'Event',
  'Amount',
  'Date',
];

interface TestResult {
  extractionTime: number;
  verificationTime: number;
  totalEntities: number;
  verifiedEntities: number;
  rejectedEntities: number;
  verificationRate: number;
  tierUsage: Record<1 | 2 | 3, number>;
  entities: Array<{
    name: string;
    type: string;
    verified: boolean;
    confidence: number;
    tier: number;
  }>;
}

async function runExtractionWithVerification(): Promise<TestResult> {
  console.log('\n=== Full Extraction + Verification Pipeline ===\n');

  // Step 1: Check verification health
  console.log('--- Step 1: Health Check ---\n');
  const health = await checkVerificationHealth();
  console.log(`  Tier 1 (Exact Match): ${health.tier1Available ? '✓' : '✗'}`);
  console.log(`  Tier 2 (NLI): ${health.tier2Available ? '✓' : '✗'}`);
  console.log(`  Tier 3 (LLM Judge): ${health.tier3Available ? '✓' : '✗'}`);

  // Step 2: Extract entities
  console.log('\n--- Step 2: Entity Extraction ---\n');
  console.log(`  Model: ${modelName}`);
  console.log(`  Project: ${projectId}`);
  console.log(`  Location: ${location}`);

  // Use native Google GenAI with Vertex AI
  const client = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: location,
  });

  const prompt = buildExtractionPrompt(SAMPLE_DOCUMENT, ALLOWED_TYPES);
  console.log(`  Prompt length: ${prompt.length} chars`);

  const extractionStart = Date.now();
  let extractedEntities: ExtractedEntity[] = [];

  try {
    const result = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.text ?? '';

    // Parse JSON response
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        extractedEntities = parsed.entities || [];
      }
    } catch {
      // Try parsing as array
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        extractedEntities = JSON.parse(arrayMatch[0]);
      }
    }

    const extractionTime = Date.now() - extractionStart;
    console.log(
      `  ✓ Extracted ${extractedEntities.length} entities in ${extractionTime}ms`
    );

    // Show extracted entities
    console.log('\n  Extracted entities:');
    for (const entity of extractedEntities) {
      console.log(`    - ${entity.name} (${entity.type})`);
    }
  } catch (error) {
    const extractionTime = Date.now() - extractionStart;
    console.log(`  ✗ Extraction failed after ${extractionTime}ms`);
    console.log(`    Error: ${error instanceof Error ? error.message : error}`);
    throw error;
  }

  // Step 3: Verify extracted entities
  console.log('\n--- Step 3: Entity Verification ---\n');

  // Convert extracted entities to verification format
  const entitiesToVerify: EntityToVerify[] = extractedEntities.map((e, i) => ({
    id: `entity-${i}`,
    name: e.name,
    type: e.type,
    properties: e.description ? { description: e.description } : undefined,
  }));

  console.log(
    `  Verifying ${entitiesToVerify.length} entities against source document...`
  );

  const verificationStart = Date.now();
  const verificationResult = await verifyEntitiesBatch(
    {
      sourceText: SAMPLE_DOCUMENT,
      entities: entitiesToVerify,
      config: {
        verifyProperties: true,
        maxPropertiesPerEntity: 5,
      },
    },
    {
      enableTracing: true,
      jobId: `extraction-verification-${Date.now()}`,
    }
  );

  const verificationTime = Date.now() - verificationStart;
  console.log(`  ✓ Verification complete in ${verificationTime}ms`);

  // Step 4: Analyze results
  console.log('\n--- Step 4: Results Analysis ---\n');

  const { results, summary } = verificationResult;

  console.log('  Summary:');
  console.log(`    Total entities: ${summary.total}`);
  console.log(
    `    Verified: ${summary.verified} (${(
      (summary.verified / summary.total) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `    Rejected: ${summary.rejected} (${(
      (summary.rejected / summary.total) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `    Average confidence: ${(summary.averageConfidence * 100).toFixed(1)}%`
  );

  console.log('\n  Tier usage:');
  console.log(`    Tier 1 (Exact Match): ${summary.tierUsage[1]} entities`);
  console.log(`    Tier 2 (NLI): ${summary.tierUsage[2]} entities`);
  console.log(`    Tier 3 (LLM Judge): ${summary.tierUsage[3]} entities`);

  console.log('\n  Entity details:');
  for (const result of results) {
    const status = result.entityVerified ? '✓' : '✗';
    const confidence = (result.entityConfidence * 100).toFixed(0);
    console.log(
      `    ${status} ${result.entityName} (${
        result.entityType || 'unknown'
      }) - Tier ${result.entityVerificationTier}, ${confidence}%`
    );
    if (!result.entityVerified && result.entityReason) {
      console.log(`      Reason: ${result.entityReason}`);
    }
  }

  // Identify potential hallucinations
  const hallucinations = results.filter((r) => !r.entityVerified);
  if (hallucinations.length > 0) {
    console.log(
      '\n  ⚠️  Potential hallucinations (entities not found in source):'
    );
    for (const h of hallucinations) {
      console.log(`    - ${h.entityName}`);
    }
  }

  const extractionTime = Date.now() - extractionStart - verificationTime;

  return {
    extractionTime,
    verificationTime,
    totalEntities: summary.total,
    verifiedEntities: summary.verified,
    rejectedEntities: summary.rejected,
    verificationRate: summary.verified / summary.total,
    tierUsage: summary.tierUsage,
    entities: results.map((r) => ({
      name: r.entityName,
      type: r.entityType || 'unknown',
      verified: r.entityVerified,
      confidence: r.entityConfidence,
      tier: r.entityVerificationTier,
    })),
  };
}

async function main() {
  console.log('🔧 Extraction + Verification Pipeline Test');
  console.log('==========================================\n');

  try {
    const result = await runExtractionWithVerification();

    console.log('\n=== Final Summary ===\n');
    console.log(`  Extraction time: ${result.extractionTime}ms`);
    console.log(`  Verification time: ${result.verificationTime}ms`);
    console.log(`  Total entities: ${result.totalEntities}`);
    console.log(
      `  Verified: ${result.verifiedEntities} (${(
        result.verificationRate * 100
      ).toFixed(1)}%)`
    );
    console.log(`  Rejected: ${result.rejectedEntities}`);

    if (result.verificationRate >= 0.8) {
      console.log('\n  ✅ HIGH QUALITY: >80% of entities verified');
    } else if (result.verificationRate >= 0.6) {
      console.log('\n  ⚠️  MEDIUM QUALITY: 60-80% of entities verified');
    } else {
      console.log('\n  ❌ LOW QUALITY: <60% of entities verified');
    }

    console.log(
      '\n  Check Langfuse UI for detailed traces: http://localhost:3011'
    );
  } catch (error) {
    console.error('\n❌ Pipeline failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await shutdownLangfuse();
    console.log('\n=== Test Complete ===\n');
  }
}

main().catch(console.error);
