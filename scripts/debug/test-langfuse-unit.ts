import { LangfuseService } from '../../apps/server/src/modules/langfuse/langfuse.service';
import { LangChainGeminiProvider } from '../../apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider';
import { Logger } from '@nestjs/common';

// Mock Config Service
const mockConfig = {
  langfuseEnabled: true,
  langfuseHost: process.env.LANGFUSE_HOST,
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
  langfuseFlushAt: 1,
  langfuseFlushInterval: 1000,
  vertexAiModel: 'gemini-2.5-flash-lite',
  vertexAiProjectId: process.env.VERTEX_AI_PROJECT_ID || 'spec-server-dev',
  vertexAiLocation: process.env.VERTEX_AI_LOCATION || 'europe-central2',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || 'spec-server-dev',
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || 'europe-central2',
  llmTimeoutMs: 60000,
  // Add getters expected by service
  get: (key: string) => {
    if (key === 'VERTEX_AI_MODEL') return 'gemini-2.5-flash-lite';
    return null;
  },
};

async function run() {
  const logger = new Logger('Test');
  console.log('Starting manual test...');

  // 1. Initialize LangfuseService
  const langfuseService = new LangfuseService(mockConfig as any);

  // Manually call onModuleInit
  langfuseService.onModuleInit();

  if (!langfuseService.isEnabled()) {
    console.error('Langfuse not enabled');
    return;
  }
  console.log('Langfuse initialized.');

  // 2. Initialize Provider
  const provider = new LangChainGeminiProvider(
    mockConfig as any,
    langfuseService
  );

  // 3. Create Trace
  const traceId = `manual-unit-${Date.now()}`;
  console.log(`Creating trace with ID: ${traceId}`);
  const jobTraceId = langfuseService.createJobTrace(traceId, {
    name: 'Manual Unit Test Trace',
  });
  console.log(`Trace created: ${jobTraceId}`);

  if (!jobTraceId) {
    console.error('Failed to create trace ID');
    return;
  }

  // 4. Mock extraction call
  // We'll create a mock context and call extractEntitiesForType directly if possible,
  // or call extractEntities

  const content = 'John Smith is a developer at Google.';
  const prompt = 'Extract people.';

  const options = {
    objectSchemas: {
      Person: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          company: { type: 'string' },
        },
      },
    },
    context: {
      jobId: traceId,
      projectId: 'test-project',
      traceId: jobTraceId,
    },
  };

  console.log('Calling extractEntities...');
  try {
    // access private method if needed? No, extractEntities is public.
    const result = await provider.extractEntities(content, prompt, options);
    console.log('Extraction result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Extraction failed:', e);
  }

  console.log('Flushing Langfuse...');
  await langfuseService.flush();
  console.log('Done.');
}

run().catch(console.error);
