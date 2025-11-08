import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthModule } from '../auth/auth.module';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { Project } from '../../entities/project.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { Org } from '../../entities/org.entity';

// Import AuthModule so AuthGuard / ScopesGuard providers (and AuthService) are resolvable when applied at controller level
@Module({
    imports: [
        TypeOrmModule.forFeature([Project, ProjectMembership, Org]),
        AuthModule, 
        TemplatePackModule
    ],
    controllers: [ProjectsController],
    providers: [ProjectsService],
    exports: [ProjectsService], // Export so other modules can inject ProjectsService
})
export class ProjectsModule { }
