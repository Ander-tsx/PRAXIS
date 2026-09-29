import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  ASSISTANT_ATTACHMENT_ALLOWED_MIME,
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  AssistantChatBodyDto,
  AssistantScopeBodyDto,
  ProjectDraftBodyDto,
  RenameConversationBodyDto,
  ResolveProposalBodyDto,
  esImagenDeAsistente,
  validarFirmaChatAdjunto,
} from '@praxis/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { transmitirTurno } from './turno-en-vivo';

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
 *
 * ## Y desde que se puede hablar sin proyecto, el turno también
 *
 * `POST /me/assistant/chat` es el tercer inquilino, y el que más deja claro para
 * qué sirve este controlador: una conversación sin foco no tiene proyecto contra
 * el que comprobar nada, así que la ruta con guard no le vale — habría que
 * inventarse un `projectId` para satisfacerlo.
 *
 * Con él viene `POST /me/assistant/proposals/:id/resolve`, que existe por un
 * motivo mucho más terco: **la de proyecto respondía 404** a cualquier tarjeta de
 * una conversación sin foco, así que no había forma de anotar que se aceptó.
 */
@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/assistant')
export class MyAssistantController {
  private readonly log = new Logger(MyAssistantController.name);

  constructor(
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly cuotas: QuotaService,
  ) {}

  /**
   * Un turno de conversación **sin ningún proyecto cargado**.
   *
   * ## Por qué existe, si ya hay una ruta de chat
   *
   * La otra cuelga de `/projects/:projectId` y exige `canViewReports` sobre ese
   * proyecto. Aquí no hay proyecto: se está hablando de uno que **todavía no
   * existe**, o simplemente se está conversando. Meterlo en la otra ruta habría
   * exigido inventarse un `projectId` de mentira para satisfacer al guard.
   *
   * ## Lo que NO viaja, que es casi todo
   *
   * Sin proyecto no hay permisos que resolver, ni miembros, ni chat de equipo, ni
   * briefing. El servicio lo detecta por `projectId: null` y usa su otro juego de
   * reglas y de herramientas.
   *
   * Lo único que se resuelve aquí son dos cosas, y las dos con **la sesión de
   * quien llama**:
   *
   * - **su nombre**, para que PRAX no le hable en UUID;
   * - **sus proyectos**, los que ya podría abrir en la pantalla, para que
   *   `proponer_abrir_proyecto` tenga contra qué validarse. Que la lista salga de
   *   aquí y no del navegador es lo que impide que alguien se ofrezca a sí mismo
   *   un proyecto ajeno.
   *
   * ⚠️ **Y ninguna de las dos tumba el turno si falla**: sin nombre se omite el
   * bloque, sin proyectos PRAX se queda sin poder ofrecer abrir ninguno. Perder
   * eso empeora la respuesta; perder el turno la borra.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Un turno de conversación con PRAX, sin proyecto' })
  @ApiResponse({ status: 200, description: 'Respuesta, propuestas y cuota' })
  @ApiResponse({ status: 402, description: 'Cuota mensual agotada (QUOTA_EXCEEDED)' })
  @ApiResponse({ status: 502, description: 'Gemini no respondió. No se ha consumido cuota' })
  async chat(@Request() req: Express.Request, @Body() body: AssistantChatBodyDto) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_chat' },
        await this.prepararTurno(req.user!.userId, body),
      ),
    );
  }

  /**
   * El mismo turno, contado mientras ocurre por SSE (D7 de
   * docs/PLAN-PRAX-SEMIAGENTICO.md). Ver `turno-en-vivo.ts`.
   *
   * Lo que falla antes de empezar —la organización, la sesión— sale como un error
   * JSON de los de siempre; lo que falla a medias, como un evento `error`.
   */
  @Post('chat/stream')
  @ApiOperation({ summary: 'Un turno con PRAX, sin proyecto, por Server-Sent Events' })
  async chatEnVivo(
    @Request() req: Express.Request,
    @Body() body: AssistantChatBodyDto,
    @Res() res: Response,
  ) {
    const payload = await this.prepararTurno(req.user!.userId, body);
    transmitirTurno(
      res,
      this.assistantClient.send({ cmd: 'assistant_chat_vivo' }, payload),
      this.log,
    );
  }

