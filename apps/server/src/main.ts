import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { AppConfigService } from './common/config/config.service';
import {
  ValidationPipe,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseReadinessInterceptor } from './common/interceptors/database-readiness.interceptor';
import { HttpLoggerInterceptor } from './common/interceptors/http-logger.interceptor';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { FileLogger } from './common/logger/file-logger.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

/**
 * Validate critical environment variables before starting the server
 * Fails fast with clear error messages if required vars are missing
 */
function validateEnvironment() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // Skip validation in test environment (tests set their own env)
  if (isTest) {
    return;
  }

  // Critical: Database connection (ALWAYS required)
  const requiredVars = [
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`❌ ${varName} is required`);
    }
  }

  // Critical in production: Encryption key
  if (isProduction && !process.env.INTEGRATION_ENCRYPTION_KEY) {
    errors.push(
      '❌ INTEGRATION_ENCRYPTION_KEY is required in production (32+ chars)'
    );
  }

  // Required if using Vertex AI embeddings
  if (process.env.EMBEDDING_PROVIDER === 'vertex') {
    if (!process.env.VERTEX_AI_LOCATION) {
      errors.push(
        '❌ VERTEX_AI_LOCATION is required when EMBEDDING_PROVIDER=vertex'
      );
    }
    if (!process.env.GCP_PROJECT_ID) {
      errors.push('❌ GCP_PROJECT_ID is required for Vertex AI');
    }
  }

  // Warnings for missing optional but recommended vars
  if (!process.env.INTEGRATION_ENCRYPTION_KEY && !isProduction) {
    warnings.push(
      '⚠️  INTEGRATION_ENCRYPTION_KEY not set - credentials will be stored unencrypted'
    );
    warnings.push('   Generate with: openssl rand -base64 24');
  }

  // Print results
  if (errors.length > 0) {
    console.error('\n❌ Environment Validation Failed:\n');
    errors.forEach((err) => console.error(`  ${err}`));
    console.error('\n💡 Tip: Copy .env.example to .env and fill in the values');
    console.error('💡 See docs/ENV_FALLBACK_AUDIT.md for details\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment Warnings:\n');
    warnings.forEach((warn) => console.warn(`  ${warn}`));
    console.warn('');
  }

  console.log('✅ Environment validation passed\n');
}

