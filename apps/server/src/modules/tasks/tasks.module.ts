import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../../entities/task.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GraphModule } from '../graph/graph.module';
import { DatabaseModule } from '../../common/database/database.module';
import { ChatUiModule } from '../chat-ui/chat-ui.module';
import { MergeSuggestionService } from './merge-suggestion.service';
import { MergeSuggestionPromptBuilder } from './merge-suggestion-prompt-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, UserProfile, UserEmail]),
    AuthModule,
    NotificationsModule, // For marking notifications as read when resolving tasks
    forwardRef(() => GraphModule), // For executing merge operations
    DatabaseModule, // For merge suggestion service
    ChatUiModule, // For LangGraph service
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    MergeSuggestionService,
    MergeSuggestionPromptBuilder,
  ],
  exports: [TasksService, MergeSuggestionService],
})
export class TasksModule {}
