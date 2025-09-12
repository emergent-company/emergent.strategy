import { Module } from '@nestjs/common';
import { ChunksController } from './chunks.controller';
import { ChunksService } from './chunks.service';
import { DatabaseModule } from '../../common/database/database.module';
@Module({ imports: [DatabaseModule], controllers: [ChunksController], providers: [ChunksService], exports: [ChunksService] })
export class ChunksModule { }
