import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphObjectsController } from './graph.controller';
import { GraphEmbeddingsController } from './graph-embeddings.controller';
import { GraphService } from './graph.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { AppConfigService } from '../../common/config/config.service';
import { AuthModule } from '../auth/auth.module';
import { SchemaRegistryService } from './schema-registry.service';
import { BranchService } from './branch.service';
import { TypeRegistryModule } from '../type-registry/type-registry.module';
import { BranchController } from './branch.controller';
import { EmbeddingJobsService } from './embedding-jobs.service';
import { EmbeddingPolicyService } from './embedding-policy.service';
import { EmbeddingWorkerService } from './embedding-worker.service';
import { DummySha256EmbeddingProvider } from './embedding.provider';
import { GoogleVertexEmbeddingProvider } from './google-vertex-embedding.provider';
import { GraphVectorSearchService } from './graph-vector-search.service';
import { ProductVersionService } from './product-version.service';
import { ProductVersionController } from './product-version.controller';
import { TagService } from './tag.service';
import { TagController } from './tag.controller';
import { TagCleanupWorkerService } from './tag-cleanup-worker.service';
import { RevisionCountRefreshWorkerService } from './revision-count-refresh-worker.service';
import { RedactionInterceptor } from './redaction.interceptor';
import { ObjectMergeService } from './object-merge.service';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TasksModule } from '../tasks/tasks.module';
import { Tag } from '../../entities/tag.entity';
import { ProductVersion } from '../../entities/product-version.entity';
import { ProductVersionMember } from '../../entities/product-version-member.entity';
import { Branch } from '../../entities/branch.entity';
import { EmbeddingPolicy } from '../../entities/embedding-policy.entity';
import { GraphEmbeddingJob } from '../../entities/graph-embedding-job.entity';
import { GraphObject } from '../../entities/graph-object.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tag,
      ProductVersion,
      ProductVersionMember,
      Branch,
      EmbeddingPolicy,
      GraphEmbeddingJob,
      GraphObject,
    ]),
    DatabaseModule,
    AppConfigModule,
    AuthModule,
    TypeRegistryModule,
    forwardRef(() => TasksModule),
  ],
  controllers: [
    GraphObjectsController,
    GraphEmbeddingsController,
    BranchController,
    ProductVersionController,
    TagController,
  ],
  providers: [
    GraphService,
    SchemaRegistryService,
    BranchService,
    ProductVersionService,
    TagService,
    TagCleanupWorkerService,
    RevisionCountRefreshWorkerService,
    EmbeddingJobsService,
    EmbeddingPolicyService,
    ObjectMergeService,
    {
      provide: 'EMBEDDING_PROVIDER',
      useFactory: (config: AppConfigService) => {
        const provider = process.env.EMBEDDING_PROVIDER?.toLowerCase();
        if (provider === 'vertex' || provider === 'google') {
          return new GoogleVertexEmbeddingProvider(config);
        }
        return new DummySha256EmbeddingProvider();
      },
      inject: [AppConfigService],
    },
    EmbeddingWorkerService,
    GraphVectorSearchService,
    // Phase 3 Task 8a: Redaction Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: RedactionInterceptor,
    },
  ],
  exports: [
    GraphService,
    BranchService,
    EmbeddingJobsService,
    GraphVectorSearchService,
    ProductVersionService,
    TagService,
    ObjectMergeService,
    'EMBEDDING_PROVIDER',
  ],
})
export class GraphModule {}
