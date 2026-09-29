import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AutomationEngineService } from '../executions/direct-execution';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [
    ClientsModule.registerAsync([clienteDeServicio('PROJECTS'), clienteDeServicio('TASKS')]),
  ],
  controllers: [RulesController],
  providers: [RulesService, AutomationEngineService],
  /* El consumidor de eventos necesita el motor: es lo que conecta el flujo de
     hechos con las reglas. Los clientes TCP se exportan con él porque el motor
     los tiene inyectados. */
  exports: [AutomationEngineService],
})
export class RulesModule {}
