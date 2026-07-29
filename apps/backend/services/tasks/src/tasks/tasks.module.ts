import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { LabelsService } from './labels.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, LabelsService, CommentsService],
})
export class TasksModule {}
