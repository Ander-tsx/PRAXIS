import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { VoiceMemberQueryDto, VoiceProjectQueryDto } from '@praxis/contracts';
import { VoiceTeamService } from './voice-team.service';

@Controller()
export class VoiceTeamController {
  constructor(private readonly team: VoiceTeamService) {}

  @MessagePattern({ cmd: 'alexa_project_members' })
  members(@Payload() dto: VoiceProjectQueryDto) {
    return this.team.members(dto);
  }

  @MessagePattern({ cmd: 'alexa_project_workload' })
  workload(@Payload() dto: VoiceProjectQueryDto) {
    return this.team.workload(dto);
  }

  @MessagePattern({ cmd: 'alexa_member_performance' })
  memberPerformance(@Payload() dto: VoiceMemberQueryDto) {
    return this.team.memberPerformance(dto);
  }
}
