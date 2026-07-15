import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { RolesController } from './roles.controller';

@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: 'ROLES_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('ROLES_SERVICE_HOST'),
            port: config.get<number>('ROLES_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [RolesController],
})
export class RolesModule {}
