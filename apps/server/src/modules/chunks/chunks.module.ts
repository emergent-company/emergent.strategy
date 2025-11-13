import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChunksController } from './chunks.controller';
import { ChunksService } from './chunks.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { Chunk } from '../../entities/chunk.entity';
import { Document } from '../../entities/document.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chunk, Document]),
    DatabaseModule,
    AuthModule,
  ],
  controllers: [ChunksController],
  providers: [ChunksService],
  exports: [ChunksService],
})
export class ChunksModule {}
