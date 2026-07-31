import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { CommentsService } from './comments.service';
import { LabelsService } from './labels.service';
import { StatsService } from './stats.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    LabelsService,
    CommentsService,
    AttachmentsService,
    StatsService,
  ],
})
export class TasksModule {}
