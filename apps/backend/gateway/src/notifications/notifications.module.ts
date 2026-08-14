import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { MyNotificationsController } from './my-notifications.controller';
import { NotificationsStreamService } from './notifications-stream.service';

/**
 * Los avisos viven en projects-service, así que este módulo solo necesita ese
 * cliente. Los eventos de tarea los emite tasks-service por su cuenta: el
 * gateway no participa en la escritura, únicamente en la lectura.
 */
@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: 'PROJECTS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('PROJECTS_SERVICE_HOST'),
            port: config.get<number>('PROJECTS_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [MyNotificationsController],
  providers: [NotificationsStreamService],
})
export class NotificationsModule {}
