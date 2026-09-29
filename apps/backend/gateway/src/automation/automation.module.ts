import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProjectAutomationsController } from './project-automations.controller';

/**
 * Las reglas de un proyecto.
 *
 * ⚠️ **Importa `BillingModule` por `QuotaService`**, no por facturar nada: el
 * tope de automatizaciones activas es una cuota del plan y se comprueba donde
 * ocurre la escritura, que es aquí. Es el mismo motivo por el que lo importan
 * `ProjectsModule` y `AssistantModule`.
 */
@Module({
  imports: [
    AuthModule,
    BillingModule,
    ClientsModule.registerAsync([
      clienteDeServicio('AUTOMATION'),
      clienteDeServicio('PROJECTS'),
      clienteDeServicio('TASKS'),
    ]),
  ],
  controllers: [ProjectAutomationsController],
})
export class AutomationModule {}
