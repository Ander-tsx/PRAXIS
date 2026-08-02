import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { VoiceProjectsQueryDto } from '@praxis/contracts';
import { VoiceProjectsService } from './voice-projects.service';

@Controller()
export class VoiceProjectsController {
  constructor(private readonly voiceProjectsService: VoiceProjectsService) {}

  @MessagePattern({ cmd: 'alexa_projects_find_all' })
  findAll(@Payload() dto: VoiceProjectsQueryDto) {
    return this.voiceProjectsService.findAll(dto);
  }
}
