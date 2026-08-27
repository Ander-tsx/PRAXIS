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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AddMemberBodyDto,
  ChangeMemberRoleBodyDto,
  ProjectPermission,
  RemoveMemberBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

@ApiTags('Project Members')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/members')
export class MembersController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly quota: QuotaService,
  ) {}

  /**
   * Lista todos los miembros de un proyecto.
   *
   * ⚠️ **`canViewProject` es lo que hace cumplir «la membresía basta».**
   *
   * Sin el decorador esto no pedía nada: `ProjectPermissionGuard` empieza con
   * `if (!requiredPermission) return true`, que es lo correcto para las rutas de
   * `/me/*` —ya acotadas al usuario del token— pero aquí significaba
   * «cualquiera con sesión». Con solo el UUID del proyecto, que viaja en
   * cualquier URL compartida, un extraño se llevaba la lista de miembros con sus
   * roles y su matriz de permisos completa. `GET /projects/:id` respondía 403 y
   * esta, 200.
   *
   * `canViewProject` es el suelo de la jerarquía —cualquier permiso lo implica—
   * así que exigirlo es exactamente pedir membresía, sin cerrarle la puerta a
   * ningún rol.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Lista todos los miembros de un proyecto' })
  @ApiResponse({ status: 200, description: 'Lista de miembros recuperada' })
  @ApiResponse({ status: 403, description: 'No eres miembro de este proyecto' })
  findAll(@Request() req: Express.Request) {
    /* `req.projectId` y no el `@Param`: la ruta puede traer un slug y el guard
       ya lo tradujo. Leerlo del parámetro mandaba la cadena literal al
       microservicio, que devolvía **200 con una lista vacía** — un desplegable
       en blanco y ningún error que lo explicara. */
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_find_all' }, { projectId: req.projectId }),
    );
  }

  /**
   * Agrega un miembro a un proyecto (requiere canManageMembers).
   *
   * ⚠️ **El tope de miembros lo pone el plan del DUEÑO del proyecto**, no el de
   * quien invita: es su tablero el que crece, y al revés alguien con plan grande
   * podría meter gente en el proyecto de quien paga el pequeño. Responde 402 con
   * `QUOTA_EXCEEDED`.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Agrega un miembro a un proyecto' })
  @ApiResponse({ status: 201, description: 'Miembro agregado exitosamente' })
  @ApiResponse({ status: 402, description: 'El plan del proyecto no da para otro miembro' })
  async add(@Request() req: Express.Request, @Body() body: AddMemberBodyDto) {
    /* 🕳️ Aquí iba `exigirMiembroDeProyecto`, que se retiró el 2026-08-26 con el
       tope de miembros por proyecto. Lo que lo sustituye —comprobar que la
       persona tiene asiento en la organización del proyecto— necesita
       `Project.organizationId`, que llega en O3. Hasta entonces esto no tiene
       límite, y es a sabiendas. Ver quota.service.ts y PLAN-ORGANIZACIONES O3.7. */

    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_add' }, { projectId: req.projectId, ...body }),
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
  remove(@Request() req: Express.Request, @Body() body: RemoveMemberBodyDto) {
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
        { projectId: req.projectId, userId: body.userId, requesterId: req.user!.userId },
      ),
    );
  }
}
