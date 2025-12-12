/**
 * Tests for Verification Cascade
 *
 * Tests the 3-tier cascade orchestration:
 * - Tier 1: Exact Match (always runs)
 * - Tier 2: NLI (skipped in tests - requires running service)
 * - Tier 3: LLM Judge (skipped in tests - requires API key)
 *
 * Run with: npx ts-node scripts/extraction_tests/tests/verification/cascade.test.ts
 */

import {
  checkVerificationHealth,
  verifyClaim,
  verifyEntitiesBatch,
  DEFAULT_VERIFICATION_CONFIG,
} from '../../lib/verification';

// Test utilities
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

// Sample document for testing
const SAMPLE_DOCUMENT = `
EXECUTIVE SUMMARY

John Smith serves as the Chief Executive Officer of Acme Corporation, 
a technology company founded in 2010 and headquartered in San Francisco, California.

Under his leadership since 2020, the company has grown to employ over 500 people
and achieved annual revenue of $50 million in fiscal year 2023.

Key executives include:
- Sarah Johnson, Chief Technology Officer
- Michael Brown, Chief Financial Officer
- Emily Davis, VP of Engineering

The company specializes in artificial intelligence solutions for enterprise clients,
with notable customers including TechGiant Inc. and GlobalBank Corp.

Contact: info@acmecorp.com | Phone: (555) 123-4567
Address: 123 Innovation Drive, San Francisco, CA 94105
`;

