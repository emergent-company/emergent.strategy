import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthModule } from '../auth/auth.module';

// Import AuthModule so AuthGuard / ScopesGuard providers (and AuthService) are resolvable when applied at controller level
@Module({
    imports: [AuthModule],
    controllers: [ProjectsController],
    providers: [ProjectsService],
})
export class ProjectsModule { }
