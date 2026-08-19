import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'PROJECTS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('PROJECTS_SERVICE_HOST'),
            port: config.get('PROJECTS_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
