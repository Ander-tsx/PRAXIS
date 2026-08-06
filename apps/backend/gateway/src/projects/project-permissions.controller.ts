import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Permisos efectivos de quien llama, dentro de un proyecto.
 *
 * Es la pieza que le faltaba a la interfaz: sin ella solo podía descubrir que
 * no tenía permiso **después** de que la acción fallara con un 403 — enseñar un
 * botón, dejar rellenar un formulario y romper al enviar.
 *
 * La lógica (jerarquía implícita, bypass del dueño, caché) ya vivía en
 * projects-service; aquí solo se expone.
 *
 * Va en su propio controlador y no en `ProjectRolesController` porque aquel
 * cuelga de `projects/:projectId/roles` y exige `canManageRoles`: esto tiene
 * que poder consultarlo cualquier miembro, incluido uno de solo lectura.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/permissions')
export class ProjectPermissionsController {
  constructor(@Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Mis permisos efectivos en este proyecto' })
  @ApiResponse({
    status: 200,
    description:
      'Mapa completo de permisos ya expandido por jerarquía, con los no concedidos en false, más isOwner',
  })
  myPermissions(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_effective_permissions' },
        { userId: req.user!.userId, projectId },
      ),
    );
  }
}
