#!/usr/bin/env npx tsx
/**
 * Debug: Show exact prompt being sent to Vertex AI
 */

// Document content from: 63_II_John.md
const DOCUMENT_CONTENT = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth...
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
13. The children of your elect sister greet you.
`;

// Exact Person schema from Bible pack
const PERSON_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Full name of the person' },
    role: { type: 'string', description: 'Position, title, or role' },
    tribe: { type: 'string', description: 'Israelite tribe name' },
    father: { type: 'string', description: "Father's name" },
    mother: { type: 'string', description: "Mother's name" },
    aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names' },
    occupation: { type: 'string', description: 'Profession' },
    significance: { type: 'string', description: 'Why important' },
    birth_location: { type: 'string', description: 'Place of birth' },
    death_location: { type: 'string', description: 'Place of death' },
    source_references: { type: 'array', items: { type: 'string' }, description: 'Biblical refs' },
  },
};

// Build extraction prompt (simplified version)
const prompt = `Extract all Person entities from this document. Return as JSON with "entities" array.

**Entity Type:** Person

**Schema:**
${JSON.stringify(PERSON_SCHEMA, null, 2)}

**Document:**
${DOCUMENT_CONTENT}`;

console.log("=== PROMPT ===");
console.log(prompt);
console.log("\n=== STATS ===");
console.log(`Prompt length: ${prompt.length} chars`);
console.log(`Document length: ${DOCUMENT_CONTENT.length} chars`);
console.log(`Schema length: ${JSON.stringify(PERSON_SCHEMA).length} chars`);
