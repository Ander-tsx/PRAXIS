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
 * ## Los seis clientes, y por qué son seis
 *
 * - `BILLING_SERVICE` es el dueño de la respuesta: qué plan tienes.
 * - `PROJECTS_SERVICE`, `ASSISTANT_SERVICE`, `AUTOMATION_SERVICE` y
 *   `TASKS_SERVICE` son **los que cuentan**: proyectos, mensajes de este mes,
 *   reglas activas y bytes de adjuntos. billing-service no tiene ninguno de esos
 *   números y no debe tenerlos — ver la cabecera de `QuotaService`.
 * - `CREDENTIALS_SERVICE` es para el correo: rellenarlo en la página de Stripe
 *   y ponerle nombre a los miembros de una organización.
 *
 * ⚠️ **Que sean seis es la consecuencia de dónde se comprueban las cuotas**, no
 * un acoplamiento que se haya colado. El gateway es el único punto que tiene
 * delante al que sabe el tope y al que sabe el consumo; la alternativa era
 * darle a billing-service un cliente hacia cada servicio medible, que es el
 * mismo número de flechas apuntando al sitio equivocado.
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
      /* Para soltar las tareas de quien sale de una organización
         (`OrganizationsController.quitar`) y para sumar los bytes de los
         adjuntos de una organización (`QuotaService.exigirAlmacenamiento`). */
      {
        name: 'TASKS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('TASKS_SERVICE_HOST'),
            port: config.get<number>('TASKS_SERVICE_PORT'),
          },
        }),
      },
      /* Para contar las reglas activas de un proyecto contra el tope del plan.
         Ver `QuotaService.exigirAutomatizacion`. */
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
