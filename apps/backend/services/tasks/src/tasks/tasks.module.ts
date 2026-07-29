import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { CommentsService } from './comments.service';
import { LabelsService } from './labels.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, LabelsService, CommentsService, AttachmentsService],
})
export class TasksModule {}
