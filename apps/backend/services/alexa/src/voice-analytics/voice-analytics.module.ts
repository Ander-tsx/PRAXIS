import { Module } from '@nestjs/common';
import { AlexaAuthModule } from '../alexa-auth/alexa-auth.module';
import { ClientsProxyModule } from '../clients/clients.module';
import { VoiceAnalyticsController } from './voice-analytics.controller';
import { VoiceAnalyticsService } from './voice-analytics.service';

@Module({
  imports: [ClientsProxyModule, AlexaAuthModule],
  controllers: [VoiceAnalyticsController],
  providers: [VoiceAnalyticsService],
})
export class VoiceAnalyticsModule {}
