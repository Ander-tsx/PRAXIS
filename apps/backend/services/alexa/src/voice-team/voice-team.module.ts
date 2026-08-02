import { Module } from '@nestjs/common';
import { AlexaAuthModule } from '../alexa-auth/alexa-auth.module';
import { ClientsProxyModule } from '../clients/clients.module';
import { VoiceTeamController } from './voice-team.controller';
import { VoiceTeamService } from './voice-team.service';

@Module({
  imports: [ClientsProxyModule, AlexaAuthModule],
  controllers: [VoiceTeamController],
  providers: [VoiceTeamService],
})
export class VoiceTeamModule {}
