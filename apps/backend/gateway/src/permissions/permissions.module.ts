import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: 'PERMISSIONS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('PERMISSIONS_SERVICE_HOST'),
            port: config.get<number>('PERMISSIONS_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [PermissionsController],
  exports: [ClientsModule],
})
export class PermissionsModule {}
