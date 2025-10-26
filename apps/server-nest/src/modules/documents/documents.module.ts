import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';
import { HashService } from '../../common/utils/hash.service';

// Import AuthModule so AuthGuard/AuthService are available; controller applies guard.
@Module({
    imports: [AuthModule],
    controllers: [DocumentsController],
    providers: [DocumentsService, HashService],
    exports: [DocumentsService],
})
export class DocumentsModule { }
