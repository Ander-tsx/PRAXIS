import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AddMemberBodyDto,
  ChangeMemberRoleBodyDto,
  ProjectPermission,
  RemoveMemberBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@ApiTags('Project Members')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/members')
export class MembersController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Lista todos los miembros de un proyecto (la membresía basta) */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista todos los miembros de un proyecto' })
  @ApiResponse({ status: 200, description: 'Lista de miembros recuperada' })
  findAll(@Param('projectId') projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_find_all' }, { projectId }),
    );
  }

  /** Agrega un miembro a un proyecto (requiere canManageMembers) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Agrega un miembro a un proyecto' })
  @ApiResponse({ status: 201, description: 'Miembro agregado exitosamente' })
  add(
    @Param('projectId') projectId: string,
    @Body() body: AddMemberBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_add' }, { projectId, ...body }),
    );
  }

  /**
   * Cambia el rol de alguien que ya es miembro.
   *
   * Antes había que sacarlo y volver a meterlo, con todo lo que eso arrastra:
   * fecha de entrada perdida, un aviso diciendo que lo habían echado y un hueco
   * sin permisos entre las dos operaciones.
   *
   * ⚠️ **Puedes cambiarte el rol a ti mismo, y es a propósito.** Quien tiene
   * `canManageMembers` puede rebajarse —incluso hasta quedarse sin ese permiso—
   * porque impedirlo no protege de nada: siempre puede pedírselo a otro
   * administrador, y el dueño tiene bypass en el guard. Lo que sí se impide es
   * **sacarse a uno mismo del proyecto**, que no tiene vuelta atrás.
   */
  @Patch(':userId')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Cambia el rol de un miembro' })
  @ApiResponse({ status: 200, description: 'Miembro actualizado' })
  @ApiResponse({ status: 404, description: 'No es miembro, o el rol no es de este proyecto' })
  changeRole(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: Express.Request,
    @Body() body: ChangeMemberRoleBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'member_change_role' },
        { projectId, userId, ...body, requesterId: req.user!.userId },
      ),
    );
  }

  /** Elimina un miembro de un proyecto (requiere canManageMembers) */
  @Delete()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Elimina un miembro de un proyecto' })
  @ApiResponse({ status: 200, description: 'Miembro eliminado exitosamente' })
  remove(
    @Param('projectId') projectId: string,
    @Request() req: Express.Request,
    @Body() body: RemoveMemberBodyDto,
  ) {
    /**
     * ⚠️ **Nadie se saca a sí mismo por aquí.**
     *
     * Es la única operación de esta sección sin vuelta atrás: al salir pierdes
     * los permisos, así que tampoco puedes volver a entrar — necesitas que
     * alguien te invite. Y el dueño se dejaría su propio proyecto sin nadie que
     * lo administre.
     *
     * Para irse voluntariamente está `DELETE /projects/:id/membership/me`, que
     * es una decisión distinta y lo dice en su nombre.
     */
    if (body.userId === req.user!.userId) {
      throw new BadRequestException(
        'No puedes sacarte a ti mismo del proyecto. Usa la opción de salir.',
      );
    }

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'member_remove' },
        // `requesterId` solo para poder decir en el aviso quién la sacó.
        { projectId, ...body, requesterId: req.user!.userId },
      ),
    );
  }
}
