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
  ReactChatBodyDto,
  SendChatMessageBodyDto,
  isChatAttachmentInlineMime,
  validarFirmaChatAdjunto,
} from '@praxis/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { MentionablesService } from './mentionables.service';

/**
 * Conversaciones privadas entre dos personas.
 *
 * ## Por qué cuelga de `/me` y no lleva `ProjectPermissionGuard`
 *
 * Una conversación privada **no pertenece a ningún proyecto**, así que no hay
 * proyecto en la ruta contra el que el guard pueda comprobar nada. Es el mismo
 * caso que `/me/notifications` y `/me/invitations`.
 *
 * ⚠️ **La autorización la hace projects-service, y es una sola regla: solo
 * puedes escribir a quien comparta algún proyecto contigo.** Se comprueba en
 * `ChannelsService.directo()`, que es el único camino por el que se resuelve un
 * canal privado — no hay forma de saltárselo desde aquí. Sin esa regla, esto
 * sería mensajería abierta a toda la plataforma: cualquiera con un `userId`
 * podría escribir a cualquiera.
 *
 * El `requesterId` sale **siempre del token**. La ruta solo lleva con quién
 * hablas, nunca quién eres.
 */
@ApiTags('Direct Chat')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/chats')
export class DirectChatController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly mentionables: MentionablesService,
  ) {}

  /** Mis conversaciones, con el último mensaje y lo que llevo sin leer. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis conversaciones privadas' })
  @ApiResponse({ status: 200, description: 'Lista con último mensaje, no leídos y silenciado' })
  conversaciones(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'chat_my_conversations' }, { userId: req.user!.userId }),
    );
  }

  /**
   * A quién puedo escribir.
   *
   * Devuelve, por cada persona, **en qué proyectos coincidimos y con qué rol
   * está allí**. Es lo que convierte una lista de nombres en algo que se
   * entiende: «Juan, Administrador en Rediseño» dice mucho más que «Juan».
   *
   * Va antes que `:peerId` en el archivo **y en la clase**: Nest resuelve por
   * orden de declaración, y con la ruta dinámica delante, `/contacts` entraría
   * por ella y `ParseUUIDPipe` respondería 400.
   */
  @Get('contacts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quién comparte proyecto conmigo, con sus roles' })
  @ApiResponse({ status: 200, description: 'Contactos con sus proyectos en común' })
  contactos(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'chat_contacts' }, { userId: req.user!.userId }),
    );
  }

  /**
   * Mis chats de proyecto, para el centro de mensajes.
   *
   * Vive bajo `/me/chats` y no bajo `/projects` porque la pregunta es «los
   * míos», que cruza todos los proyectos: no hay uno en la ruta contra el que
   * `ProjectPermissionGuard` pueda comprobar nada. Es el mismo caso que
   * `/me/tasks` y `/me/invitations`.
   */
  @Get('projects')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis chats de proyecto, con último mensaje y no leídos' })
  @ApiResponse({ status: 200, description: 'Lista de chats de proyecto' })
  chatsDeProyecto(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'chat_my_project_channels' }, { userId: req.user!.userId }),
    );
  }

  @Get(':peerId/mentionables')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Qué se puede mencionar y referenciar en esta conversación' })
  @ApiResponse({ status: 200, description: '{ people, refs }' })
  mencionables(@Param('peerId', ParseUUIDPipe) peerId: string, @Request() req: Express.Request) {
    return this.mentionables.para({ peerId, requesterId: req.user!.userId });
  }

  @Get(':peerId/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mensajes de una conversación privada' })
  @ApiResponse({ status: 200, description: 'Mensajes, si hay más arriba, no leídos y silenciado' })
  findAll(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Request() req: Express.Request,
    @Query() query: FindChatMessagesQueryDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_find_all' },
        { ...query, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Escribe a alguien en privado' })
  @ApiResponse({ status: 201, description: 'Mensaje creado' })
  send(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Request() req: Express.Request,
    @Body() body: SendChatMessageBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_send' },
        { ...body, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * El hilo de un mensaje de una conversación privada.
   *
   * La autorización la hace `ChannelsService.directo()` como en el resto de la
   * conversación: solo puedes abrir el hilo de un mensaje de alguien con quien
   * compartes proyecto.
   */
  @Get(':peerId/messages/:id/thread')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El mensaje y sus respuestas, en orden' })
  @ApiResponse({ status: 200, description: '{ root, replies }' })
  thread(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_thread' },
        { messageId: id, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Sube un archivo a una conversación privada, como borrador.
   *
   * ⚠️ La autorización no está aquí: está en `ChannelsService.directo()`, que
   * comprueba que compartes un proyecto con `peerId` antes de resolver el canal.
   * El `requesterId` sale del token; `peerId`, de la ruta. Sin esa regla en el
   * servicio, esto sería mensajería abierta a toda la plataforma.
   */
  @Post(':peerId/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CHAT_ATTACHMENT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube un archivo a la conversación (queda en borrador)' })
  @ApiResponse({ status: 201, description: 'Metadatos del adjunto' })
  upload(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Request() req: Express.Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No llegó ningún archivo en el campo «file»');
    }
    if (!(CHAT_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('Solo se admiten imágenes, vídeo, PDF, texto, ZIP y Office.');
    }
    if (file.size === 0) {
      throw new BadRequestException('El archivo está vacío');
    }
    /* El `mimetype` lo declara quien sube: se comprueba la firma de los bytes
       contra el tipo declarado antes de aceptarlo. */
    if (!validarFirmaChatAdjunto(file.mimetype, file.buffer)) {
      throw new BadRequestException('Ese archivo no es lo que parece por el nombre.');
    }

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_attachment_create' },
        {
          peerId,
          requesterId: req.user!.userId,
          filename: sanitizeFilename(file.originalname),
          mimeType: file.mimetype,
          size: file.size,
          content: file.buffer.toString('base64'),
        },
      ),
    );
  }

  @Get(':peerId/attachments/:id/content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarga el contenido de un adjunto de la conversación' })
  @ApiResponse({ status: 200, description: 'Bytes del archivo' })
  async download(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Res() res: Response,
  ) {
    const file = await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_attachment_get_content' },
        { id, peerId, requesterId: req.user!.userId },
      ),
    );

    const buffer = Buffer.from(file.content, 'base64');
    const disposition = isChatAttachmentInlineMime(file.mimeType) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    /* El PDF en línea va dentro de un sandbox sin `allow-same-origin`: ver el
       comentario del visor en `attachments.controller.ts` de tareas. */
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-downloads');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');

    res.end(buffer);
  }

  /**
   * Borra un adjunto **propio**.
   *
   * En privado no hay moderación —es el mismo criterio que el borrado de
   * mensajes—: el servicio fija `canModerate` en `false`.
   */
  @Delete(':peerId/attachments/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra un adjunto propio de la conversación' })
  @ApiResponse({ status: 200, description: 'Adjunto eliminado' })
  deleteAttachment(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_attachment_delete' },
        { id, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deja la conversación por leída' })
  @ApiResponse({ status: 200, description: 'Marca actualizada' })
  markRead(@Param('peerId', ParseUUIDPipe) peerId: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_mark_read' },
        { peerId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Hasta dónde ha leído la otra persona. Ver el gemelo del chat de proyecto.
   *
   * En una conversación de dos la lista trae como mucho un elemento, y es
   * justo el que hace falta para el «visto».
   */
  @Get(':peerId/receipts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hasta dónde ha leído la otra persona' })
  @ApiResponse({ status: 200, description: 'Lista de userId con su lastReadAt' })
  receipts(@Param('peerId', ParseUUIDPipe) peerId: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_receipts' },
        { peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Silencia o reactiva los avisos de esta conversación' })
  @ApiResponse({ status: 200, description: '{ muted }' })
  mute(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Request() req: Express.Request,
    @Body() body: MuteChatBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_mute' },
        { ...body, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  @Post(':peerId/messages/:id/react')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pone o quita una reacción a un mensaje' })
  @ApiResponse({ status: 200, description: '{ messageId, reactions }' })
  react(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: ReactChatBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_react' },
        { ...body, messageId: id, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Fija o desfija un mensaje de la conversación.
   *
   * Igual que reaccionar: cualquiera de los dos puede fijar, no hay nada que
   * moderar en un chat de dos.
   */
  @Post(':peerId/messages/:id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fija o desfija un mensaje de la conversación' })
  @ApiResponse({ status: 200, description: '{ messageId, pinned, pinnedById }' })
  pin(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: PinChatMessageBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_pin' },
        { ...body, messageId: id, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Edita el texto de un mensaje propio de la conversación.
   *
   * La autoría la comprueba projects-service —editar el de otro no encuentra
   * fila—, así que aquí no hace falta más que sesión: quien escribe ya compartió
   * proyecto con quien lee.
   */
  @Patch(':peerId/messages/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edita el texto de un mensaje propio de la conversación' })
  @ApiResponse({ status: 200, description: 'Mensaje editado' })
  edit(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: EditChatMessageBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_edit' },
        { ...body, id, peerId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Borra un mensaje **propio**.
   *
   * En privado no hay moderación: no existe un rol por encima de una
   * conversación de dos. El servicio lo fija en `false` y no lo acepta por
   * payload, así que no hay forma de pedir borrar el de la otra persona.
   */
  @Delete(':peerId/messages/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra un mensaje propio de la conversación' })
  @ApiResponse({ status: 200, description: 'Mensaje eliminado' })
  delete(
    @Param('peerId', ParseUUIDPipe) peerId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'chat_direct_delete' },
        { id, peerId, requesterId: req.user!.userId },
      ),
    );
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
