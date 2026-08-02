import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { VoiceProjectQueryDto } from '@praxis/contracts';
import { VoiceAnalyticsService } from './voice-analytics.service';

@Controller()
export class VoiceAnalyticsController {
  constructor(private readonly analytics: VoiceAnalyticsService) {}

  @MessagePattern({ cmd: 'alexa_project_progress' })
  progress(@Payload() dto: VoiceProjectQueryDto) {
    return this.analytics.progress(dto);
  }

  @MessagePattern({ cmd: 'alexa_project_productivity_weekly' })
  weeklyProductivity(@Payload() dto: VoiceProjectQueryDto) {
    return this.analytics.weeklyProductivity(dto);
  }

  @MessagePattern({ cmd: 'alexa_project_forecast' })
  forecast(@Payload() dto: VoiceProjectQueryDto) {
    return this.analytics.forecast(dto);
  }

  @MessagePattern({ cmd: 'alexa_project_blocked_tasks' })
  blockedTasks(@Payload() dto: VoiceProjectQueryDto) {
    return this.analytics.blockedTasks(dto);
  }
}
