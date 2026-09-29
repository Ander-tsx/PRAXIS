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
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CHAT_ATTACHMENT_ALLOWED_MIME,
  CHAT_ATTACHMENT_MAX_BYTES,
  EditChatMessageBodyDto,
  FindChatMessagesQueryDto,
  MuteChatBodyDto,
  PinChatMessageBodyDto,
  ProjectPermission,
  ReactChatBodyDto,
  SendChatMessageBodyDto,
  isChatAttachmentInlineMime,
  validarFirmaChatAdjunto,
} from '@praxis/contracts';
import type { Response } from 'express';
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
        /* `origin` se fija aquí y no se lee del cuerpo (D13): el DTO ya rechaza
           el campo, y esto lo deja escrito por si un día deja de hacerlo. Un
           mensaje que llega por HTTP es siempre de la persona; los de regla
           los publica automation-service por TCP. */
        { ...body, projectId: req.projectId, requesterId: req.user!.userId, origin: 'USER' },
      ),
    );
  }

  /**
   * El hilo de un mensaje: el mensaje raíz y sus respuestas, en orden.
   *
   * Pide `canViewProject`: abrir un hilo es leer la conversación, igual que la
   * lista de mensajes.
   */
  @Get('messages/:id/thread')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'El mensaje y sus respuestas, en orden' })
  @ApiResponse({ status: 200, description: '{ root, replies }' })
  thread(@Param('id') id: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_thread' },
        { messageId: id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Sube un archivo al chat y lo deja como **borrador**.
   *
   * El adjunto se sube solo y queda sin mensaje; al enviar, los `attachmentIds`
   * del mensaje lo reclaman. Así el redactor puede adjuntar varios, verlos como
   * chips y mandarlos todos de una vez — si tuviera que ir con el mensaje, cada
   * intento de enviar volvería a subir el archivo.
   *
   * ⚠️ El `projectId` sale de `req.projectId`, que pone el guard: nunca del
   * cuerpo, el mismo criterio que en los mensajes.
   */
  @Post('attachments')
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_COMMENT)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CHAT_ATTACHMENT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube un archivo al chat (queda como borrador hasta enviar)' })
  @ApiResponse({ status: 201, description: 'Metadatos del adjunto' })
  upload(@Request() req: Express.Request, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No llegó ningún archivo en el campo «file»');
    }
    if (!(CHAT_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('Solo se admiten imágenes, vídeo, PDF, texto y Office.');
    }
    if (file.size === 0) {
      throw new BadRequestException('El archivo está vacío');
    }
    /**
     * ⚠️ **El `mimetype` lo declara quien sube el archivo**: un ejecutable
     * renombrado como `.png` pasaría la lista blanca sin más. Se comprueba la
     * firma de los primeros bytes contra el tipo declarado —el texto no tiene
     * firma, se comprueba que no arranque como binario—. Después del tamaño,
     * para que un archivo vacío reciba el mensaje que le toca.
     */
    if (!validarFirmaChatAdjunto(file.mimetype, file.buffer)) {
      throw new BadRequestException('Ese archivo no es lo que parece por el nombre.');
    }

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_attachment_create' },
        {
          projectId: req.projectId,
          requesterId: req.user!.userId,
          filename: sanitizeFilename(file.originalname),
          mimeType: file.mimetype,
          size: file.size,
          content: file.buffer.toString('base64'),
        },
      ),
    );
  }

  /**
   * Descarga los bytes de un adjunto del chat.
   *
   * Misma política de entrega que en los adjuntos de tarea: solo las imágenes,
   * el vídeo y el PDF se sirven en línea —y el PDF siempre dentro de un sandbox
   * sin `allow-same-origin`—; el resto sale como descarga con `nosniff`, y el
   * SVG ni siquiera se admite al subir. El `filename*` lleva codificación RFC
   * 5987 para que los acentos y los espacios sobrevivan a la cabecera.
   */
  @Get('attachments/:id/content')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Descarga el contenido de un adjunto del chat' })
  @ApiResponse({ status: 200, description: 'Bytes del archivo' })
  async download(@Param('id') id: string, @Request() req: Express.Request, @Res() res: Response) {
    const file = await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_attachment_get_content' },
        { id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );

    const buffer = Buffer.from(file.content, 'base64');
    const disposition = isChatAttachmentInlineMime(file.mimeType) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    /* El visor de PDF de Chrome (PDFium) necesita `allow-scripts` para arrancar
       dentro del marco, pero nunca `allow-same-origin`: esa es la que le daría
       acceso a las cookies de la sesión. Ver `attachments.controller.ts` de
       tareas, que explica la pareja. */
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-downloads');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');

    res.end(buffer);
  }

  /**
   * Lo borra quien lo subió, o quien gestione el equipo.
   *
   * El mismo criterio de moderación que los mensajes (`canManageMembers`):
   * quien responde de la conversación responde de lo que se comparte en ella.
   * Se resuelve aquí y viaja como `canModerate`.
   */
  @Delete('attachments/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Borra un adjunto propio, o cualquiera si gestionas el equipo' })
  @ApiResponse({ status: 200, description: 'Adjunto eliminado' })
  async deleteAttachment(@Param('id') id: string, @Request() req: Express.Request) {
    const canModerate = await this.resolveModeration(req.user!.userId, req.projectId as string);

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_attachment_delete' },
        { id, projectId: req.projectId, requesterId: req.user!.userId, canModerate },
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
   * Quién ha leído hasta dónde, para las burbujas de «visto».
   *
   * Devuelve `[{ userId, lastReadAt }]` de todo el que haya abierto el canal
   * **menos quien pregunta**. Un mensaje está visto por alguien si su
   * `lastReadAt` es posterior a la fecha del mensaje; ese cálculo lo hace el
   * frontend, que es donde están los mensajes en pantalla.
   *
   * `CAN_VIEW_PROJECT` y no `CAN_COMMENT`: quien puede leer el chat puede
   * saber quién más lo ha leído.
   */
  @Get('receipts')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Hasta dónde ha leído cada miembro del canal' })
  @ApiResponse({ status: 200, description: 'Lista de userId con su lastReadAt' })
  receipts(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_receipts' },
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
   * Fija o desfija un mensaje.
   *
   * Fijar **no es moderar**: es dejar algo anclado para que el equipo no lo
   * pierda en el historial, así que cualquier miembro que pueda participar lo
   * hace — el mismo permiso que reaccionar.
   */
  @Post('messages/:id/pin')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_COMMENT)
  @ApiOperation({ summary: 'Fija o desfija un mensaje del chat' })
  @ApiResponse({ status: 200, description: '{ messageId, pinned, pinnedById }' })
  pin(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: PinChatMessageBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_pin' },
        { ...body, messageId: id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Edita el texto de un mensaje propio.
   *
   * El servicio comprueba la autoría —editar el de otro no encuentra fila—, así
   * que aquí basta con poder ver el proyecto. No hace falta ni `canComment`:
   * quien escribió ya participó, y lo que se le devuelve es lo que él mismo
   * mandó.
   */
  @Patch('messages/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Edita el texto de un mensaje propio' })
  @ApiResponse({ status: 200, description: 'Mensaje editado' })
  edit(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: EditChatMessageBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_project_edit' },
        { ...body, id, projectId: req.projectId, requesterId: req.user!.userId },
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

/**
 * Deja el nombre en algo seguro de devolver en una cabecera.
 *
 * Quita separadores de ruta —un `../` en el nombre no debe poder salir de
 * ningún sitio— y los caracteres de control, que romperían la cabecera.
 */
function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[/\\]/g, '_')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: es justo lo que hay que quitar
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  return clean.slice(0, 255) || 'archivo';
}
