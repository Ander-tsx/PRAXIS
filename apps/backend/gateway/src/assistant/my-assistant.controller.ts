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
  ASSISTANT_ATTACHMENT_ALLOWED_MIME,
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  ProjectDraftBodyDto,
  RenameConversationBodyDto,
  esImagenDeAsistente,
  validarFirmaChatAdjunto,
} from '@praxis/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

/**
 * Lo del asistente que **no tiene proyecto detrás**.
 *
 * `GET /projects/:projectId/assistant/quota` existe porque el guard necesita un
 * proyecto contra el que resolver `canViewProject` — pero la cuota es del
 * usuario, no del proyecto, y hay pantallas (Configuración) que quieren
 * enseñarla sin que haya ningún proyecto abierto. Cuelga de `/me` como
 * `/me/tasks` y `/me/notifications`, por el mismo motivo: sin
 * `ProjectPermissionGuard`, el usuario sale del token.
 *
 * Desde la plantilla de arranque hay un segundo inquilino con la misma forma y
 * un motivo más fuerte: **se pide para crear un proyecto, así que el proyecto
 * todavía no existe**. No hay `projectId` que poner en la ruta ni permisos de
 * proyecto que comprobar.
 *
 * ## Y desde el foco cambiable, las conversaciones
 *
 * ⚠️ **Estaban en `/projects/:projectId/assistant/conversations` y se han mudado
 * aquí.** Una conversación ya no es de un proyecto: es de la persona, y el
 * proyecto es el foco de cada turno, que puede cambiar a mitad. Con la ruta
 * anterior, pedir un hilo que había pasado por otro proyecto daba 404 — justo el
 * gesto que el foco cambiable viene a permitir.
 *
 * ⚠️ **Eso quita `canViewReports` de estas cuatro rutas, y hay que entender por
 * qué no es un agujero.** Ese permiso nunca protegió estos hilos: es del
 * proyecto, así que con él cualquier compañero del mismo rol habría podido leer
 * las conversaciones ajenas. Lo que las protege —y sigue protegiéndolas— es que
 * el `userId` sale del token y assistant-service filtra por él, devolviendo 404
 * y no 403 para no confirmar que un id existe.
 *
 * El permiso se sigue exigiendo donde de verdad hace falta: en
 * `POST /projects/:projectId/assistant/chat`, que es lo único que **lee datos
 * del proyecto**.
 */
@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/assistant')
export class MyAssistantController {
  constructor(@Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy) {}

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis conversaciones con el asistente, la última arriba' })
  conversaciones(@Request() req: Express.Request) {
    return firstValueFrom(
      this.assistantClient.send({ cmd: 'assistant_conversations' }, { userId: req.user!.userId }),
    );
  }

