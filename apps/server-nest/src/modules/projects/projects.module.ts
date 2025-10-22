import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthModule } from '../auth/auth.module';
import { TemplatePackModule } from '../template-packs/template-pack.module';

// Import AuthModule so AuthGuard / ScopesGuard providers (and AuthService) are resolvable when applied at controller level
@Module({
    imports: [AuthModule, TemplatePackModule],
    controllers: [ProjectsController],
    providers: [ProjectsService],
    exports: [ProjectsService], // Export so other modules can inject ProjectsService
})
export class ProjectsModule { }
