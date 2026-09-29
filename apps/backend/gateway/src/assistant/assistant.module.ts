import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AssistantController } from './assistant.controller';
import { MyAssistantController } from './my-assistant.controller';

/**
 * ⚠️ Registra **cuatro** clientes y el controlador usa tres.
 *
 * `ASSISTANT_SERVICE` y `CREDENTIALS_SERVICE` los usa el controlador —el
 * segundo, solo para ponerle nombre a cada `userId`—. `PROJECTS_SERVICE` lo usa
 * el controlador *y* `ProjectPermissionGuard`; `TASKS_SERVICE` solo el guard,
 * que se aplica aquí y los inyecta por su cuenta. Sin los dos en el módulo,
 * Nest no puede construir el guard y el fallo aparece **al arrancar**, no al
 * llamar a la ruta.
 */
@Module({
  imports: [
    AuthModule,
    /* Por `QuotaService`: el tope mensual de IA lo pone el plan, y el plan puede
       venir de la organización de una empresa — que assistant-service no ve. */
    BillingModule,
    ClientsModule.registerAsync([
      clienteDeServicio('ASSISTANT'),
      clienteDeServicio('CREDENTIALS'),
      clienteDeServicio('PROJECTS'),
      clienteDeServicio('TASKS'),
    ]),
  ],
  controllers: [AssistantController, MyAssistantController],
})
export class AssistantModule {}