async function runTests() {
  console.log('\n=== Verification Cascade Tests ===\n');

  // ============================================================
  // Health Check Test
  // ============================================================

  console.log('--- Health Check ---\n');

  const health = await checkVerificationHealth();
  console.log(
    `  Tier 1 (Exact Match): ${
      health.tier1Available ? 'Available' : 'Unavailable'
    }`
  );
  console.log(
    `  Tier 2 (NLI): ${health.tier2Available ? 'Available' : 'Unavailable'}`
  );
  console.log(
    `  Tier 3 (LLM Judge): ${
      health.tier3Available ? 'Available' : 'Unavailable'
    }`
  );
  console.log(`  Message: ${health.message}\n`);

  assert(health.tier1Available, 'Tier 1 should always be available');

  // ============================================================
  // Single Claim Verification - Exact Match (Tier 1)
  // ============================================================

  console.log('--- Single Claim Verification (Tier 1 Only) ---\n');

  // Force Tier 1 only by setting high NLI timeout (will fail)
  const tier1OnlyConfig = {
    ...DEFAULT_VERIFICATION_CONFIG,
    nliEndpoint: 'http://localhost:1/predict', // Invalid endpoint
    nliTimeoutMs: 100, // Fast timeout
  };

  // Test exact match - should pass Tier 1
  let result = await verifyClaim('John Smith', SAMPLE_DOCUMENT, {
    entityType: 'person',
    config: tier1OnlyConfig,
  });

  console.log(`  Entity: John Smith`);
  console.log(`  Verified: ${result.entityVerified}`);
  console.log(`  Tier: ${result.entityVerificationTier}`);
  console.log(`  Confidence: ${result.entityConfidence.toFixed(3)}`);
  console.log(`  Reason: ${result.entityReason}\n`);

  assert(result.entityVerified, 'John Smith should be verified');
  assert(result.entityVerificationTier === 1, 'Should be verified at Tier 1');

  // Test exact match with properties
  result = await verifyClaim('Acme Corporation', SAMPLE_DOCUMENT, {
    entityType: 'organization',
    properties: {
      headquarters: 'San Francisco, California',
      revenue: '$50 million',
    },
    config: tier1OnlyConfig,
  });

  console.log(`  Entity: Acme Corporation`);
  console.log(`  Verified: ${result.entityVerified}`);
  console.log(
    `  Properties verified: ${
      result.properties.filter((p) => p.verified).length
    }/${result.properties.length}`
  );
  console.log(`  Overall confidence: ${result.overallConfidence.toFixed(3)}\n`);

  assert(result.entityVerified, 'Acme Corporation should be verified');

  // Test non-existent entity
  result = await verifyClaim('Microsoft Corporation', SAMPLE_DOCUMENT, {
    entityType: 'organization',
    config: tier1OnlyConfig,
  });

  console.log(`  Entity: Microsoft Corporation (non-existent)`);
  console.log(`  Verified: ${result.entityVerified}`);
  console.log(`  Status: ${result.entityStatus}`);
  console.log(`  Confidence: ${result.entityConfidence.toFixed(3)}\n`);

  // Note: Without NLI/LLM, this might still fail at Tier 3 (LLM)
  // The exact behavior depends on which tiers are available

  // ============================================================
  // Batch Verification
  // ============================================================

  console.log('--- Batch Verification ---\n');

  const batchResult = await verifyEntitiesBatch({
    sourceText: SAMPLE_DOCUMENT,
    entities: [
      {
        id: '1',
        name: 'John Smith',
        type: 'person',
        properties: { title: 'Chief Executive Officer' },
      },
      {
        id: '2',
        name: 'Sarah Johnson',
        type: 'person',
        properties: { title: 'Chief Technology Officer' },
      },
      {
        id: '3',
        name: 'Michael Brown',
        type: 'person',
        properties: { title: 'Chief Financial Officer' },
      },
      {
        id: '4',
        name: 'Emily Davis',
        type: 'person',
        properties: { title: 'VP of Engineering' },
      },
      { id: '5', name: 'Acme Corporation', type: 'organization' },
      { id: '6', name: 'TechGiant Inc.', type: 'organization' },
      { id: '7', name: 'GlobalBank Corp.', type: 'organization' },
      { id: '8', name: 'Nonexistent Company', type: 'organization' }, // Should fail
    ],
    config: tier1OnlyConfig,
  });

  console.log(`  Total entities: ${batchResult.summary.total}`);
  console.log(`  Verified: ${batchResult.summary.verified}`);
  console.log(`  Rejected: ${batchResult.summary.rejected}`);
  console.log(`  Uncertain: ${batchResult.summary.uncertain}`);
  console.log(
    `  Average confidence: ${batchResult.summary.averageConfidence.toFixed(3)}`
  );
  console.log(`  Processing time: ${batchResult.processingTimeMs}ms`);
  console.log(
    `  Tier usage: T1=${batchResult.summary.tierUsage[1]}, T2=${batchResult.summary.tierUsage[2]}, T3=${batchResult.summary.tierUsage[3]}\n`
  );

  // Show individual results
  console.log('  Individual results:');
  for (const r of batchResult.results) {
    const propsStatus =
      r.properties.length > 0
        ? ` (props: ${r.properties.filter((p) => p.verified).length}/${
            r.properties.length
          })`
        : '';
    console.log(
      `    - ${r.entityName}: ${r.entityStatus} @ T${r.entityVerificationTier}${propsStatus}`
    );
  }
  console.log('');

  // Most entities that exist in the document should be verified
  assert(
    batchResult.summary.verified >= 5,
    'At least 5 entities should be verified'
  );

  // ============================================================
  // Property Verification Details
  // ============================================================

  console.log('--- Property Verification Details ---\n');

  result = await verifyClaim('John Smith', SAMPLE_DOCUMENT, {
    entityType: 'person',
    properties: {
      title: 'Chief Executive Officer',
      company: 'Acme Corporation',
      year: '2020',
    },
    config: tier1OnlyConfig,
  });

  console.log(`  Entity: ${result.entityName}`);
  console.log(`  Entity verified: ${result.entityVerified}`);
  console.log('  Properties:');
  for (const prop of result.properties) {
    console.log(
      `    - ${prop.propertyName}: ${prop.status} @ T${
        prop.verificationTier
      } (${(prop.confidence * 100).toFixed(1)}%)`
    );
  }
  console.log('');

  // ============================================================
  // Edge Cases
  // ============================================================

  console.log('--- Edge Cases ---\n');

  // Empty entity name
  result = await verifyClaim('', SAMPLE_DOCUMENT, {
    config: tier1OnlyConfig,
  });
  console.log(`  Empty entity name: verified=${result.entityVerified}`);

  // Very long entity name
  result = await verifyClaim(
    'This is a very long entity name that definitely does not exist in the document and should not match anything at all',
    SAMPLE_DOCUMENT,
    { config: tier1OnlyConfig }
  );
  console.log(
    `  Very long non-matching name: verified=${result.entityVerified}`
  );

  // Partial match
  result = await verifyClaim('John', SAMPLE_DOCUMENT, {
    entityType: 'person',
    config: tier1OnlyConfig,
  });
  console.log(
    `  Partial match "John": verified=${
      result.entityVerified
    }, confidence=${result.entityConfidence.toFixed(3)}`
  );

  // Case insensitive
  result = await verifyClaim('JOHN SMITH', SAMPLE_DOCUMENT, {
    entityType: 'person',
    config: tier1OnlyConfig,
  });
  console.log(
    `  Case insensitive "JOHN SMITH": verified=${result.entityVerified}`
  );

  console.log('');

  // ============================================================
  // Summary
  // ============================================================

  console.log('=== Test Summary ===\n');

  if (process.exitCode === 1) {
    console.error('Some tests FAILED');
  } else {
    console.log('All tests PASSED');
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Test execution error:', error);
  process.exitCode = 1;
});
