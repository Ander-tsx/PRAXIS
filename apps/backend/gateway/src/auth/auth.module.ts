import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthController } from './auth.controller';
import { JwtGuard } from './jwt.guard';
import { ModoLocalGuard } from './modo-local.guard';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      clienteDeServicio('CREDENTIALS'),
      /**
       * Solo para crear el espacio personal al registrarse.
       *
       * ⚠️ Se registra **aquí** y no se importa de `BillingModule` porque ese
       * módulo importa a este: cruzarlos daría una dependencia circular. Nest
       * resuelve el cliente en el módulo que lo declara, y declararlo dos veces
       * no cuesta nada — es la misma configuración leída del mismo `.env`.
       */
      clienteDeServicio('BILLING'),
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
  providers: [JwtGuard, ModoLocalGuard],
  exports: [JwtGuard, JwtModule, ClientsModule],
})
export class AuthModule {}
