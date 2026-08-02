import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsProxyModule } from '../clients/clients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AlexaAuthController } from './alexa-auth.controller';
import { AlexaAuthService } from './alexa-auth.service';
import { CleanupAlexaAuthJob } from './cleanup-alexa-auth.job';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule, ClientsProxyModule],
  controllers: [AlexaAuthController],
  providers: [AlexaAuthService, CleanupAlexaAuthJob],
  exports: [AlexaAuthService],
})
export class AlexaAuthModule {}
