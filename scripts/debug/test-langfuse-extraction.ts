import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../apps/server/src/modules/app.module';
import { LangChainGeminiProvider } from '../../apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider';
import { LangfuseService } from '../../apps/server/src/modules/langfuse/langfuse.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('DebugLangfuse');

  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    await app.init();

    const langfuseService = app.get(LangfuseService);
    const provider = app.get(LangChainGeminiProvider);

    logger.log('Checking Langfuse status...');
    if (!langfuseService.isEnabled()) {
      logger.error('Langfuse is NOT enabled in this context!');
      process.exit(1);
    }
    logger.log('Langfuse is enabled.');

    // Create a trace
    const traceId = `debug-manual-${Date.now()}`;
    logger.log(`Creating trace: ${traceId}`);

    // We can't use createJobTrace directly as it expects a job ID format sometimes,
    // but let's try to mimic what the worker does.
    // Actually langfuseService.createJobTrace just takes a string ID.
    const createdTraceId = langfuseService.createJobTrace(traceId, {
      name: 'Debug Manual Extraction',
      source: 'script',
    });

    if (!createdTraceId) {
      logger.error('Failed to create trace!');
      process.exit(1);
    }
    logger.log(`Trace created: ${createdTraceId}`);

    // Mock extraction
    const content = 'John Doe works at Acme Corp as a Software Engineer.';
    const prompt = 'Extract entities.';
    const options = {
      objectSchemas: {
        Person: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string' },
          },
        },
        Organization: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
      context: {
        jobId: 'debug-job-123',
        projectId: 'debug-project-123',
        traceId: createdTraceId,
      },
    };

    logger.log('Calling extractEntities...');
    const result = await provider.extractEntities(content, prompt, options);

    logger.log('Extraction complete.');
    logger.log(`Entities found: ${result.entities.length}`);

    // Wait a bit for async flushing
    logger.log('Waiting for flush...');
    await langfuseService.flush();

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

bootstrap();
