/**
 * Tests for Tier 1: Exact/Fuzzy Match Verification
 *
 * Run with: npx ts-node scripts/extraction_tests/tests/verification/exact-match.test.ts
 */

import {
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeText,
  findBestMatch,
  verifyExactMatch,
  verifyDate,
  verifyNumber,
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

function assertApprox(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(
      `FAIL: ${message} (expected ~${expected}, got ${actual}, diff ${diff})`
    );
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

// ============================================================
// Levenshtein Distance Tests
// ============================================================

console.log('\n=== Levenshtein Distance Tests ===\n');

// Identical strings
assert(
  levenshteinDistance('hello', 'hello') === 0,
  'Identical strings have distance 0'
);

// Single edit
assert(
  levenshteinDistance('hello', 'hallo') === 1,
  'Single substitution has distance 1'
);
assert(
  levenshteinDistance('hello', 'helloo') === 1,
  'Single insertion has distance 1'
);
assert(
  levenshteinDistance('hello', 'helo') === 1,
  'Single deletion has distance 1'
);

// Multiple edits
assert(
  levenshteinDistance('kitten', 'sitting') === 3,
  'kitten -> sitting = 3 edits'
);

// Empty strings
assert(levenshteinDistance('', '') === 0, 'Two empty strings have distance 0');
assert(
  levenshteinDistance('hello', '') === 5,
  'String to empty = string length'
);
assert(
  levenshteinDistance('', 'hello') === 5,
  'Empty to string = string length'
);

// ============================================================
// Levenshtein Similarity Tests
// ============================================================

console.log('\n=== Levenshtein Similarity Tests ===\n');

assertApprox(
  levenshteinSimilarity('hello', 'hello'),
  1.0,
  0.001,
  'Identical strings have similarity 1.0'
);

assertApprox(
  levenshteinSimilarity('hello', 'hallo'),
  0.8,
  0.001,
  'Single edit in 5 chars = 0.8 similarity'
);

assertApprox(
  levenshteinSimilarity('', ''),
  1.0,
  0.001,
  'Two empty strings have similarity 1.0'
);

assertApprox(
  levenshteinSimilarity('abc', 'xyz'),
  0.0,
  0.001,
  'Completely different strings have similarity 0'
);

// ============================================================
// Normalize Text Tests
// ============================================================

console.log('\n=== Normalize Text Tests ===\n');

assert(
  normalizeText('  Hello  World  ') === 'hello world',
  'Normalizes case, trims, collapses spaces'
);

assert(
  normalizeText('Hello, World!') === 'hello, world!',
  'Preserves punctuation by default'
);

assert(
  normalizeText('Hello, World!', { removePunctuation: true }) === 'hello world',
  'Removes punctuation when option set'
);

// ============================================================
// Find Best Match Tests
// ============================================================

console.log('\n=== Find Best Match Tests ===\n');

const sampleText = `John Smith is the CEO of Acme Corporation. 
He has been leading the company since 2020. 
The company is headquartered in New York City.`;

// Exact substring match
let match = findBestMatch('John Smith', sampleText);
assertApprox(match.similarity, 1.0, 0.001, 'Exact match finds John Smith');
assert(
  match.matchedText?.includes('John') ?? false,
  'Returns matched text for John Smith'
);

// Fuzzy match with minor difference
match = findBestMatch('Jon Smith', sampleText); // Missing 'h'
assert(match.similarity > 0.8, 'Fuzzy matches Jon Smith with high similarity');

// No match
match = findBestMatch('Jane Doe', sampleText);
assert(match.similarity < 0.6, 'Non-existent name has low similarity');

// ============================================================
// Verify Exact Match Tests
// ============================================================

console.log('\n=== Verify Exact Match Tests ===\n');

const config = { exactMatchThreshold: 0.95 };

// Exact match passes
let result = verifyExactMatch('Acme Corporation', sampleText, config);
assert(result.passed, 'Exact match of "Acme Corporation" passes');
assert(result.found, 'Marks as found');

// Near match - check similarity
result = verifyExactMatch('Acme Corp', sampleText, config);
console.log(`  "Acme Corp" similarity: ${result.similarity.toFixed(3)}`);
// Note: "Acme Corp" is a substring prefix of "Acme Corporation", so it might have high similarity

// Near match passes with lower threshold
result = verifyExactMatch('Acme Corp', sampleText, {
  exactMatchThreshold: 0.7,
});
assert(result.passed, 'Near match "Acme Corp" passes with 0.7 threshold');

// Non-existent text
result = verifyExactMatch('Microsoft', sampleText, config);
assert(!result.passed, 'Non-existent "Microsoft" does not pass');

// ============================================================
// Date Verification Tests
// ============================================================

console.log('\n=== Date Verification Tests ===\n');

const dateText = `The project started on January 15, 2024 and is expected to complete by 2024-12-31.`;

result = verifyDate('January 15, 2024', dateText, config);
assert(result.passed, 'Exact date format matches');

result = verifyDate('2024-01-15', dateText, config);
// This might not pass depending on format detection
console.log(`  2024-01-15 similarity: ${result.similarity.toFixed(3)}`);

result = verifyDate('2024-12-31', dateText, config);
assert(result.passed, 'ISO date format 2024-12-31 matches');

// ============================================================
// Number Verification Tests
// ============================================================

console.log('\n=== Number Verification Tests ===\n');

const numberText = `The revenue was $1,500,000 with 150 employees. Growth rate: 15.5%`;

result = verifyNumber('1,500,000', numberText, config);
assert(result.passed, 'Formatted number matches');

result = verifyNumber('1500000', numberText, { exactMatchThreshold: 0.8 });
console.log(
  `  Plain number 1500000 similarity: ${result.similarity.toFixed(3)}`
);

result = verifyNumber('150', numberText, config);
assert(result.passed, 'Simple number 150 matches');

result = verifyNumber('15.5', numberText, config);
assert(result.passed, 'Decimal number 15.5 matches');

// ============================================================
// Summary
// ============================================================

console.log('\n=== Test Summary ===\n');

if (process.exitCode === 1) {
  console.error('Some tests FAILED');
} else {
  console.log('All tests PASSED');
}
