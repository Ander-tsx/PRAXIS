import { Module } from '@nestjs/common';
import { ProjectRolesModule } from '../project-roles/project-roles.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [ProjectRolesModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
