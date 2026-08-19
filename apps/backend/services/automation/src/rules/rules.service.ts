import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  CreateAutomationRuleDto,
  PROJECT_SUSPENDED_CODE,
  UpdateAutomationRuleDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { validateRuleDefinition } from './rule-definition';

const ruleInclude = {
  trigger: true,
  conditions: { orderBy: { position: 'asc' } },
  actions: { orderBy: { position: 'asc' } },
} as const;

@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  async list(projectId: string) {
    return this.prisma.automationRule.findMany({
      where: { projectId },
      include: ruleInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async find(projectId: string, id: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, projectId },
      include: ruleInclude,
    });
    if (!rule)
      throw new RpcException({ statusCode: 404, message: 'Regla de automatización no encontrada' });
    return rule;
  }

  async create(dto: CreateAutomationRuleDto) {
    const definition = this.validate(dto);
    await this.assertProjectActive(dto.projectId);
    return this.prisma.automationRule.create({
      data: {
        projectId: dto.projectId,
        name: definition.name,
        description: definition.description,
        createdBy: dto.createdBy,
        status: definition.status,
        trigger: {
          create: { type: definition.trigger.type, config: definition.trigger.config as never },
        },
        conditions: {
          create: definition.conditions.map(({ position, ...condition }) => ({
            ...condition,
            position,
            value: condition.value as never,
          })),
        },
        actions: {
          create: definition.actions.map(({ position, ...action }) => ({
            ...action,
            position,
            config: action.config as never,
          })),
        },
      },
      include: ruleInclude,
    });
  }

  async update(dto: UpdateAutomationRuleDto) {
    const existing = await this.find(dto.projectId, dto.id);
    const definition = this.validate(dto);
    await this.assertProjectActive(dto.projectId);
    return this.prisma.$transaction(async (tx) => {
      await tx.automationCondition.deleteMany({ where: { ruleId: dto.id } });
      await tx.automationAction.deleteMany({ where: { ruleId: dto.id } });
      return tx.automationRule.update({
        where: { id: dto.id },
        data: {
          name: definition.name,
          description: definition.description,
          status: definition.status,
          version: { increment: 1 },
          trigger: {
            update: { type: definition.trigger.type, config: definition.trigger.config as never },
          },
          conditions: {
            create: definition.conditions.map(({ position, ...condition }) => ({
              ...condition,
              position,
              value: condition.value as never,
            })),
          },
          actions: {
            create: definition.actions.map(({ position, ...action }) => ({
              ...action,
              position,
              config: action.config as never,
            })),
          },
        },
        include: ruleInclude,
      });
    });
  }

  async remove(projectId: string, id: string) {
    await this.find(projectId, id);
    await this.prisma.automationRule.delete({ where: { id } });
    return { success: true };
  }

  async purgeProject(projectId: string) {
    const result = await this.prisma.automationRule.deleteMany({ where: { projectId } });
    return { deleted: result.count };
  }

  private async assertProjectActive(projectId: string) {
    const project = await firstValueFrom(
      this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
    );
    if (!project) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    if (project.status && project.status !== 'ACTIVE') {
      throw new RpcException({
        statusCode: 403,
        code: PROJECT_SUSPENDED_CODE,
        message: 'El proyecto no está activo para administrar automatizaciones',
      });
    }
  }

  private validate(dto: CreateAutomationRuleDto | UpdateAutomationRuleDto) {
    try {
      return validateRuleDefinition(dto);
    } catch (error) {
      throw new RpcException({ statusCode: 400, message: (error as Error).message });
    }
  }
}
