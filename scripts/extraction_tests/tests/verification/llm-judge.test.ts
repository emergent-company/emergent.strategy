/**
 * LLM Judge (Tier 3) Verification Tests
 *
 * Tests that exercise the LLM Judge tier specifically.
 * These tests require Vertex AI credentials to be configured.
 *
 * The LLM Judge is used when:
 * - Tier 1 (Exact Match) fails
 * - Tier 2 (NLI) is uncertain or unavailable
 *
 * Run with: npx tsx scripts/extraction_tests/tests/verification/llm-judge.test.ts
 */

import {
  verifyEntityWithLLM,
  verifyPropertyWithLLM,
  verifyBatchWithLLM,
} from '../../lib/verification/llm-judge';
import {
  verifyClaim,
  checkVerificationHealth,
  verifyClaimWithTracing,
} from '../../lib/verification/cascade';
import { shutdownLangfuse } from '../../lib/verification/langfuse-client';
import { DEFAULT_VERIFICATION_CONFIG } from '../../lib/verification/types';

// Test configuration - forces escalation to LLM Judge
const FORCE_LLM_CONFIG = {
  // Set exact match threshold impossibly high
  exactMatchThreshold: 1.0,
  // Disable NLI by setting endpoint to invalid URL
  nliEndpoint: 'http://localhost:1/invalid',
  nliTimeoutMs: 100,
};

