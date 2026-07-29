import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @MessagePattern({ cmd: 'invitation_create' })
  invite(
    @Payload()
    dto: { projectId: string; userId: string; projectRoleId: string; invitedBy: string },
  ) {
    return this.invitationsService.invite(dto);
  }

  @MessagePattern({ cmd: 'invitation_find_for_user' })
  findForUser(@Payload() dto: { userId: string }) {
    return this.invitationsService.findForUser(dto.userId);
  }

  @MessagePattern({ cmd: 'invitation_find_for_project' })
  findForProject(@Payload() dto: { projectId: string }) {
    return this.invitationsService.findForProject(dto.projectId);
  }

  @MessagePattern({ cmd: 'invitation_accept' })
  accept(@Payload() dto: { invitationId: string; userId: string }) {
    return this.invitationsService.accept(dto);
  }

  @MessagePattern({ cmd: 'invitation_reject' })
  reject(@Payload() dto: { invitationId: string; userId: string }) {
    return this.invitationsService.reject(dto);
  }

  @MessagePattern({ cmd: 'invitation_cancel' })
  cancel(@Payload() dto: { invitationId: string; projectId: string }) {
    return this.invitationsService.cancel(dto);
  }

  @MessagePattern({ cmd: 'project_leave' })
  leave(@Payload() dto: { projectId: string; userId: string }) {
    return this.invitationsService.leave(dto);
  }
}
