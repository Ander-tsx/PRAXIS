import { Module } from '@nestjs/common';
import { AlexaAuthModule } from '../alexa-auth/alexa-auth.module';
import { ClientsProxyModule } from '../clients/clients.module';
import { VoiceProjectsController } from './voice-projects.controller';
import { VoiceProjectsService } from './voice-projects.service';

@Module({
  imports: [ClientsProxyModule, AlexaAuthModule],
  controllers: [VoiceProjectsController],
  providers: [VoiceProjectsService],
})
export class VoiceProjectsModule {}
