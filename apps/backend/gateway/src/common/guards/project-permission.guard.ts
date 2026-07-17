import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  ForbiddenException,
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
    @Inject('ROLES_SERVICE') private readonly rolesClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<ProjectPermission>(
      PROJECT_PERMISSION_KEY,
      context.getHandler(),
    );

    // Si no se requiere permiso específico, por defecto permitimos.
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    if (!userId) {
      return false;
    }

    // Intentar resolver projectId del request
    let projectId = request.params.projectId || request.body.projectId;

    // Si es ProjectsController, ":id" es el projectId
    const controllerName = context.getClass().name;
    if (!projectId && controllerName === 'ProjectsController' && request.params.id) {
      projectId = request.params.id;
    }

    // Si no tenemos projectId pero tenemos workspaceId o boardId en params,
    // los resolvemos llamando a projects-service
    const workspaceId = request.params.workspaceId;
    const boardId = request.params.boardId;

    if (!projectId && (workspaceId || boardId)) {
      try {
        const res = await firstValueFrom(
          this.projectsClient.send(
            { cmd: 'project_resolve_resource' },
            { workspaceId, boardId },
          ),
        );
        projectId = res?.projectId;
      } catch (err) {
        throw new ForbiddenException('Resource not found or could not be resolved');
      }
    }

    if (!projectId) {
      throw new ForbiddenException('Project context is missing');
    }

    // 1. Verificar si el usuario es el dueño del proyecto
    try {
      const project = await firstValueFrom(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
      );
      if (project && project.ownerId === userId) {
        return true; // El dueño siempre tiene acceso total
      }
    } catch (err) {
      // Si no se encuentra el proyecto o falla, continuamos con la validación de roles-service
    }

    // 2. Verificar permisos en el roles-service
    try {
      const { hasAccess } = await firstValueFrom(
        this.rolesClient.send(
          { cmd: 'project_access_check' },
          { userId, projectId, permission: requiredPermission },
        ),
      );
      return hasAccess;
    } catch (err) {
      return false;
    }
  }
}
