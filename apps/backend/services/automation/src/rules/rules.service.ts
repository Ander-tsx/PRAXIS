import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  type AutomationActionType,
  CreateAutomationRuleDto,
  PROJECT_SUSPENDED_CODE,
  UpdateAutomationRuleDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { catalogPayload } from './catalog';
import { permisosQueExige, validateRuleDefinition } from './rule-definition';

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

  /** El catálogo, para que el formulario no tenga que saberse nada de memoria. */
  catalog() {
    return catalogPayload();
  }

  async create(dto: CreateAutomationRuleDto) {
    const definition = this.validate(dto);
    await this.assertProjectActive(dto.projectId);
    await this.assertPuedeHacerEsto(dto.projectId, dto.createdBy, definition.actions);
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
    /* Contra quien **la escribió**, no contra quien la está editando: es su
       identidad la que va a ejecutar las acciones. Editar la regla de otra
       persona no puede darle a esa persona un poder que no tiene. */
    await this.assertPuedeHacerEsto(dto.projectId, existing.createdBy, definition.actions);
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

  /**
   * Todo lo que este servicio guardaba de un proyecto que ya no existe.
   *
   * ⚠️ **Los hechos también.** Antes se borraban solo las reglas, y
   * `inbound_events` se quedaba con el rastro de un proyecto borrado —qué tareas
   * había, quién las movía y cuándo— indefinidamente y sin que ninguna pantalla
   * pudiera enseñarlo ni retirarlo. Un proyecto que se borra se borra.
   *
   * Las ejecuciones caen solas: cuelgan de la regla con `onDelete: Cascade`.
   */
  async purgeProject(projectId: string) {
    const [reglas, hechos] = await this.prisma.$transaction([
      this.prisma.automationRule.deleteMany({ where: { projectId } }),
      this.prisma.inboundEvent.deleteMany({ where: { projectId } }),
    ]);
    return { deleted: reglas.count, events: hechos.count };
  }

  /**
   * Que quien escribió la regla pueda hacer a mano lo que la regla va a hacer.
   *
   * ## ⚠️ Esto no es la defensa, es el aviso temprano
   *
   * La defensa de verdad está en `tasks-service`, que comprueba permisos por
   * `requesterId` en **cada** escritura: una regla viaja con el `createdBy` de
   * quien la creó, así que no puede hacer nada que esa persona no pudiera hacer
   * pulsando el botón. Aunque este método no existiera, no habría escalada.
   *
   * Lo que aporta es el **momento** y el **mensaje**. Sin él, una regla que
   * mueve tareas creada por alguien sin `canEditTask` se guarda tan feliz, se ve
   * habilitada en la pantalla, y falla en silencio la primera vez que se
   * dispara — que puede ser tres días después. Con él, el error sale al pulsar
   * «Guardar», que es cuando la persona está mirando y puede hacer algo.
   */
  private async assertPuedeHacerEsto(
    projectId: string,
    userId: string,
    actions: Array<{ type: AutomationActionType }>,
  ) {
    const permisos = permisosQueExige(actions);
    if (permisos.length === 0) return;

    for (const permission of permisos) {
      const respuesta = await firstValueFrom(
        this.projectsClient.send(
          { cmd: 'project_check_permission' },
          { userId, projectId, permission },
        ),
      );
      /* projects-service devuelve `{ allowed }` o un booleano suelto: las dos
         formas están vivas y hay que aceptar las dos. Es el mismo cruce que
         hace `tasks-service`. */
      const permitido = typeof respuesta === 'boolean' ? respuesta : respuesta?.allowed;
      if (!permitido) {
        throw new RpcException({
          statusCode: 403,
          message:
            `Quien creó esta regla no tiene el permiso "${permission}", ` +
            'que hace falta para una de sus acciones.',
        });
      }
    }
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
