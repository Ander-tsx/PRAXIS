import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

/** Cliente TCP preparado para bloques posteriores; este bloque no expone rutas HTTP. */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'AUTOMATION_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('AUTOMATION_SERVICE_HOST'),
            port: config.get<number>('AUTOMATION_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
})
export class AutomationModule {}
