#!/usr/bin/env npx tsx
/**
 * Test LangGraph extraction with Langfuse tracing
 * This creates a trace and runs the extraction through the actual provider
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../apps/server/src/modules/app.module';
import { LangfuseService } from '../../apps/server/src/modules/langfuse/langfuse.service';
import { LangGraphExtractionProvider } from '../../apps/server/src/modules/extraction-jobs/llm/langgraph-extraction.provider';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('LangGraphExtractionTest');

  try {
    logger.log('Starting NestJS application context...');
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    await app.init();

    const langfuseService = app.get(LangfuseService);
    const provider = app.get(LangGraphExtractionProvider);

    logger.log('Checking Langfuse status...');
    if (!langfuseService.isEnabled()) {
      logger.warn('Langfuse is NOT enabled - traces will not be recorded');
    } else {
      logger.log('Langfuse is enabled.');
    }

    // Create a trace
    const traceId = `debug-langgraph-${Date.now()}`;
    logger.log(`Creating trace: ${traceId}`);

    const createdTraceId = langfuseService.createJobTrace(traceId, {
      name: 'Debug LangGraph Extraction',
      source: 'script',
    });

    if (!createdTraceId) {
      logger.error('Failed to create trace!');
      process.exit(1);
    }
    logger.log(`Trace created: ${createdTraceId}`);

    // Sample document content
    const documentContent = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever:
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
4. I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father.
5. And now I ask you, dear lady — not as though I were writing you a new commandment, but the one we have had from the beginning — that we love one another.
6. And this is love, that we walk according to his commandments; this is the commandment, just as you have heard from the beginning, so that you should walk in it.
7. For many deceivers have gone out into the world, those who do not confess the coming of Jesus Christ in the flesh. Such a one is the deceiver and the antichrist.`;

    // Object schemas
    const objectSchemas: Record<string, any> = {
      Person: { description: 'A human individual' },
      Place: { description: 'A location or geographic entity' },
      Event: { description: 'A notable occurrence or happening' },
      Book: { description: 'A written work or scripture' },
      Quote: { description: 'A significant statement or teaching' },
      Group: { description: 'A collection of people' },
      Object: { description: 'A physical or abstract thing' },
    };

    logger.log('Running extraction via LangGraphExtractionProvider...');
    const startTime = Date.now();

    // Run extraction using the provider
    const result = await provider.extractEntities(documentContent, '', {
      objectSchemas,
      context: {
        jobId: 'debug-job',
        projectId: 'debug-project',
        traceId: createdTraceId,
      },
    });

    const elapsed = Date.now() - startTime;
    logger.log(`Extraction complete in ${elapsed}ms`);
    logger.log(`Entities found: ${result.entities?.length || 0}`);
    logger.log(`Relationships found: ${result.relationships?.length || 0}`);

    if (result.entities?.length > 0) {
      logger.log('\nExtracted Entities:');
      for (const entity of result.entities.slice(0, 10)) {
        logger.log(`  - ${entity.name} (${entity.type}): ${entity.description || 'N/A'}`);
      }
      if (result.entities.length > 10) {
        logger.log(`  ... and ${result.entities.length - 10} more`);
      }
    }

    // Flush traces
    logger.log('\nFlushing Langfuse traces...');
    await langfuseService.flush();

    logger.log(`\n✅ Test complete!`);
    logger.log(`📊 Trace ID: ${createdTraceId}`);
    logger.log(`🔗 View in Langfuse: http://localhost:3011/project/*/traces/${createdTraceId}`);

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

bootstrap();
