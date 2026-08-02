import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { AlexaTokenGuard } from '../common/guards/alexa-token.guard';
import { AlexaAuthController } from './alexa-auth.controller';
import { AlexaVoiceController } from './alexa-voice.controller';

@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: 'ALEXA_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('ALEXA_SERVICE_HOST'),
            port: config.get<number>('ALEXA_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [AlexaAuthController, AlexaVoiceController],
  providers: [AlexaTokenGuard],
})
export class AlexaModule {}
