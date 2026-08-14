import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectRolesModule } from '../project-roles/project-roles.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [NotificationsModule, ProjectRolesModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
