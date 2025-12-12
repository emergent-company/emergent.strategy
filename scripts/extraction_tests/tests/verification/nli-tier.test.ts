/**
 * NLI Tier (Tier 2) Verification Tests
 * 
 * Tests that exercise the NLI tier specifically by using semantically
 * equivalent claims that don't match exactly.
 */

import {
  verifyClaim,
  checkVerificationHealth,
} from '../../lib/verification/cascade';

async function runNLITests() {
  console.log('\n=== NLI Tier (Tier 2) Verification Tests ===\n');

  // Check health
  const health = await checkVerificationHealth();
  console.log('--- Health Check ---\n');
  console.log(`  Tier 1 (Exact Match): ${health.tier1Available ? 'Available' : 'Not Available'}`);
  console.log(`  Tier 2 (NLI): ${health.tier2Available ? 'Available' : 'Not Available'}`);
  console.log(`  Tier 3 (LLM Judge): ${health.tier3Available ? 'Available' : 'Not Available'}`);

  if (!health.tier2Available) {
    console.log('\n❌ NLI service not available. Start it with:');
    console.log('   cd /root/emergent-infra/nli-verifier && NLI_PORT=8090 docker compose up -d');
    process.exit(1);
  }

  // Source text
  const sourceText = `
    Dr. Maria Garcia is the Chief Executive Officer at TechVentures Inc.
    She has been leading the company since 2019.
    The company is headquartered in San Francisco, California.
    TechVentures specializes in artificial intelligence solutions.
    They have over 500 employees worldwide.
    Maria Garcia holds a PhD in Computer Science from MIT.
  `;

  // Config with strict exact match threshold to force NLI usage
  const strictConfig = { exactMatchThreshold: 0.99 };

  console.log('\n--- Test 1: Semantic Equivalence (should use NLI) ---\n');
  
  // Claim that is semantically equivalent but not an exact match
  const result1 = await verifyClaim(
    'Maria Garcia runs TechVentures', // "runs" vs "Chief Executive Officer"
    sourceText,
    { config: strictConfig }
  );
  console.log(`  Claim: "Maria Garcia runs TechVentures"`);
  console.log(`  Verified: ${result1.entityVerified}`);
  console.log(`  Tier: ${result1.entityVerificationTier}`);
  console.log(`  Confidence: ${result1.entityConfidence.toFixed(3)}`);
  console.log(`  Reason: ${result1.entityReason}`);

  console.log('\n--- Test 2: Paraphrased Location (should verify) ---\n');
  
  const result2 = await verifyClaim(
    'TechVentures is based in San Francisco', // "based in" vs "headquartered in"
    sourceText,
    { config: strictConfig }
  );
  console.log(`  Claim: "TechVentures is based in San Francisco"`);
  console.log(`  Verified: ${result2.entityVerified}`);
  console.log(`  Tier: ${result2.entityVerificationTier}`);
  console.log(`  Confidence: ${result2.entityConfidence.toFixed(3)}`);

  console.log('\n--- Test 3: Inferred Information (should verify) ---\n');
  
  const result3 = await verifyClaim(
    'Maria Garcia has a doctorate degree', // "doctorate" inferred from "PhD"
    sourceText,
    { config: strictConfig }
  );
  console.log(`  Claim: "Maria Garcia has a doctorate degree"`);
  console.log(`  Verified: ${result3.entityVerified}`);
  console.log(`  Tier: ${result3.entityVerificationTier}`);
  console.log(`  Confidence: ${result3.entityConfidence.toFixed(3)}`);

  console.log('\n--- Test 4: Wrong Date (should reject as contradiction) ---\n');
  
  const result4 = await verifyClaim(
    'Maria Garcia has been CEO since 2015', // Wrong year - contradiction
    sourceText,
    { config: strictConfig }
  );
  console.log(`  Claim: "Maria Garcia has been CEO since 2015"`);
  console.log(`  Verified: ${result4.entityVerified}`);
  console.log(`  Status: ${result4.entityStatus}`);
  console.log(`  Tier: ${result4.entityVerificationTier}`);
  console.log(`  Confidence: ${result4.entityConfidence.toFixed(3)}`);
  console.log(`  Reason: ${result4.entityReason}`);

  console.log('\n--- Test 5: Unverifiable Claim (not in source) ---\n');
  
  const result5 = await verifyClaim(
    'TechVentures was founded in 2010', // Not mentioned in source
    sourceText,
    { config: strictConfig }
  );
  console.log(`  Claim: "TechVentures was founded in 2010"`);
  console.log(`  Verified: ${result5.entityVerified}`);
  console.log(`  Tier: ${result5.entityVerificationTier}`);
  console.log(`  Confidence: ${result5.entityConfidence.toFixed(3)}`);
  console.log(`  Reason: ${result5.entityReason}`);

  console.log('\n--- Test 6: Numerical Inference (500 > 400) ---\n');
  
  const result6 = await verifyClaim(
    'TechVentures has more than 400 employees', // 500 > 400
    sourceText,
    { config: strictConfig }
  );
  console.log(`  Claim: "TechVentures has more than 400 employees"`);
  console.log(`  Verified: ${result6.entityVerified}`);
  console.log(`  Tier: ${result6.entityVerificationTier}`);
  console.log(`  Confidence: ${result6.entityConfidence.toFixed(3)}`);

  console.log('\n--- Summary ---\n');
  
  const allResults = [result1, result2, result3, result4, result5, result6];
  const tier1Count = allResults.filter(r => r.entityVerificationTier === 1).length;
  const tier2Count = allResults.filter(r => r.entityVerificationTier === 2).length;
  const tier3Count = allResults.filter(r => r.entityVerificationTier === 3).length;
  
  console.log(`  Total claims tested: ${allResults.length}`);
  console.log(`  Resolved at Tier 1 (Exact Match): ${tier1Count}`);
  console.log(`  Resolved at Tier 2 (NLI): ${tier2Count}`);
  console.log(`  Escalated to Tier 3 (LLM): ${tier3Count}`);
  console.log(`  Verified claims: ${allResults.filter(r => r.entityVerified).length}`);
  console.log(`  Rejected claims: ${allResults.filter(r => !r.entityVerified).length}`);

  console.log('\n=== NLI Tier Tests Complete ===\n');
}

runNLITests().catch(console.error);
