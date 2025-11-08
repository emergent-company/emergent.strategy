import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeRegistryController } from './type-registry.controller';
import { TypeRegistryService } from './type-registry.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectObjectTypeRegistry } from '../../entities/project-object-type-registry.entity';

/**
 * Module for managing project-level type registry
 * Provides CRUD operations for object types and schema validation
 */
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TypeOrmModule.forFeature([ProjectObjectTypeRegistry]),
  ],
  controllers: [TypeRegistryController],
  providers: [TypeRegistryService],
  exports: [TypeRegistryService],
})
export class TypeRegistryModule {}
