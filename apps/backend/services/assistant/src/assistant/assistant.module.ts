import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BlobStorageModule } from '../storage/blob-storage.module';
import { AlcanceService } from './alcance.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AttachmentsService } from './attachments.service';
import { ConsultasService } from './consultas';
import { ConversationsService } from './conversations.service';
import { GeminiClient } from './gemini.client';
import { QuotaService } from './quota.service';
import { RouterDeContexto } from './router';

@Module({
  imports: [PrismaModule, BlobStorageModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AlcanceService,
    ConsultasService,
    RouterDeContexto,
    ConversationsService,
    AttachmentsService,
    QuotaService,
    GeminiClient,
  ],
})
export class AssistantModule {}
