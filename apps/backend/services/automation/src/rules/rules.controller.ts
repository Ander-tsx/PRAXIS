import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateAutomationRuleDto,
  FindAutomationRuleDto,
  PurgeAutomationProjectDto,
  UpdateAutomationRuleDto,
} from '@praxis/contracts';
import { RulesService } from './rules.service';

@Controller()
export class RulesController {
  constructor(private readonly rules: RulesService) {}

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
}
