#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(process.cwd());
const MASTER_FILE = path.join(ROOT_DIR, 'docs/internal/agent-instructions-master.md');
const COPILOT_OUTPUT_FILE = path.join(ROOT_DIR, '.github/copilot-instructions.md');
const OPENCODE_OUTPUT_FILE = path.join(ROOT_DIR, '.opencode/instructions.md');

async function parseMasterFile() {
  const content = await fs.readFile(MASTER_FILE, 'utf-8');
  
  const sharedContent = content.match(/<!-- START:SHARED -->(.*)<!-- END:SHARED -->/s)?.[1].trim() || '';
  const copilotOnlyContent = content.match(/<!-- START:COPILOT_ONLY -->(.*)<!-- END:COPILOT_ONLY -->/s)?.[1].trim() || '';
  const opencodeOnlyContent = content.match(/<!-- START:OPENCODE_ONLY -->(.*)<!-- END:OPENCODE_ONLY -->/s)?.[1].trim() || '';

  return { sharedContent, copilotOnlyContent, opencodeOnlyContent };
}

async function generateCopilotFile(shared, copilotOnly) {
  const finalContent = [shared, copilotOnly].filter(Boolean).join('\n\n');
  await fs.writeFile(COPILOT_OUTPUT_FILE, finalContent);
  console.log(`✅ Copilot instructions written to ${COPILOT_OUTPUT_FILE}`);
}

async function generateOpencodeFile(shared, opencodeOnly) {
  const finalContent = [opencodeOnly, shared].filter(Boolean).join('\n');
  await fs.writeFile(OPENCODE_OUTPUT_FILE, finalContent);
  console.log(`✅ Opencode.ai instructions written to ${OPENCODE_OUTPUT_FILE}`);
}

async function main() {
  try {
    console.log('Parsing master instruction file...');
    const { sharedContent, copilotOnlyContent, opencodeOnlyContent } = await parseMasterFile();

    if (!sharedContent) {
      console.error('❌ Could not find shared content in master file. Aborting.');
      process.exit(1);
    }

    await generateCopilotFile(sharedContent, copilotOnlyContent);
    await generateOpencodeFile(sharedContent, opencodeOnlyContent);

    console.log('\n🎉 Instruction files synced successfully!');
  } catch (error) {
    console.error('❌ An error occurred during the sync process:', error);
    process.exit(1);
  }
}

main();