  /** Todo lo que el servicio necesita para un turno sin proyecto. */
  private async prepararTurno(userId: string, body: AssistantChatBodyDto) {
    /* 🔴 **Antes de nada, y no en paralelo con lo demás.** Aquí no hay proyecto
       del que sacar la organización, así que la elige quien llama — y si la
       elegida no es suya, esto lanza `403 NOT_IN_ORG` antes de haber pedido
       nada más. Comprobar después sería resolver el plan de una organización
       ajena aunque luego no se usara. */
    const organizationId = await this.cuotas.organizacionElegida(userId, body.organizationId);

    const [alcance, quien, ia] = await Promise.all([
      /* Solo los que la persona dejó en «Recursos» (D5). Con «todo», todos los
         que puede ver en la organización activa. */
      this.alcanceVigente(userId, organizationId),
      this.nombreDe(userId),
      /* `iaDe` y no `limiteDeIa`: esta ruta **gasta** cuota, así que puede
         acabar en un 402 que tiene que decir qué plan puso ese tope. Los dos
         datos salen de la misma resolución a propósito. */
      this.cuotas.iaDe(userId, organizationId),
    ]);

    return {
      /* La marca del modo. El servicio no lo deduce de nada más. */
      projectId: null,
      userId,
      message: body.message,
      conversationId: body.conversationId,
      attachmentIds: body.attachmentIds,
      /* Vacío y no «los de algún proyecto»: no hay proyecto del que sacar
             miembros, y el mapa de permisos de un proyecto que no existe no
             significa nada. */
      permisos: {},
      /* Solo quien pregunta: es lo único que se puede saber sin proyecto, y
             es lo que el prompt necesita para llamarle por su nombre. */
      miembros: quien ? [quien] : [],
      proyectos: alcance.proyectos
        .filter((proyecto) => proyecto.incluido)
        .map(({ id, nombre }) => ({ id, nombre })),
      /* El tope de su plan. Ver la nota de la ruta de proyecto: quien cuenta
             es assistant-service, quien sabe cuánto da el plan es billing. El
             `planTier` va solo para poder nombrarlo si se agota. */
      limiteMensual: ia.limite,
      organizationId: ia.organizationId,
      planTier: ia.tier,
    };
  }

