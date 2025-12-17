import { Module, Global } from '@nestjs/common';
import { LangfuseService } from './langfuse.service';
import { PromptsController } from './prompts.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PromptsController],
  providers: [LangfuseService],
  exports: [LangfuseService],
})
export class LangfuseModule {}
