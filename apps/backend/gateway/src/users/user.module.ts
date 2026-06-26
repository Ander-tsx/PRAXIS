import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UserController } from './user.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'USER_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('USER_SERVICE_HOST'),
            port: config.get<number>('USER_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [UserController],
  providers: [],
  exports: [],
})
export class UserModule {}
