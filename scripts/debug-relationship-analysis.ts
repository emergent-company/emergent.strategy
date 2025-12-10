#!/usr/bin/env tsx
/**
 * Debug script to analyze relationship extraction mismatches
 * 
 * This runs a single extraction and compares detailed relationship results
 */

import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppConfigModule } from '../apps/server/src/modules/app-config/app-config.module';
import { LangfuseModule } from '../apps/server/src/modules/langfuse/langfuse.module';
import { LangGraphExtractionProvider } from '../apps/server/src/modules/extraction-jobs/llm/langgraph/langgraph-extraction.provider';
import { LangfuseService } from '../apps/server/src/modules/langfuse/langfuse.service';

// The test document
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

// Minimal schemas for test
const objectSchemas = {
  Person: { type: 'Person', description: 'An individual human', schema: { type: 'object', properties: { name: { type: 'string' } } } },
  Place: { type: 'Place', description: 'A geographic location', schema: { type: 'object', properties: { name: { type: 'string' } } } },
  Group: { type: 'Group', description: 'A collective of people', schema: { type: 'object', properties: { name: { type: 'string' } } } },
};

const relationshipSchemas = {
  MARRIED_TO: { type: 'MARRIED_TO', fromTypes: ['Person'], toTypes: ['Person'], description: 'Spousal relationship (symmetric)' },
  PARENT_OF: { type: 'PARENT_OF', fromTypes: ['Person'], toTypes: ['Person'], description: 'Parent→Child relationship' },
  LIVED_IN: { type: 'LIVED_IN', fromTypes: ['Person'], toTypes: ['Place'], description: 'Residence' },
  TRAVELS_TO: { type: 'TRAVELS_TO', fromTypes: ['Person'], toTypes: ['Place'], description: 'Journey to a place' },
  MEMBER_OF: { type: 'MEMBER_OF', fromTypes: ['Person'], toTypes: ['Group'], description: 'Group membership' },
  LOCATED_IN: { type: 'LOCATED_IN', fromTypes: ['Place'], toTypes: ['Place'], description: 'Geographic containment' },
};

@Module({
  imports: [AppConfigModule, LangfuseModule],
  providers: [LangGraphExtractionProvider],
})
class AnalysisModule {}

async function main() {
  console.log('='.repeat(80));
  console.log('Relationship Analysis: Extracted vs Expected');
  console.log('='.repeat(80));
  
  const app = await NestFactory.createApplicationContext(AnalysisModule, { logger: false });
  const provider = app.get(LangGraphExtractionProvider);
  const langfuse = app.get(LangfuseService);
  
  console.log('\nRunning extraction...\n');
  
  const result = await provider.extract({
    documentText,
    objectSchemas,
    relationshipSchemas,
    allowedTypes: ['Person', 'Place', 'Group'],
    langfuseTraceId: undefined,
    langfuseParentSpanId: undefined,
  });
  
  // Build entity map
  const entityMap = new Map<string, string>();
  for (const e of result.entities) {
    entityMap.set(e.temp_id, e.name);
  }
  
  // Format extracted relationships
  const extractedRels = result.relationships.map(r => ({
    source: entityMap.get(r.source_ref) || r.source_ref,
    target: entityMap.get(r.target_ref) || r.target_ref,
    type: r.type,
    description: r.description,
  }));
  
  console.log('\n' + '='.repeat(80));
  console.log('ENTITIES EXTRACTED:');
  console.log('='.repeat(80));
  for (const e of result.entities) {
    console.log(`  [${e.type}] ${e.name}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('EXTRACTED RELATIONSHIPS:');
  console.log('='.repeat(80));
  for (const r of extractedRels) {
    console.log(`  ${r.source} --[${r.type}]--> ${r.target}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('EXPECTED RELATIONSHIPS:');
  console.log('='.repeat(80));
  for (const r of expectedRelationships) {
    console.log(`  ${r.source} --[${r.type}]--> ${r.target}`);
  }
  
  // Find matches, false positives, false negatives
  const matched = new Set<string>();
  const matchedExtracted = new Set<number>();
  
  // Simple matching (exact source, target, type - or symmetric MARRIED_TO)
  for (const exp of expectedRelationships) {
    const key = `${exp.source}--${exp.type}-->${exp.target}`;
    const keySymmetric = `${exp.target}--${exp.type}-->${exp.source}`;
    
    for (let i = 0; i < extractedRels.length; i++) {
      if (matchedExtracted.has(i)) continue;
      
      const ext = extractedRels[i];
      const extKey = `${ext.source}--${ext.type}-->${ext.target}`;
      
      if (extKey === key || (exp.type === 'MARRIED_TO' && extKey === keySymmetric)) {
        matched.add(key);
        matchedExtracted.add(i);
        break;
      }
      
      // Check inverse (CHILD_OF vs PARENT_OF)
      if (ext.type === 'CHILD_OF' && exp.type === 'PARENT_OF') {
        const invKey = `${ext.target}--PARENT_OF-->${ext.source}`;
        if (invKey === key) {
          matched.add(key);
          matchedExtracted.add(i);
          break;
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('ANALYSIS:');
  console.log('='.repeat(80));
  console.log(`\nExpected: ${expectedRelationships.length}`);
  console.log(`Extracted: ${extractedRels.length}`);
  console.log(`Matched: ${matched.size}`);
  console.log(`Precision: ${(matched.size / extractedRels.length * 100).toFixed(1)}%`);
  console.log(`Recall: ${(matched.size / expectedRelationships.length * 100).toFixed(1)}%`);
  
  console.log('\n' + '-'.repeat(80));
  console.log('FALSE NEGATIVES (Expected but NOT extracted):');
  console.log('-'.repeat(80));
  for (const exp of expectedRelationships) {
    const key = `${exp.source}--${exp.type}-->${exp.target}`;
    if (!matched.has(key)) {
      console.log(`  MISSING: ${exp.source} --[${exp.type}]--> ${exp.target}`);
    }
  }
  
  console.log('\n' + '-'.repeat(80));
  console.log('FALSE POSITIVES (Extracted but NOT expected):');
  console.log('-'.repeat(80));
  for (let i = 0; i < extractedRels.length; i++) {
    if (!matchedExtracted.has(i)) {
      const r = extractedRels[i];
      console.log(`  EXTRA: ${r.source} --[${r.type}]--> ${r.target}`);
    }
  }
  
  await langfuse.shutdown();
  await app.close();
}

main().catch(console.error);
