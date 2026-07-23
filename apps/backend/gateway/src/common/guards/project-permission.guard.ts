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

@Injectable()
export class ProjectPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
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

    // Resolver projectId desde params o body
    let projectId: string | undefined =
      request.params.projectId || request.body?.projectId;

    // Si es ProjectsController, ':id' es el projectId
    const controllerName = context.getClass().name;
    if (!projectId && controllerName === 'ProjectsController' && request.params.id) {
      projectId = request.params.id;
    }

    // Si no tenemos projectId pero tenemos workspaceId o boardId, los resolvemos
    const workspaceId: string | undefined = request.params.workspaceId;
    const boardId: string | undefined = request.params.boardId;

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