async function runLLMJudgeTests() {
  console.log('\n=== LLM Judge (Tier 3) Verification Tests ===\n');

  // Check health first
  const health = await checkVerificationHealth();
  console.log('--- Health Check ---\n');
  console.log(
    `  Tier 1 (Exact Match): ${
      health.tier1Available ? 'Available' : 'Not Available'
    }`
  );
  console.log(
    `  Tier 2 (NLI): ${health.tier2Available ? 'Available' : 'Not Available'}`
  );
  console.log(
    `  Tier 3 (LLM Judge): ${
      health.tier3Available ? 'Available' : 'Not Available'
    }`
  );

  // Note: Tier 3 check just verifies GOOGLE_API_KEY exists, but we use Vertex AI
  // which uses service account credentials instead
  console.log('\n  Note: Using Vertex AI with service account credentials');

  // Source text for all tests
  const sourceText = `
    Dr. Maria Garcia is the Chief Executive Officer at TechVentures Inc.
    She has been leading the company since 2019.
    The company is headquartered in San Francisco, California.
    TechVentures specializes in artificial intelligence solutions.
    They have over 500 employees worldwide.
    Maria Garcia holds a PhD in Computer Science from MIT.
    The company was founded in 2015 and has raised $50 million in funding.
  `;

  console.log('\n--- Test 1: Direct Entity Verification ---\n');

  try {
    const result1 = await verifyEntityWithLLM(
      'Maria Garcia',
      'person',
      sourceText,
      { llmJudgeModel: DEFAULT_VERIFICATION_CONFIG.llmJudgeModel }
    );

    console.log(`  Entity: "Maria Garcia" (type: person)`);
    console.log(`  Verified: ${result1.verified}`);
    console.log(`  Confidence: ${result1.confidence.toFixed(3)}`);
    console.log(`  Explanation: ${result1.explanation}`);
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Test 2: Direct Property Verification ---\n');

  try {
    const result2 = await verifyPropertyWithLLM(
      'Maria Garcia',
      'title',
      'CEO',
      sourceText,
      { llmJudgeModel: DEFAULT_VERIFICATION_CONFIG.llmJudgeModel }
    );

    console.log(`  Property: Maria Garcia has title = "CEO"`);
    console.log(`  Verified: ${result2.verified}`);
    console.log(`  Confidence: ${result2.confidence.toFixed(3)}`);
    console.log(`  Explanation: ${result2.explanation}`);
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Test 3: Verification of Non-Existent Entity ---\n');

  try {
    const result3 = await verifyEntityWithLLM(
      'John Smith',
      'person',
      sourceText,
      { llmJudgeModel: DEFAULT_VERIFICATION_CONFIG.llmJudgeModel }
    );

    console.log(`  Entity: "John Smith" (type: person)`);
    console.log(`  Verified: ${result3.verified} (should be false)`);
    console.log(`  Confidence: ${result3.confidence.toFixed(3)}`);
    console.log(`  Explanation: ${result3.explanation}`);
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Test 4: Verification of Incorrect Property ---\n');

  try {
    const result4 = await verifyPropertyWithLLM(
      'TechVentures',
      'founding_year',
      '2010', // Wrong - actual is 2015
      sourceText,
      { llmJudgeModel: DEFAULT_VERIFICATION_CONFIG.llmJudgeModel }
    );

    console.log(`  Property: TechVentures has founding_year = "2010"`);
    console.log(`  Verified: ${result4.verified} (should be false)`);
    console.log(`  Confidence: ${result4.confidence.toFixed(3)}`);
    console.log(`  Explanation: ${result4.explanation}`);
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Test 5: Batch Verification ---\n');

  try {
    const batchClaims = [
      { entityName: 'Maria Garcia', entityType: 'person' },
      { entityName: 'TechVentures', entityType: 'organization' },
      {
        entityName: 'Maria Garcia',
        propertyName: 'education',
        propertyValue: 'PhD from MIT',
      },
      {
        entityName: 'TechVentures',
        propertyName: 'location',
        propertyValue: 'San Francisco',
      },
      {
        entityName: 'TechVentures',
        propertyName: 'employee_count',
        propertyValue: '500+',
      },
    ];

    const batchResults = await verifyBatchWithLLM(batchClaims, sourceText, {
      llmJudgeModel: DEFAULT_VERIFICATION_CONFIG.llmJudgeModel,
    });

    console.log(`  Batch of ${batchClaims.length} claims:`);
    batchResults.forEach((result, i) => {
      const claim = batchClaims[i];
      const claimDesc = claim.propertyName
        ? `${claim.entityName}.${claim.propertyName} = "${claim.propertyValue}"`
        : `${claim.entityName} (${claim.entityType})`;
      console.log(
        `    ${i + 1}. ${claimDesc}: ${result.verified ? '✓' : '✗'} (${(
          result.confidence * 100
        ).toFixed(0)}%)`
      );
    });

    const verifiedCount = batchResults.filter((r) => r.verified).length;
    console.log(
      `\n  Summary: ${verifiedCount}/${batchResults.length} verified`
    );
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Test 6: Full Cascade Forcing LLM Judge ---\n');

  try {
    // Force LLM Judge by disabling other tiers
    const result6 = await verifyClaim(
      'The CEO of TechVentures is Maria',
      sourceText,
      {
        entityType: 'claim',
        config: FORCE_LLM_CONFIG,
      }
    );

    console.log(`  Claim: "The CEO of TechVentures is Maria"`);
    console.log(`  Verified: ${result6.entityVerified}`);
    console.log(`  Tier Used: ${result6.entityVerificationTier} (should be 3)`);
    console.log(`  Confidence: ${result6.entityConfidence.toFixed(3)}`);
    console.log(`  Reason: ${result6.entityReason}`);
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Test 7: Verification with Langfuse Tracing ---\n');

  try {
    const { result: result7, flush } = await verifyClaimWithTracing(
      'Maria Garcia',
      sourceText,
      {
        entityType: 'person',
        properties: {
          title: 'CEO',
          company: 'TechVentures',
        },
        config: FORCE_LLM_CONFIG, // Force LLM Judge for this test
      }
    );

    console.log(`  Entity: "Maria Garcia" with properties`);
    console.log(`  Entity Verified: ${result7.entityVerified}`);
    console.log(`  Entity Tier: ${result7.entityVerificationTier}`);
    console.log(`  Entity Confidence: ${result7.entityConfidence.toFixed(3)}`);
    console.log(`  Properties verified: ${result7.properties.length}`);

    for (const prop of result7.properties) {
      console.log(
        `    - ${prop.propertyName}: ${prop.verified ? '✓' : '✗'} (${(
          prop.confidence * 100
        ).toFixed(0)}%)`
      );
    }

    console.log(`\n  Flushing Langfuse traces...`);
    await flush();
    console.log(`  Traces flushed successfully`);
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Test 8: Numerical Reasoning (LLM strength) ---\n');

  try {
    // LLM should handle numerical reasoning that NLI can't
    const result8 = await verifyPropertyWithLLM(
      'TechVentures',
      'employee_count_comparison',
      'more than 400',
      sourceText,
      { llmJudgeModel: DEFAULT_VERIFICATION_CONFIG.llmJudgeModel }
    );

    console.log(`  Claim: TechVentures has more than 400 employees`);
    console.log(`  (Source says "over 500 employees")`);
    console.log(`  Verified: ${result8.verified} (should be true - 500 > 400)`);
    console.log(`  Confidence: ${result8.confidence.toFixed(3)}`);
    console.log(`  Explanation: ${result8.explanation}`);
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n--- Summary ---\n');
  console.log('  LLM Judge tests completed.');
  console.log('  Check Langfuse UI for traces at: http://localhost:3011');

  // Final cleanup
  await shutdownLangfuse();

  console.log('\n=== LLM Judge Tests Complete ===\n');
}

// Run tests
runLLMJudgeTests().catch(console.error);