async function bootstrap() {
  // Load Infisical secrets before anything else
  const { initializeInfisical } = await import('./config/infisical-loader');
  await initializeInfisical();
  
  // Validate environment before doing anything else
  validateEnvironment();

  // Debug: LangSmith configuration
  console.log('\n🔍 LangSmith Configuration:');
  console.log(`   LANGSMITH_TRACING: ${process.env.LANGSMITH_TRACING}`);
  console.log(
    `   LANGSMITH_API_KEY: ${
      process.env.LANGSMITH_API_KEY ? '***set***' : 'NOT SET'
    }`
  );
  console.log(
    `   LANGSMITH_PROJECT: ${process.env.LANGSMITH_PROJECT || 'NOT SET'}`
  );
  console.log(
    `   LANGSMITH_ENDPOINT: ${process.env.LANGSMITH_ENDPOINT || 'NOT SET'}`
  );

  // Initialize LangSmith tracing if enabled
  const langsmithEnabled =
    process.env.LANGSMITH_TRACING?.toLowerCase() === 'true';
  if (langsmithEnabled && process.env.LANGSMITH_API_KEY) {
    console.log('   Setting LangChain environment variables for tracing...');
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY;
    if (process.env.LANGSMITH_ENDPOINT) {
      process.env.LANGCHAIN_ENDPOINT = process.env.LANGSMITH_ENDPOINT;
    }
    if (process.env.LANGSMITH_PROJECT) {
      process.env.LANGCHAIN_PROJECT = process.env.LANGSMITH_PROJECT;
    }
    console.log(
      `   ✅ LangSmith tracing enabled (project: ${
        process.env.LANGSMITH_PROJECT || 'default'
      })`
    );
  } else {
    console.log(`   ⏭️  LangSmith tracing disabled`);
  }

  // Debug: Vertex AI configuration
  console.log('\n🔍 Vertex AI Configuration:');
  console.log(
    `   VERTEX_AI_PROJECT_ID: ${process.env.VERTEX_AI_PROJECT_ID || 'NOT SET'}`
  );
  console.log(`   GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID || 'NOT SET'}`);
  console.log(
    `   GOOGLE_CLOUD_PROJECT: ${process.env.GOOGLE_CLOUD_PROJECT || 'NOT SET'}`
  );
  console.log(
    `   VERTEX_AI_LOCATION: ${process.env.VERTEX_AI_LOCATION || 'NOT SET'}`
  );
  console.log(
    `   VERTEX_AI_MODEL: ${process.env.VERTEX_AI_MODEL || 'NOT SET'}`
  );
  console.log(
    `   GOOGLE_APPLICATION_CREDENTIALS: ${
      process.env.GOOGLE_APPLICATION_CREDENTIALS || 'NOT SET'
    }\n`
  );

  // Create file logger instance
  const fileLogger = new FileLogger();

  // Bootstrap the NestJS application first
  const app = await NestFactory.create(AppModule, {
    cors: false,
    // Use both default logger (for console) and file logger
    bufferLogs: true,
  });

  // Set up file logger to capture all logs
  app.useLogger(fileLogger);

  // Fine-grained CORS: allow credentials for local dev origins + production origin from env
  const allowedOrigins = new Set([
    'http://localhost:3000', // common alt
    'http://localhost:3001', // same-port (if ever served together)
    'http://localhost:5173', // Vite default
    'http://localhost:5174', // secondary
    'http://localhost:5175', // legacy admin dev port
    'http://localhost:5176', // current admin dev port
  ]);

  // Add production origin from CORS_ORIGIN env var (can be comma-separated)
  const corsOriginEnv = process.env.CORS_ORIGIN;
  if (corsOriginEnv) {
    corsOriginEnv
      .split(',')
      .forEach((origin) => allowedOrigins.add(origin.trim()));
  }

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser or curl
      if (allowedOrigins.has(origin)) return cb(null, true);
      fileLogger.warn(
        `CORS blocked for origin ${origin}. Allowed: ${Array.from(
          allowedOrigins
        ).join(', ')}`
      );
      return cb(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      transformOptions: { enableImplicitConversion: true },
      validateCustomDecorators: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) =>
          Object.values(e.constraints || {})
        );
        if (!messages.length) {
          return new UnprocessableEntityException({
            message: 'Validation failed',
            code: 'validation-failed',
          });
        }
        return new UnprocessableEntityException({
          error: {
            code: 'validation-failed',
            message: messages[0],
            details: { messages },
          },
        });
      },
    })
  );

  const config = new DocumentBuilder()
    .setTitle('Spec Server API')
    .setDescription(
      'Generated OpenAPI spec (NestJS). NOTE: Each Document MUST belong to a Project and each Project belongs to an Organization. Users with no accessible Projects must create one before using ingestion or search features.'
    )
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, {
      operationIdFactory: (_controllerKey: string, methodKey: string) =>
        methodKey,
    });

  // Inject x-tagGroups post-generation (placeholder groups)
  const document = documentFactory();
  (document as any)['x-tagGroups'] = [
    { name: 'Health & Auth', tags: ['Health', 'Auth'] },
    { name: 'Organizations & Projects', tags: ['Orgs', 'Projects'] },
    { name: 'Configuration', tags: ['Settings'] },
    { name: 'Content & Ingestion', tags: ['Ingestion', 'Documents', 'Chunks'] },
    { name: 'Search', tags: ['Search'] },
    { name: 'Chat', tags: ['Chat'] },
  ];

  const openapiJsonPath = join(process.cwd(), 'openapi.json');
  writeFileSync(openapiJsonPath, JSON.stringify(document, null, 2), 'utf-8');
  const openapiYamlPath = join(process.cwd(), 'openapi.yaml');
  writeFileSync(openapiYamlPath, yaml.dump(document), 'utf-8');

  // Legacy server directory removed; no longer attempt to copy spec there.

  SwaggerModule.setup('api', app, () => document);
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(
    app.get(DatabaseReadinessInterceptor),
    new HttpLoggerInterceptor() // Log all HTTP requests
  );

  const configService = app.get(AppConfigService);
  // Log chat model enablement state (always) for clarity during startup
  const chatEnabled = configService.chatModelEnabled;
  const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'unset';
  const chatModelInfo = {
    enabled: chatEnabled,
    embeddingProvider: embeddingProvider,
    CHAT_MODEL_ENABLED_env: process.env.CHAT_MODEL_ENABLED || 'unset',
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID ? 'present' : 'missing',
  };

  fileLogger.log(
    `[startup] chat-model: ${JSON.stringify(chatModelInfo)}`,
    'Bootstrap'
  );
  // eslint-disable-next-line no-console
  console.log('[startup] chat-model:', chatModelInfo);

  const port = configService.port;
  await app.listen(port);

  const serverInfo = `API listening on http://localhost:${port} (default 3001) (Swagger UI: http://localhost:${port}/api)`;
  fileLogger.log(serverInfo, 'Bootstrap');
  // eslint-disable-next-line no-console
  console.log(serverInfo);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap failure', err);
  const fileLogger = new FileLogger();
  fileLogger.fatal('Bootstrap failure', err.stack, 'Bootstrap');
  process.exit(1);
});
// Test commit
