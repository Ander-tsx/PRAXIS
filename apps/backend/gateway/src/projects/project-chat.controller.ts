import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  FindChatMessagesQueryDto,
  MuteChatBodyDto,
  ProjectPermission,
  ReactChatBodyDto,
  SendChatMessageBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { MentionablesService } from './mentionables.service';

/**
 * El chat del equipo de un proyecto.
 *
 * ## El control de acceso es esto y solo esto
 *
 * Un mensaje **nunca** sale de aquí sin que `ProjectPermissionGuard` haya
 * comprobado que quien pregunta puede ver el proyecto. No hay ninguna ruta que
 * devuelva mensajes sin proyecto en la URL, así que no existe la forma de pedir
 * «los mensajes» y confiar en un filtro: la pregunta siempre es por un proyecto
 * concreto y siempre pasa por el guard.
 *
 * ⚠️ El `projectId` sale de `req.projectId`, que pone el guard tras resolver el
 * parámetro de la ruta. **Nunca del cuerpo**: que lo eligiera el cliente sería el
 * mismo agujero que ya se cerró en las tareas (`48a0058`), donde declarar un
 * proyecto propio daba acceso al ajeno.
 *
 * ## Qué permiso pide cada cosa
 *
 * - **Leer, marcar leído y silenciar**: `canViewProject`.
 * - **Escribir y reaccionar**: `canComment`, el mismo que comentar en una tarea.
 *
 * Se reutiliza `canComment` en vez de inventar un `canChat`, y no es por
 * ahorrar: los permisos de un rol son un **diccionario**, así que una clave nueva
 * llega en `false` para todos los roles que ya existen y el chat nacería mudo
 * hasta que alguien editara uno por uno todos los roles de todos los proyectos.
 */
@ApiTags('Project Chat')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/chat')
export class ProjectChatController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly mentionables: MentionablesService,
  ) {}

  /**
   * Qué se puede mencionar y referenciar desde este chat.
   *
   * Pide `canViewProject`: es el catálogo de lo que ya puedes ver, así que quien
   * entra al proyecto puede nombrarlo. **Lo que no aparece aquí no se puede
   * descubrir**, y eso es el control real — no una validación al enviar, que no
   * protegería de nada porque el nombre de la etiqueta lo escribe quien manda.
   */
  @Get('mentionables')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Personas, espacios, tableros y tareas que se pueden nombrar' })
  @ApiResponse({ status: 200, description: '{ people, refs }' })
  mencionables(@Request() req: Express.Request) {
    return this.mentionables.para({
      projectId: req.projectId as string,
      requesterId: req.user!.userId,
    });
  }

  @Get('messages')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Mensajes del chat, del más antiguo al más nuevo' })
  @ApiResponse({
    status: 200,
    description: 'Mensajes, si hay más arriba, no leídos y si está silenciado',
  })
  findAll(@Request() req: Express.Request, @Query() query: FindChatMessagesQueryDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_find_all' },
        { ...query, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_COMMENT)
  @ApiOperation({ summary: 'Escribe en el chat del proyecto' })
  @ApiResponse({ status: 201, description: 'Mensaje creado' })
  send(@Request() req: Express.Request, @Body() body: SendChatMessageBodyDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_send' },
        { ...body, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Marca el chat como leído hasta ahora.
   *
   * Pide `canViewProject` y no `canComment`: leer no es participar, y a un perfil
   * de solo lectura hay que dejarle quitarse el contador de encima.
   */
  @Post('read')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Deja el chat por leído' })
  @ApiResponse({ status: 200, description: 'Marca actualizada' })
  markRead(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_mark_read' },
        { projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Silencia el chat, o le devuelve el sonido.
   *
   * Silenciar **no deja de contar lo no leído**: la insignia sigue. Lo que se
   * apaga es el aviso que interrumpe. Es de quien lo pide y de nadie más, así
   * que basta con poder ver el proyecto.
   */
  @Post('mute')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Silencia o reactiva los avisos de este chat' })
  @ApiResponse({ status: 200, description: '{ muted }' })
  mute(@Request() req: Express.Request, @Body() body: MuteChatBodyDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_mute' },
        { ...body, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post('messages/:id/react')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_COMMENT)
  @ApiOperation({ summary: 'Pone o quita una reacción a un mensaje' })
  @ApiResponse({ status: 200, description: '{ messageId, reactions }' })
  react(@Param('id') id: string, @Request() req: Express.Request, @Body() body: ReactChatBodyDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_react' },
        { ...body, messageId: id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Lo borra su autor, o quien gestione el equipo.
   *
   * `canManageMembers` como permiso de moderación —y no `canDeleteTask`, que es
   * lo que modera los comentarios— porque lo que se modera aquí es una
   * conversación entre personas, no el contenido de una tarea. Quien lleva el
   * equipo es quien responde de lo que se dice en él.
   *
   * Se resuelve **aquí** y viaja como `canModerate`: el guard solo puede exigir
   * un permiso por ruta y esta admite dos vías distintas.
   */
  @Delete('messages/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Borra un mensaje propio, o cualquiera si gestionas el equipo' })
  @ApiResponse({ status: 200, description: 'Mensaje eliminado' })
  async delete(@Param('id') id: string, @Request() req: Express.Request) {
    const canModerate = await this.resolveModeration(req.user!.userId, req.projectId as string);

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_delete' },
        { id, projectId: req.projectId, requesterId: req.user!.userId, canModerate },
      ),
    );
  }

  /** ¿Puede esta persona moderar el chat? El dueño siempre. */
  private async resolveModeration(userId: string, projectId: string): Promise<boolean> {
    try {
      const project = await firstValueFrom(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
      );
      if (project?.ownerId === userId) return true;

      const { allowed } = await firstValueFrom(
        this.projectsClient.send(
          { cmd: 'project_check_permission' },
          { userId, projectId, permission: ProjectPermission.CAN_MANAGE_MEMBERS },
        ),
      );
      return !!allowed;
    } catch {
      /* Ante la duda no se modera: solo podrá borrar lo suyo. */
      return false;
    }
  }
}
