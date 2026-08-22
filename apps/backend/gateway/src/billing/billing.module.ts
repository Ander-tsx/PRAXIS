import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { MyOrganizationsController, OrganizationsController } from './organizations.controller';
import { QuotaService } from './quota.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';

/**
 * El plan: quién paga, qué da y quién se ha pasado.
 *
 * Va en su propio módulo y no dentro de `AssistantModule` porque monta algo que
 * ninguno de los demás tiene: **un endpoint público sin JWT**, el del webhook.
 * Tenerlo aparte hace evidente cuál es —y que su autenticación es la firma de
 * Stripe— en vez de esconderlo entre rutas que sí llevan sesión.
 *
 * ## Los cuatro clientes, y por qué son cuatro
 *
 * - `BILLING_SERVICE` es el dueño de la respuesta: qué plan tienes.
 * - `PROJECTS_SERVICE` y `ASSISTANT_SERVICE` son **los que cuentan**: cuántos
 *   proyectos sostienes y cuántos mensajes llevas. billing-service no los tiene
 *   y no debe tenerlos — ver la cabecera de `QuotaService`.
 * - `CREDENTIALS_SERVICE` es para el correo: rellenarlo en la página de Stripe
 *   y ponerle nombre a los miembros de una organización.
 *
 * ⚠️ **`QuotaService` se exporta**, y por eso este módulo lo importan
 * `ProjectsModule` y `AssistantModule`: la cuota se comprueba donde ocurre la
 * escritura, no aquí. Nest resuelve sus dependencias en **este** módulo, así
 * que los dos clientes de arriba tienen que estar registrados aquí aunque
 * ningún controlador de esta carpeta los use para contar.
 */
@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
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
  controllers: [
    BillingController,
    MyOrganizationsController,
    OrganizationsController,
    StripeWebhookController,
  ],
  providers: [StripeService, QuotaService],
  exports: [QuotaService],
})
export class BillingModule {}
