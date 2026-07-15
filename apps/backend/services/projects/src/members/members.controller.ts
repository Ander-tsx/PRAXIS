import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AddMemberDto,
  RemoveMemberDto,
} from '@praxis/contracts';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @MessagePattern({ cmd: 'member_add' })
  addMember(@Payload() dto: AddMemberDto) {
    return this.membersService.addMember(dto);
  }

  @MessagePattern({ cmd: 'member_remove' })
  removeMember(@Payload() dto: RemoveMemberDto) {
    return this.membersService.removeMember(dto);
  }

  @MessagePattern({ cmd: 'member_find_all' })
  findMembers(@Payload() dto: { projectId: string }) {
    return this.membersService.findMembers(dto.projectId);
  }
}
