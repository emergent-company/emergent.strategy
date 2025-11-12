import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { Org } from '../../entities/org.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Org, OrganizationMembership]),
    AuthModule,
  ],
  controllers: [OrgsController],
  providers: [OrgsService],
})
export class OrgsModule {}
