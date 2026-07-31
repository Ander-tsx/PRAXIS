import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ConversationsService } from './conversations.service';
import { GeminiClient } from './gemini.client';
import { QuotaService } from './quota.service';

@Module({
  imports: [PrismaModule],
  controllers: [AssistantController],
  providers: [AssistantService, ConversationsService, QuotaService, GeminiClient],
})
export class AssistantModule {}
