import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PROJECT_PERMISSION_KEY } from '../decorators/require-project-permission.decorator';
import { ProjectPermission } from '@praxis/contracts';

/** Nombres de controladores que usan el param `:id` como projectId */
const PROJECT_ID_CONTROLLERS = new Set(['ProjectsController']);

/**
 * Controladores donde un parámetro de ruta identifica una **tarea**.
 *
 * `TasksController` la nombra `:id` y `ChecklistsController` `:taskId` (ahí
 * `:id` es el ítem del checklist), así que se prueban en ese orden.
 */
const TASK_CONTROLLERS = new Set(['TasksController', 'ChecklistsController']);

/**
 * Resuelve el proyecto de un recurso y comprueba el permiso pedido.
 *
 * ⚠️ **El `projectId` sale siempre de la ruta, nunca del cuerpo.** Antes se
 * aceptaba `body.projectId` como último recurso y eso era un bypass completo,
 * reproducido con dos cuentas: bastaba con mandar el id de un proyecto propio
 * para leer, editar y borrar tareas de un proyecto ajeno, porque el guard
 * concedía por ser dueño de *ese* proyecto y nadie comparaba después con el
 * proyecto real de la tarea. El permiso lo decide el recurso al que apuntas,
 * no lo que declares.
 *
 * El id resuelto queda en `request.projectId` para que el controlador lo
 * inyecte en el payload al microservicio.
 */
@Injectable()
export class ProjectPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<ProjectPermission>(
      PROJECT_PERMISSION_KEY,
      context.getHandler(),
    );

    // Si no se requiere permiso específico, deja pasar
    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    if (!userId) return false;

    const controllerName = context.getClass().name;
    const params = request.params;

    // --- Resolver projectId desde el contexto más específico al más amplio ---
    // Solo desde `params`: el cuerpo no participa (ver la nota de la clase).

    let projectId: string | undefined = params.projectId;

    // ProjectsController usa `:id` como projectId directamente
    if (!projectId && PROJECT_ID_CONTROLLERS.has(controllerName) && params.id) {
      projectId = params.id;
    }

    // Si el controlador maneja tareas, resolvemos taskId → boardId → projectId.
    // Va antes que el bloque de boardId: al crear (`boards/:boardId/tasks`) no
    // hay tarea todavía y cae solo al siguiente.
    if (!projectId && TASK_CONTROLLERS.has(controllerName)) {
      const taskId: string | undefined = params.taskId ?? params.id;

      if (taskId) {
        try {
          const task = await firstValueFrom(
            this.tasksClient.send({ cmd: 'task_find_one' }, { id: taskId }),
          );
          if (task?.boardId) {
            const res = await firstValueFrom(
              this.projectsClient.send(
                { cmd: 'project_resolve_resource' },
                { boardId: task.boardId },
              ),
            );
            projectId = res?.projectId;
          }
        } catch {
          throw new ForbiddenException('Tarea no encontrada o no se pudo resolver el proyecto');
        }
      }
    }

    // Si tenemos workspaceId o boardId, los resolvemos vía projects-service
    const workspaceId: string | undefined = params.workspaceId;
    const boardId: string | undefined = params.boardId;

    if (!projectId && (workspaceId || boardId)) {
      try {
        const res = await firstValueFrom(
          this.projectsClient.send(
            { cmd: 'project_resolve_resource' },
            { workspaceId, boardId },
          ),
        );
        projectId = res?.projectId;
      } catch {
        throw new ForbiddenException('Recurso no encontrado o no se pudo resolver');
      }
    }

    if (!projectId) {
      throw new ForbiddenException('Contexto de proyecto no encontrado en la petición');
    }

    // Disponible para el controlador, que lo inyecta en el payload.
    request.projectId = projectId;

    // 1. Verificar si el usuario es el dueño del proyecto — siempre tiene acceso total
    try {
      const project = await firstValueFrom(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
      );
      if (project && project.ownerId === userId) return true;
    } catch {
      // Si no se encuentra el proyecto, continuar con la verificación de permisos
    }

    // 2. Consultar projects-service por el permiso granular
    try {
      const { allowed } = await firstValueFrom(
        this.projectsClient.send(
          { cmd: 'project_check_permission' },
          { userId, projectId, permission: requiredPermission },
        ),
      );
      return !!allowed;
    } catch {
      return false;
    }
  }
}