  /**
   * Marcar una propuesta como aplicada o descartada, **sin proyecto**.
   *
   * 🔴 **Sin esto, aceptar cualquier tarjeta de una conversación sin foco daba
   * 404.** La otra ruta de resolver cuelga de `/projects/:projectId`, y en este
   * modo no hay ninguno que poner: la propuesta existe, la conversación existe, y
   * la única forma de anotar la decisión respondía que no.
   *
   * ⚠️ Y **esto no aplica nada**, igual que su hermana: solo anota lo que se
   * decidió para que al releer el hilo no se ofrezca otra vez un botón que ya se
   * pulsó. Quien crea el proyecto de una plantilla es el frontend, llamando a las
   * rutas de siempre con la sesión de quien acepta.
   *
   * Lo que protege esto no es un permiso de proyecto —no hay— sino que el
   * `userId` sale del token y assistant-service comprueba que la propuesta cuelga
   * de una conversación suya.
   */
  @Post('proposals/:proposalId/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anotar si una propuesta se aceptó o se descartó' })
  resolverPropuesta(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Request() req: Express.Request,
    @Body() body: ResolveProposalBodyDto,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_proposal_resolve' },
        { userId: req.user!.userId, proposalId, status: body.status },
      ),
    );
  }

  /**
   * Los proyectos que esta persona podría abrir desde la conversación.
   *
   * **`canViewReports` y no `canViewProject`**, y no es arbitrario: aceptar la
   * propuesta lleva a la ruta de chat del proyecto, que exige exactamente ese
   * permiso. Ofrecer uno sin él sería ofrecer una conversación que responde 403 a
   * la primera pregunta — la misma consulta que ya hace la pantalla al pintar el
   * selector.
   *
   * 🔴 **Solo los de la organización activa** (docs/PLAN-PRAX-SEMIAGENTICO.md,
   * O1 y D6). Iba sin `organizationId` y devolvía los de **todas** las
   * organizaciones de la persona: PRAX podía proponer abrir un proyecto de otra,
   * que es el malentendido que la organización activa existe para evitar.
   *
   * Y un fallo ya no se traga en silencio. Sin lista, `abrir_proyecto` se
   * descarta en cada turno, y eso tiene que poder verse en el log.
   */
  private async proyectosQuePuedeAbrir(
    userId: string,
    organizationId: string | null,
  ): Promise<{ id: string; nombre: string }[]> {
    const pagina = await firstValueFrom(
      this.projectsClient.send<{ items?: { id: string; name: string }[] }>(
        { cmd: 'project_find_all' },
        {
          userId,
          ...(organizationId ? { organizationId } : {}),
          permission: 'canViewReports',
          /* Cien es de sobra para nombrarlos y es el mismo tope que usa la
             pantalla. Lo que no cabe aquí tampoco cabría en el prompt. */
          query: { limit: 100 },
        },
      ),
    ).catch((error: unknown) => {
      this.log.warn(
        `prax_sin_proyectos userId=${userId} organizationId=${organizationId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    });

    return (pagina?.items ?? []).map((proyecto) => ({ id: proyecto.id, nombre: proyecto.name }));
  }

  /**
   * «Recursos» tal y como valen **ahora** (D5).
   *
   * La elección se guarda en assistant-service; qué proyectos existen y cuáles
   * puede ver la persona se mira aquí, en cada llamada. Una lista guardada no es
   * un permiso: a alguien le pueden sacar de un proyecto después de marcarlo, y
   * entonces ese proyecto simplemente deja de salir.
   *
   * Si leer la elección falla, vale «todo»: PRAX con más contexto del elegido es
   * mejor que PRAX sin poder contestar, y los permisos siguen siendo los de
   * siempre.
   */
  private async alcanceVigente(userId: string, organizationId: string | null) {
    const [candidatos, guardado] = await Promise.all([
      this.proyectosQuePuedeAbrir(userId, organizationId),
      organizationId
        ? firstValueFrom(
            this.assistantClient.send<{ modo: 'ALL' | 'SELECTED'; projectIds: string[] }>(
              { cmd: 'assistant_scope_get' },
              { userId, organizationId },
            ),
          ).catch((error: unknown) => {
            this.log.warn(
              `prax_alcance_ilegible userId=${userId} organizationId=${organizationId}: ${(error as Error)?.message ?? error}`,
            );
            return { modo: 'ALL' as const, projectIds: [] };
          })
        : Promise.resolve({ modo: 'ALL' as const, projectIds: [] as string[] }),
    ]);

    const marcados = new Set(guardado.projectIds);
    return {
      organizationId,
      modo: guardado.modo,
      proyectos: candidatos.map((proyecto) => ({
        ...proyecto,
        incluido: guardado.modo === 'ALL' || marcados.has(proyecto.id),
      })),
    };
  }

  /**
   * «Recursos» de la organización activa: los proyectos que PRAX podría
   * consultar y cuáles tiene marcados (D5 de docs/PLAN-PRAX-SEMIAGENTICO.md).
   */
  @Get('scope')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Qué proyectos puede consultar PRAX en la organización activa' })
  async alcance(
    @Request() req: Express.Request,
    @Query('organizationId', new ParseUUIDPipe({ optional: true })) organizationId?: string,
  ) {
    const userId = req.user!.userId;
    const organizacion = await this.cuotas.organizacionElegida(userId, organizationId);
    return this.alcanceVigente(userId, organizacion);
  }

  /**
   * Guardar «Recursos».
   *
   * 🔴 **Cada proyecto marcado se comprueba aquí**: tiene que ser de la
   * organización activa y visible con `canViewReports`. Sin esto, escribir el id
   * de un proyecto ajeno en el cuerpo lo metería en el contexto de PRAX.
   */
  @Put('scope')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elegir qué proyectos puede consultar PRAX' })
  @ApiResponse({ status: 400, description: 'Un proyecto no es de esta organización o no lo ves' })
  async guardarAlcance(@Request() req: Express.Request, @Body() body: AssistantScopeBodyDto) {
    const userId = req.user!.userId;
    const organizacion = await this.cuotas.organizacionElegida(userId, body.organizationId);
    if (!organizacion) {
      throw new BadRequestException('No hay ninguna organización a la que atar estos recursos.');
    }

    if (body.modo === 'SELECTED') {
      const visibles = new Set(
        (await this.proyectosQuePuedeAbrir(userId, organizacion)).map((proyecto) => proyecto.id),
      );
      const ajenos = body.projectIds.filter((id) => !visibles.has(id));
      if (ajenos.length > 0) {
        throw new BadRequestException(
          'Alguno de esos proyectos no es de esta organización o no puedes hablar de él con PRAX.',
        );
      }
    }

    await firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_scope_set' },
        {
          userId,
          organizationId: organizacion,
          alcance: { modo: body.modo, projectIds: body.projectIds },
        },
      ),
    );
    return this.alcanceVigente(userId, organizacion);
  }

  /** Quién pregunta, para que PRAX no le hable en UUID. */
  private async nombreDe(userId: string): Promise<{ userId: string; nombre: string } | null> {
    const perfiles = await firstValueFrom(
      this.credentialsClient.send<{ id: string; firstName?: string; lastName?: string }[]>(
        { cmd: 'user_find_by_ids' },
        { ids: [userId] },
      ),
    ).catch(() => null);

    const perfil = (perfiles ?? [])[0];
    const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
    /* Sin nombre no se manda el id como si lo fuera: el prompt omite el bloque
       entero, que es mejor que «QUIEN TE ESCRIBE: 7f3a-…». */
    return nombre ? { userId, nombre } : null;
  }

  /**
   * Mis conversaciones **de la organización activa** (D6).
   *
   * `?organizationId=` es la activa; se valida la pertenencia como en el chat. Las
   * conversaciones de antes de que existiera la columna salen en la personal.
   */
  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis conversaciones de la organización activa, la última arriba' })
  async conversaciones(
    @Request() req: Express.Request,
    @Query('organizationId', new ParseUUIDPipe({ optional: true })) organizationId?: string,
  ) {
    const userId = req.user!.userId;
    const ambito = await this.cuotas.ambitoDePrax(userId, organizationId);
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversations' },
        { userId, ...(ambito ? { ambito } : {}) },
      ),
    );
  }

  @Get('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Una conversación con sus mensajes y propuestas' })
  @ApiResponse({ status: 404, description: 'No existe, no es tuya o es de otra organización' })
  async conversacion(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: Express.Request,
    @Query('organizationId', new ParseUUIDPipe({ optional: true })) organizationId?: string,
  ) {
    const userId = req.user!.userId;
    const ambito = await this.cuotas.ambitoDePrax(userId, organizationId);
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversation' },
        { userId, conversationId, ...(ambito ? { ambito } : {}) },
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
  async quota(
    @Request() req: Express.Request,
    @Query('organizationId') organizationIdPedida?: string,
  ) {
    const userId = req.user!.userId;
    /* La misma resolución que el chat: sin ella, la pantalla pintaría el
       contador de una organización y el turno se cobraría en otra. */
    const organizationId = await this.cuotas.organizacionElegida(userId, organizationIdPedida);
    const limiteMensual = await this.cuotas.limiteDeIa(userId, organizationId);

    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_quota' },
        { userId, limiteMensual, organizationId },
      ),
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
   * - **402** `QUOTA_EXCEEDED`, con el detalle del tope y la cuota en `details`;
   * - **502** Gemini no respondió, o respondió algo inservible. En el primer
   *   caso **no se ha consumido cuota**.
   */
  @Post('project-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plantilla propuesta para un proyecto nuevo, sin crear nada' })
  @ApiResponse({ status: 200, description: 'La plantilla propuesta y la cuota restante' })
  @ApiResponse({ status: 402, description: 'Cuota mensual agotada (QUOTA_EXCEEDED)' })
  @ApiResponse({ status: 502, description: 'El asistente no devolvió una plantilla utilizable' })
  async borradorDeProyecto(@Request() req: Express.Request, @Body() body: ProjectDraftBodyDto) {
    const userId = req.user!.userId;
    /* Gasta cuota, así que necesita también el plan: ver la nota de `chat`. Y la
       organización, que es contra quien se cobra: el proyecto todavía no existe,
       así que no hay recurso del que derivarla. */
    const organizationId = await this.cuotas.organizacionElegida(userId, body.organizationId);
    const ia = await this.cuotas.iaDe(userId, organizationId);

    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_project_draft' },
        {
          userId,
          brief: body.brief,
          ajuste: body.ajuste,
          previa: body.previa,
          limiteMensual: ia.limite,
          organizationId: ia.organizationId,
          planTier: ia.tier,
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
