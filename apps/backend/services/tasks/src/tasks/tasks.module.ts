import { Module } from '@nestjs/common';
import { LabelsService } from './labels.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, LabelsService],
})
export class TasksModule {}