  @Get('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Una conversación con sus mensajes y propuestas' })
  @ApiResponse({ status: 404, description: 'No existe, o no es tuya' })
  conversacion(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversation' },
        { userId: req.user!.userId, conversationId },
      ),
    );
  }

  @Patch('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renombrar una conversación' })
  renombrar(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: Express.Request,
    @Body() body: RenameConversationBodyDto,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversation_rename' },
        { userId: req.user!.userId, conversationId, title: body.title },
      ),
    );
  }

  /**
   * Borrar una conversación propia.
   *
   * No contradice la regla de que el asistente nunca borra: ahí quien borraría
   * es el modelo, sobre el trabajo de un equipo. Aquí borra una persona sus
   * propios mensajes, que es lo mínimo que se le debe a quien deja rastro de lo
   * que escribe.
   */
  @Delete('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borrar una conversación propia' })
  borrar(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversation_delete' },
        { userId: req.user!.userId, conversationId },
      ),
    );
  }

  /**
   * Sube un archivo para PRAX y lo deja como **borrador**.
   *
   * ## Por qué es una ruta aparte y no va dentro de la pregunta
   *
   * 🔴 Los adjuntos viajaban en base64 dentro del cuerpo de
   * `POST /projects/:id/assistant/chat`, y ese cuerpo lo manda una **Server
   * Action de Next, topada en 1 MB**. Cualquier foto de teléfono lo pasa, y lo
   * que se veía era «Body exceeded 1 MB limit»: un error de Next, sin traducir,
   * que no dice qué archivo ni qué hacer, y que ni siquiera llegaba a nuestro
   * código para poder explicarlo. Multipart no pasa por esa tubería.
   *
   * ## Sin `projectId`, y no es un olvido
   *
   * Se adjunta **antes** de escribir, y en un chat recién abierto puede que
   * todavía no haya ni conversación ni proyecto elegido. El archivo es de quien
   * lo sube y de nadie más: `uploadedBy` es lo único que lo protege, y sale del
   * token. El turno lo reclama después con `attachmentIds`.
   *
   * ⚠️ El tope va en el propio interceptor **además** de en el servicio: así el
   * archivo enorme se corta al recibirlo, en vez de cruzar TCP entero para que
   * lo rechacen al otro lado.
   */
  @Post('attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ASSISTANT_ATTACHMENT_MAX_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube un archivo para el asistente (borrador hasta enviar)' })
  @ApiResponse({ status: 201, description: 'Metadatos del adjunto' })
  subirAdjunto(@Request() req: Express.Request, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No llegó ningún archivo en el campo «file»');
    }
    if (!(ASSISTANT_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('PRAX solo puede leer PDF, imágenes, texto y Markdown.');
    }
    if (file.size === 0) {
      throw new BadRequestException('El archivo está vacío');
    }
    /**
     * ⚠️ **El `mimetype` lo declara quien sube el archivo.** Se comprueba la
     * firma de los primeros bytes contra el tipo declarado, igual que en el chat
     * de equipo — y se reutiliza esa función tal cual: cubre los cinco tipos que
     * acepta PRAX y no hay dos formas de mirar un PNG.
     */
    if (!validarFirmaChatAdjunto(file.mimetype, file.buffer)) {
      throw new BadRequestException('Ese archivo no es lo que parece por el nombre.');
    }

    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_attachment_create' },
        {
          userId: req.user!.userId,
          filename: sanitizeFilename(file.originalname),
          mimeType: file.mimetype,
          content: file.buffer.toString('base64'),
        },
      ),
    );
  }

  /**
   * Descarta un borrador. Es la equis del chip, antes de enviar.
   *
   * Solo borradores: uno ya enviado forma parte del hilo, y quitarlo dejaría a
   * PRAX citando un archivo que ya no está. Para eso está borrar la conversación.
   */
  @Delete('attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descartar un adjunto que aún no se ha enviado' })
  descartarAdjunto(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_attachment_delete' },
        { userId: req.user!.userId, attachmentId },
      ),
    );
  }

  /**
   * Los bytes de un adjunto.
   *
   * Misma política de entrega que en el chat de equipo: las imágenes en línea
   * —van a un `<img>`, que no ejecuta nada— y **todo lo demás como descarga**,
   * con `nosniff`. El PDF aquí no se sirve en línea: no hay visor en esta
   * pantalla, y una burbuja de archivo se abre para guardarlo.
   *
   * El `filename*` va con codificación RFC 5987 para que los acentos y los
   * espacios sobrevivan a la cabecera.
   */
  @Get('attachments/:attachmentId/content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarga el contenido de un adjunto del asistente' })
  @ApiResponse({ status: 200, description: 'Bytes del archivo' })
  async contenidoDeAdjunto(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Request() req: Express.Request,
    @Res() res: Response,
  ) {
    const archivo = await firstValueFrom(
      this.assistantClient.send<{
        filename: string;
        mimeType: string;
        content: string;
      }>({ cmd: 'assistant_attachment_get_content' }, { userId: req.user!.userId, attachmentId }),
    );

    const buffer = Buffer.from(archivo.content, 'base64');
    const entrega = esImagenDeAsistente(archivo.mimeType) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', archivo.mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader(
      'Content-Disposition',
      `${entrega}; filename*=UTF-8''${encodeURIComponent(archivo.filename)}`,
    );
    /* Privada y corta: el archivo es de una persona, y la vista previa de la
       burbuja lo vuelve a pedir en cada render mientras la conversación está
       abierta. */
    res.setHeader('Cache-Control', 'private, max-age=300');

    res.end(buffer);
  }

  @Get('quota')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cuota mensual del asistente para quien llama, sin proyecto' })
  @ApiResponse({ status: 200, description: 'plan, usados, limite, periodo y fecha de reinicio' })
  quota(@Request() req: Express.Request) {
    return firstValueFrom(
      this.assistantClient.send({ cmd: 'assistant_quota' }, { userId: req.user!.userId }),
    );
  }

  /**
   * Propone la estructura de arranque de un proyecto nuevo.
   *
   * **No crea nada.** Devuelve nombres —etiquetas, roles, espacios, tableros y
   * columnas— y quien los materializa es el frontend, llamando una a una a las
   * rutas que ya usa cada formulario, con la sesión de quien acepta y bajo los
   * guards de siempre. Es la regla de §26.1 aplicada a una pantalla donde
   * todavía no hay proyecto: la IA propone; ejecuta el código que ya existe.
   *
   * Solo pide sesión, y basta: lo único que puede hacer alguien autenticado con
   * esta ruta es gastarse **su propia** cuota mensual, que es exactamente lo
   * mismo que puede hacer con el chat.
   *
   * Códigos que puede devolver, además de los normales:
   * - **429** cuota agotada, con la cuota en `details`;
   * - **502** Gemini no respondió, o respondió algo inservible. En el primer
   *   caso **no se ha consumido cuota**.
   */
  @Post('project-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plantilla propuesta para un proyecto nuevo, sin crear nada' })
  @ApiResponse({ status: 200, description: 'La plantilla propuesta y la cuota restante' })
  @ApiResponse({ status: 429, description: 'Cuota mensual agotada' })
  @ApiResponse({ status: 502, description: 'El asistente no devolvió una plantilla utilizable' })
  borradorDeProyecto(@Request() req: Express.Request, @Body() body: ProjectDraftBodyDto) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_project_draft' },
        {
          userId: req.user!.userId,
          brief: body.brief,
          ajuste: body.ajuste,
          previa: body.previa,
        },
      ),
    );
  }
}

/**
 * Deja el nombre en algo que se pueda guardar en disco sin sorpresas.
 *
 * Barras fuera —un `../` en el nombre es lo que convierte una descarga en una
 * escritura donde no toca— y caracteres de control fuera, que son los que rompen
 * la cabecera `Content-Disposition`. Gemelo del de `project-chat.controller.ts`.
 */
function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[/\\]/g, '_')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: es justo lo que hay que quitar
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  return clean.slice(0, 255) || 'archivo';
}
