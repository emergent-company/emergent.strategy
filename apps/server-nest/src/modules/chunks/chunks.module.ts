import { Module } from '@nestjs/common';
import { ChunksController } from './chunks.controller';
import { ChunksService } from './chunks.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [DatabaseModule, AuthModule], controllers: [ChunksController], providers: [ChunksService], exports: [ChunksService] })
export class ChunksModule { }
