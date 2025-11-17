import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { UserDeletionService } from './user-deletion.service';
import { UserAccessService } from './user-access.service';
import { UserDeletionController } from './user-deletion.controller';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { Project } from '../../entities/project.entity';
import { Integration } from '../../entities/integration.entity';
import { Chunk } from '../../entities/chunk.entity';
import { ObjectExtractionJob } from '../../entities/object-extraction-job.entity';
import { GraphObject } from '../../entities/graph-object.entity';
import { Document } from '../../entities/document.entity';
import { Org } from '../../entities/org.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationMembership,
      ProjectMembership,
      Project,
      Integration,
      Chunk,
      ObjectExtractionJob,
      GraphObject,
      Document,
      Org,
    ]),
    AuthModule,
    UserProfileModule,
  ],
  controllers: [UserDeletionController],
  providers: [UserDeletionService, UserAccessService],
  exports: [UserDeletionService, UserAccessService],
})
export class UserModule {}
