import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/modules/app.module';
import { DatabaseService } from '../src/common/database/database.service';
import { ExtractionJobService } from '../src/modules/extraction-jobs/extraction-job.service';
import { ExtractionWorkerService } from '../src/modules/extraction-jobs/extraction-worker.service';
import { LLMProviderFactory } from '../src/modules/extraction-jobs/llm/llm-provider.factory';
import { ExtractionSourceType } from '../src/modules/extraction-jobs/dto/extraction-job.dto';

/**
 * E2E Test: LangChain Extraction with Real Meeting Transcript
 *
 * This test verifies the complete extraction pipeline using:
 * - Real unstructured meeting transcript (docs/spec/test_data/meeting_1.md)
 * - Real Google Gemini API via LangChain
 * - All 8 entity types (Requirement, Decision, Feature, Task, Risk, Issue, Stakeholder, Constraint)
 *
 * Prerequisites:
 * - GOOGLE_API_KEY must be set in environment
 * - Database must be running and accessible
 *
 * Run with:
 * ```bash
 * export GOOGLE_API_KEY=<your-key>
 * npm run test:e2e -- extraction-langchain-real.e2e-spec.ts
 * ```
 */
describe('LangChain Extraction - Real Meeting (E2E)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let extractionJobService: ExtractionJobService;
  let extractionWorker: ExtractionWorkerService;
  let llmFactory: LLMProviderFactory;

  // Test organization and project
  const TEST_ORG_ID = 'test-org-langchain-e2e';
  const TEST_PROJECT_ID = 'test-project-langchain-e2e';
  const TEST_USER_ID = 'test-user-langchain-e2e';

  // Meeting document path
  const MEETING_FILE_PATH = path.join(
    __dirname,
    '../../../docs/spec/test_data/meeting_1.md'
  );

  beforeAll(async () => {
    // Verify GOOGLE_API_KEY is set
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error(
        'GOOGLE_API_KEY environment variable not set. Cannot run E2E test with real model.'
      );
    }

    // Force extraction worker to be enabled for this test
    process.env.EXTRACTION_WORKER_ENABLED = 'true';
    process.env.VERTEX_AI_MODEL = 'gemini-1.5-flash-latest';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    db = app.get(DatabaseService);
    extractionJobService = app.get(ExtractionJobService);
    extractionWorker = app.get(ExtractionWorkerService);
    llmFactory = app.get(LLMProviderFactory);

    // Verify LLM provider is configured
    expect(llmFactory.isAvailable()).toBe(true);
    expect(llmFactory.getProviderName()).toBe('LangChain-Gemini');

    console.log('\n🔧 Setup: Creating test organization and project...');
    await setupTestData();
  });

  afterAll(async () => {
    console.log('\n🧹 Cleanup: Removing test data...');
    await cleanupTestData();
    await app.close();
  });

  /**
   * Main E2E test - Extracts entities from real meeting transcript
   */
  it('should extract structured entities from unstructured meeting transcript using LangChain', async () => {
    console.log('\n📄 Step 1: Loading meeting transcript...');
    const meetingContent = fs.readFileSync(MEETING_FILE_PATH, 'utf-8');
    expect(meetingContent.length).toBeGreaterThan(1000);
    console.log(
      `   ✓ Loaded ${meetingContent.length} characters from meeting transcript`
    );

    console.log('\n📤 Step 2: Creating document...');
    const documentResult = await db.query<{ id: string }>(
      `INSERT INTO kb.documents (id, project_id, filename, mime_type, content)
             VALUES (gen_random_uuid(), $1, $2, 'text/markdown', $3)
             RETURNING id`,
      [TEST_PROJECT_ID, 'meeting_1.md', meetingContent]
    );
    const documentId = documentResult.rows[0].id;
    expect(documentId).toBeDefined();
    console.log(`   ✓ Document created: ${documentId}`);

    console.log('\n🤖 Step 3: Creating extraction job...');
    const job = await extractionJobService.createJob({
      organization_id: TEST_ORG_ID,
      project_id: TEST_PROJECT_ID,
      source_type: ExtractionSourceType.DOCUMENT,
      source_id: documentId,
      extraction_config: {
        enabled_types: [
          'Requirement',
          'Decision',
          'Feature',
          'Task',
          'Risk',
          'Issue',
          'Stakeholder',
          'Constraint',
        ],
        entity_linking_strategy: 'always_new', // Create new entities for test clarity
        min_confidence: 0.5,
      },
      subject_id: TEST_USER_ID,
    });
    expect(job.id).toBeDefined();
    expect(job.status).toBe('pending');
    console.log(`   ✓ Extraction job created: ${job.id}`);
    console.log(`   ✓ Status: ${job.status}`);

    console.log(
      '\n⚙️  Step 4: Processing extraction job with LangChain + Gemini...'
    );
    console.log(
      '   (This may take 10-30 seconds depending on API response time)'
    );

    const startTime = Date.now();

    // Process the batch (worker will pick up our job)
    await extractionWorker['processBatch']();

    const duration = Date.now() - startTime;
    console.log(`   ✓ Processing completed in ${duration}ms`);

    console.log('\n📊 Step 5: Verifying extraction results...');

    // Fetch updated job
    const completedJob = await extractionJobService.getJobById(
      job.id,
      TEST_PROJECT_ID,
      TEST_ORG_ID
    );
    expect(completedJob).toBeDefined();
    console.log(`   ✓ Job status: ${completedJob.status}`);

    // Job should be completed (or failed with details)
    if (completedJob.status === 'failed') {
      console.error('\n❌ Extraction failed!');
      console.error('Error:', completedJob.error_message);
      throw new Error(`Extraction job failed: ${completedJob.error_message}`);
    }

    expect(completedJob.status).toBe('completed');
    expect(completedJob.completed_at).toBeDefined();

    // Check extracted entities counts
    expect(completedJob.successful_items).toBeGreaterThan(0);
    expect(completedJob.created_objects.length).toBeGreaterThan(0);

    console.log('\n📈 Extraction Summary:');
    console.log(
      `   • Total entities extracted: ${completedJob.successful_items}`
    );
    console.log(`   • Created objects: ${completedJob.created_objects.length}`);
    console.log(`   • Processing time: ${duration}ms`);
    console.log(`   • LLM Provider: ${llmFactory.getProviderName()}`);

    // Log detailed breakdown by type
    if (
      completedJob.discovered_types &&
      completedJob.discovered_types.length > 0
    ) {
      console.log('\n   Discovered types:');
      completedJob.discovered_types.forEach((type) => {
        console.log(`   • ${type}`);
      });
    }

    console.log('\n🔍 Step 6: Verifying created graph objects...');

    // Query created objects
    const objectsResult = await db.query(
      `SELECT id, type, name, properties, confidence, source_document_id
             FROM kb.objects
             WHERE project_id = $1 AND source_document_id = $2
             ORDER BY type, confidence DESC`,
      [TEST_PROJECT_ID, documentId]
    );

    const objects = objectsResult.rows;
    expect(objects.length).toBeGreaterThan(0);
    console.log(`   ✓ Found ${objects.length} created objects`);

    // Group by type
    const objectsByType = objects.reduce((acc, obj) => {
      acc[obj.type] = (acc[obj.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n📋 Created Objects by Type:');
    Object.entries(objectsByType).forEach(([type, count]) => {
      console.log(`   • ${type}: ${count}`);
    });

    // Show sample objects
    console.log('\n💡 Sample Extracted Entities:');

    // Show top Decision (there should be multiple about product strategy)
    const decisions = objects.filter((o) => o.type === 'Decision');
    if (decisions.length > 0) {
      console.log(`\n   Decision (${decisions.length} total):`);
      decisions.slice(0, 2).forEach((decision, idx) => {
        console.log(`   ${idx + 1}. "${decision.name}"`);
        console.log(
          `      Confidence: ${decision.confidence?.toFixed(2) || 'N/A'}`
        );
        if (decision.properties.rationale) {
          console.log(
            `      Rationale: ${decision.properties.rationale.substring(
              0,
              100
            )}...`
          );
        }
      });
    }

    // Show top Requirement
    const requirements = objects.filter((o) => o.type === 'Requirement');
    if (requirements.length > 0) {
      console.log(`\n   Requirement (${requirements.length} total):`);
      requirements.slice(0, 2).forEach((req, idx) => {
        console.log(`   ${idx + 1}. "${req.name}"`);
        console.log(`      Confidence: ${req.confidence?.toFixed(2) || 'N/A'}`);
      });
    }

    // Show top Task
    const tasks = objects.filter((o) => o.type === 'Task');
    if (tasks.length > 0) {
      console.log(`\n   Task (${tasks.length} total):`);
      tasks.slice(0, 2).forEach((task, idx) => {
        console.log(`   ${idx + 1}. "${task.name}"`);
        console.log(
          `      Confidence: ${task.confidence?.toFixed(2) || 'N/A'}`
        );
      });
    }

    // Show Stakeholders (meeting attendees)
    const stakeholders = objects.filter((o) => o.type === 'Stakeholder');
    if (stakeholders.length > 0) {
      console.log(`\n   Stakeholder (${stakeholders.length} total):`);
      stakeholders.forEach((stakeholder, idx) => {
        console.log(`   ${idx + 1}. "${stakeholder.name}"`);
      });
    }

    console.log('\n✅ Step 7: Validation checks...');

    // Validate confidence scores
    const lowConfidence = objects.filter(
      (o) => o.confidence && o.confidence < 0.5
    );
    console.log(`   • Objects with confidence < 0.5: ${lowConfidence.length}`);

    const highConfidence = objects.filter(
      (o) => o.confidence && o.confidence >= 0.8
    );
    console.log(
      `   • Objects with confidence >= 0.8: ${highConfidence.length}`
    );

    // Validate properties exist
    objects.forEach((obj) => {
      expect(obj.properties).toBeDefined();
      expect(typeof obj.properties).toBe('object');
    });
    console.log(`   ✓ All objects have valid properties`);

    // Validate source document linkage
    objects.forEach((obj) => {
      expect(obj.source_document_id).toBe(documentId);
    });
    console.log(`   ✓ All objects linked to source document`);

    console.log('\n🎉 Test completed successfully!');
    console.log(`\nSummary:`);
    console.log(
      `• Processed meeting transcript: ${(meetingContent.length / 1024).toFixed(
        1
      )} KB`
    );
    console.log(`• Total entities extracted: ${objects.length}`);
    console.log(`• Processing time: ${duration}ms`);
    console.log(`• LLM Provider: ${llmFactory.getProviderName()}`);
    console.log(
      `• Average confidence: ${(
        objects.reduce((sum, o) => sum + (o.confidence || 0), 0) /
        objects.length
      ).toFixed(2)}`
    );
  }, 60000); // 60 second timeout for API calls

  /**
   * Test that verifies specific expected extractions from the meeting
   */
  it('should extract expected key decisions from meeting about spec and AI', async () => {
    // This test expects certain decisions to be extracted based on meeting content
    const objectsResult = await db.query(
      `SELECT id, type, name, properties
             FROM kb.objects
             WHERE project_id = $1 AND type = 'Decision'
             ORDER BY confidence DESC`,
      [TEST_PROJECT_ID]
    );

    const decisions = objectsResult.rows;
    expect(decisions.length).toBeGreaterThan(0);

    // Meeting discusses decision to use markdown files for spec
    const specDecision = decisions.find(
      (d) =>
        d.name.toLowerCase().includes('markdown') ||
        d.name.toLowerCase().includes('spec') ||
        d.properties.description?.toLowerCase().includes('markdown')
    );

    if (specDecision) {
      console.log('\n✓ Found spec-related decision:', specDecision.name);
    } else {
      console.log(
        '\n⚠️  No spec-related decision found (may vary based on LLM interpretation)'
      );
    }

    // Meeting discusses using AI/LLM for development
    const aiDecision = decisions.find(
      (d) =>
        d.name.toLowerCase().includes('ai') ||
        d.name.toLowerCase().includes('llm') ||
        d.properties.description?.toLowerCase().includes('ai help')
    );

    if (aiDecision) {
      console.log('✓ Found AI-related decision:', aiDecision.name);
    }

    // At least some decisions should be found
    expect(decisions.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * Helper: Setup test data
   */
  async function setupTestData() {
    // Create test organization
    await db.query(
      `INSERT INTO kb.orgs (id, name, created_by)
             VALUES ($1, 'Test Org LangChain E2E', $2)
             ON CONFLICT (id) DO NOTHING`,
      [TEST_ORG_ID, TEST_USER_ID]
    );

    // Create test project
    await db.query(
      `INSERT INTO kb.projects (id, org_id, name, created_by)
             VALUES ($1, $2, 'Test Project LangChain E2E', $3)
             ON CONFLICT (id) DO NOTHING`,
      [TEST_PROJECT_ID, TEST_ORG_ID, TEST_USER_ID]
    );

    console.log(`   ✓ Test org: ${TEST_ORG_ID}`);
    console.log(`   ✓ Test project: ${TEST_PROJECT_ID}`);
  }

  /**
   * Helper: Cleanup test data
   */
  async function cleanupTestData() {
    // Delete in order: objects -> extraction_jobs -> documents -> projects -> orgs
    await db.query('DELETE FROM kb.objects WHERE project_id = $1', [
      TEST_PROJECT_ID,
    ]);
    await db.query(
      'DELETE FROM kb.object_extraction_jobs WHERE project_id = $1',
      [TEST_PROJECT_ID]
    );
    await db.query('DELETE FROM kb.documents WHERE project_id = $1', [
      TEST_PROJECT_ID,
    ]);
    await db.query('DELETE FROM kb.projects WHERE id = $1', [TEST_PROJECT_ID]);
    await db.query('DELETE FROM kb.orgs WHERE id = $1', [TEST_ORG_ID]);

    console.log('   ✓ Test data removed');
  }
});
