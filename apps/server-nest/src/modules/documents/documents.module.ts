import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';
import { HashService } from '../../common/utils/hash.service';
import { Document } from '../../entities/document.entity';
import { Chunk } from '../../entities/chunk.entity';
import { Project } from '../../entities/project.entity';

// Import AuthModule so AuthGuard/AuthService are available; controller applies guard.
@Module({
    imports: [
        TypeOrmModule.forFeature([Document, Chunk, Project]),
        AuthModule,
    ],
    controllers: [DocumentsController],
    providers: [DocumentsService, HashService],
    exports: [DocumentsService],
})
export class DocumentsModule { }
