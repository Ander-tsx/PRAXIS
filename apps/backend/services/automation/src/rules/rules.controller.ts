import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateAutomationRuleDto,
  FindAutomationRuleDto,
  PurgeAutomationProjectDto,
  UpdateAutomationRuleDto,
} from '@praxis/contracts';
import { AutomationEngineService } from '../executions/direct-execution';
import { RulesService } from './rules.service';

@Controller()
export class RulesController {
  constructor(
    private readonly rules: RulesService,
    private readonly engine: AutomationEngineService,
  ) {}

  /**
   * Qué disparadores, condiciones y acciones existen.
   *
   * ⚠️ **No lleva `projectId` y no lo necesita**: el catálogo es del sistema, no
   * del proyecto. Lo que sí es de cada proyecto —sus columnas, sus etiquetas, su
   * gente— no viaja aquí: el catálogo dice de qué lista sale cada valor
   * (`source`) y quien pinta el formulario ya las tiene en pantalla. Traerlas
   * también sería duplicar datos que envejecen.
   */
  @MessagePattern({ cmd: 'automation_catalog' })
  catalog() {
    return this.rules.catalog();
  }

  @MessagePattern({ cmd: 'automation_rule_list' })
  list(@Payload() dto: { projectId: string }) {
    return this.rules.list(dto.projectId);
  }

  @MessagePattern({ cmd: 'automation_rule_find_one' })
  find(@Payload() dto: FindAutomationRuleDto) {
    return this.rules.find(dto.projectId, dto.id);
  }

  @MessagePattern({ cmd: 'automation_rule_create' })
  create(@Payload() dto: CreateAutomationRuleDto) {
    return this.rules.create(dto);
  }

  @MessagePattern({ cmd: 'automation_rule_update' })
  update(@Payload() dto: UpdateAutomationRuleDto) {
    return this.rules.update(dto);
  }

  @MessagePattern({ cmd: 'automation_rule_delete' })
  remove(@Payload() dto: FindAutomationRuleDto) {
    return this.rules.remove(dto.projectId, dto.id);
  }

  @MessagePattern({ cmd: 'automation_project_purge' })
  purge(@Payload() dto: PurgeAutomationProjectDto) {
    return this.rules.purgeProject(dto.projectId);
  }

  @MessagePattern({ cmd: 'automation_project_review' })
  review(@Payload() dto: { projectId: string }) {
    return this.engine.reviewProject(dto.projectId);
  }

  @MessagePattern({ cmd: 'automation_execution_list' })
  executions(@Payload() dto: { projectId: string; limit?: number }) {
    return this.engine.recent(dto.projectId, dto.limit);
  }
}
