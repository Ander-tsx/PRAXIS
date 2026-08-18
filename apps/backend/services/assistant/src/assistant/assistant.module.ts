import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BlobStorageModule } from '../storage/blob-storage.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AttachmentsService } from './attachments.service';
import { ConversationsService } from './conversations.service';
import { GeminiClient } from './gemini.client';
import { QuotaService } from './quota.service';

@Module({
  imports: [PrismaModule, BlobStorageModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    ConversationsService,
    AttachmentsService,
    QuotaService,
    GeminiClient,
  ],
})
export class AssistantModule {}
