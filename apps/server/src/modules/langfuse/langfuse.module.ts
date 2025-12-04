import { Module, Global } from '@nestjs/common';
import { LangfuseService } from './langfuse.service';

@Global()
@Module({
  providers: [LangfuseService],
  exports: [LangfuseService],
})
export class LangfuseModule {}
