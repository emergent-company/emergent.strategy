/**
 * Document Router Prompts
 *
 * Prompts for classifying documents into categories (narrative, legal, technical, other)
 * to select the most appropriate extraction strategy.
 */

import { DocumentCategory } from '../state';

/**
 * System prompt for document classification
 */
export const ROUTER_SYSTEM_PROMPT = `You are a document classification expert. Your job is to analyze the given text and determine its primary category.

Classify the document into ONE of these categories:

1. **narrative** - Stories, religious texts, historical accounts, biographical content, fiction, news articles
   - Contains characters, events, dialogue, or storytelling elements
   - Examples: Bible chapters, novels, biographies, historical narratives

2. **legal** - Contracts, agreements, terms of service, regulations, policies
   - Contains formal legal language, clauses, obligations, rights
   - Examples: NDAs, service agreements, compliance documents

3. **technical** - Software documentation, architecture specs, APIs, system designs
   - Contains technical terminology, code, diagrams, specifications
   - Examples: API docs, architecture decision records, technical specs

4. **other** - Documents that don't clearly fit the above categories
   - Meeting notes, general business documents, mixed content

Respond with your classification and a brief reasoning.`;

/**
 * Build the user prompt with the document content
 */
export function buildRouterUserPrompt(documentText: string): string {
  // Limit text length for classification (first 2000 chars is usually enough)
  const sampleText = documentText.slice(0, 2000);

  return `Classify the following document:

---
${sampleText}
---

What category best describes this document?`;
}

/**
 * Parse the router response to extract category
 */
export function parseRouterResponse(response: string): DocumentCategory {
  const lowerResponse = response.toLowerCase();

  if (lowerResponse.includes('narrative')) {
    return 'narrative';
  }
  if (lowerResponse.includes('legal')) {
    return 'legal';
  }
  if (lowerResponse.includes('technical')) {
    return 'technical';
  }

  return 'other';
}

/**
 * Get extraction focus hints based on document category
 */
export function getCategoryExtractionHints(category: DocumentCategory): string {
  switch (category) {
    case 'narrative':
      return `Focus on:
- Characters (people, beings, groups)
- Events and actions
- Locations and settings
- Relationships between characters
- Temporal sequences (what happened when)
- Cause-and-effect chains`;

    case 'legal':
      return `Focus on:
- Parties involved (organizations, individuals)
- Obligations and responsibilities
- Rights and permissions
- Conditions and constraints
- Dates and deadlines
- Penalties and remedies`;

    case 'technical':
      return `Focus on:
- Systems and components
- APIs and interfaces
- Data flows and processes
- Dependencies and requirements
- Configurations and parameters
- Constraints and limitations`;

    case 'other':
    default:
      return `Focus on:
- Key entities mentioned
- Actions and decisions
- Relationships between entities
- Important facts and data points`;
  }
}
