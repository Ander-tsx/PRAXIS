import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';

/**
 * El cobro del plan del asistente.
 *
 * Va en su propio módulo y no dentro de `AssistantModule` porque monta algo que
 * ninguno de los demás tiene: **un endpoint público sin JWT**, el del webhook.
 * Tenerlo aparte hace evidente cuál es —y que su autenticación es la firma de
 * Stripe— en vez de esconderlo entre rutas que sí llevan sesión.
 *
 * `CREDENTIALS_SERVICE` es solo para rellenar el correo en la página de pago.
 */
@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: 'ASSISTANT_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('ASSISTANT_SERVICE_HOST'),
            port: config.get<number>('ASSISTANT_SERVICE_PORT'),
          },
        }),
      },
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
    ]),
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [StripeService],
})
export class BillingModule {}
