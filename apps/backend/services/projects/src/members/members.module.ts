import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { ProjectRolesModule } from '../project-roles/project-roles.module';

@Module({
  imports: [ProjectRolesModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
