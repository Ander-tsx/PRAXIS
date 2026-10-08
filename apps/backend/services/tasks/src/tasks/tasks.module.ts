import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { CommentsService } from './comments.service';
import { CustomFieldsService } from './custom-fields.service';
import { LabelsService } from './labels.service';
import { StatsService } from './stats.service';
import { TaskLinksService } from './task-links.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    LabelsService,
    CustomFieldsService,
    TaskLinksService,
    CommentsService,
    AttachmentsService,
    StatsService,
  ],
})
export class TasksModule {}
