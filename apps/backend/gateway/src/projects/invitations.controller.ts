import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InviteMemberBodyDto, ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Invitaciones dentro de un proyecto: enviarlas, listarlas y retirarlas.
 *
 * Exige `canManageMembers`, igual que dar de alta directamente. Responder a la
 * invitación es cosa de quien la recibe y vive en `MyInvitationsController`,
 * que no puede pedir permisos sobre un proyecto del que todavía no formas parte.
 */
@ApiTags('Invitations')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/invitations')
export class ProjectInvitationsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly quota: QuotaService,
  ) {}

  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Invitaciones pendientes de este proyecto' })
  findAll(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'invitation_find_for_project' }, { projectId }),
    );
  }

  /**
   * ⚠️ **La invitación ocupa sitio en el tope desde que se manda**, no desde que
   * la aceptan. Si no lo ocupara se podrían mandar veinte sobre un tope de
   * cinco y el límite se rompería al aceptarlas, con el proyecto ya por encima
   * del plan y la única salida siendo echar a alguien.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Invitar a alguien al proyecto' })
  @ApiResponse({ status: 201, description: 'Invitación enviada, pendiente de respuesta' })
  @ApiResponse({ status: 403, description: 'Esa persona no tiene asiento en la organización' })
  @ApiResponse({ status: 409, description: 'Ya es miembro o ya tiene una invitación pendiente' })
  async invite(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: InviteMemberBodyDto,
  ) {
    /* Misma regla que al añadir directamente: sin asiento en la organización del
       proyecto no se entra. Ver `exigirAsientoEnProyecto`. */
    await this.quota.exigirAsientoEnProyecto(projectId, body.userId);

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'invitation_create' },
        { ...body, projectId, invitedBy: req.user!.userId },
      ),
    );
  }

  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Retirar una invitación que sigue pendiente' })
  cancel(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'invitation_cancel' }, { invitationId: id, projectId }),
    );
  }
}

/**
 * Las invitaciones **de quien llama**: verlas, aceptarlas y rechazarlas.
 *
 * Cuelga de `/me` y no del proyecto a propósito: `ProjectPermissionGuard`
 * exigiría permisos sobre un proyecto en el que todavía no estás, que es
 * justamente la situación de una invitación pendiente. Aquí basta con el JWT,
 * y el microservicio comprueba que la invitación sea tuya.
 */
@ApiTags('Invitations')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/invitations')
export class MyInvitationsController {
  constructor(@Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy) {}

  @Get()
  @ApiOperation({ summary: 'Mis invitaciones pendientes' })
  findMine(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'invitation_find_for_user' }, { userId: req.user!.userId }),
    );
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceptar una invitación y entrar al proyecto' })
  accept(@Request() req: Express.Request, @Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'invitation_accept' },
        { invitationId: id, userId: req.user!.userId },
      ),
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar una invitación' })
  reject(@Request() req: Express.Request, @Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'invitation_reject' },
        { invitationId: id, userId: req.user!.userId },
      ),
    );
  }
}

/**
 * Salir de un proyecto por voluntad propia.
 *
 * Sin permisos: ser miembro basta para irse. El dueño no puede —perdería su
 * propio proyecto—, y eso lo comprueba el microservicio.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('projects/:projectId/membership')
export class ProjectMembershipController {
  constructor(@Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy) {}

  @Delete('me')
  @ApiOperation({ summary: 'Salir del proyecto' })
  @ApiResponse({ status: 409, description: 'El dueño no puede salir de su propio proyecto' })
  leave(@Request() req: Express.Request, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_leave' }, { projectId, userId: req.user!.userId }),
    );
  }
}
