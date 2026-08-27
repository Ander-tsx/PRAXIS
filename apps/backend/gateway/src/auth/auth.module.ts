import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth.controller';
import { JwtGuard } from './jwt.guard';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'CREDENTIALS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('CREDENTIALS_SERVICE_HOST'),
            port: config.get<number>('CREDENTIALS_SERVICE_PORT'),
          },
        }),
      },
      /**
       * Solo para crear el espacio personal al registrarse.
       *
       * ⚠️ Se registra **aquí** y no se importa de `BillingModule` porque ese
       * módulo importa a este: cruzarlos daría una dependencia circular. Nest
       * resuelve el cliente en el módulo que lo declara, y declararlo dos veces
       * no cuesta nada — es la misma configuración leída del mismo `.env`.
       */
      {
        name: 'BILLING_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('BILLING_SERVICE_HOST'),
            port: config.get<number>('BILLING_SERVICE_PORT'),
          },
        }),
      },
    ]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [JwtGuard],
  exports: [JwtGuard, JwtModule, ClientsModule],
})
export class AuthModule {}
