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
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  COLLAB_TICKET_TYP,
  type CollabTicketClaims,
  DOCUMENT_ASSET_ALLOWED_MIME,
  DOCUMENT_ASSET_MAX_BYTES,
  InviteToDocumentBodyDto,
  UpdateDocumentShareBodyDto,
  esImagenDeVerdad,
} from '@praxis/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { DocumentAccessService } from './document-access.service';

/** Colores de cursor en el tiempo real: uno por persona, siempre el mismo. */
const COLORES = ['#f59e0b', '#10b981', '#60a5fa', '#f472b6', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c'];

function colorDe(semilla: string): string {
  let h = 0;
  for (const c of semilla) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

/**
 * Un documento **por su id**, sin pasar por el guard de proyecto (E8 de
 * `docs/PLAN-DOCUMENTOS.md`).
 *
 * Es la puerta de todo lo que no es de un miembro dentro de su espacio: el
 * enlace compartido, la invitación por correo, y también el editor del propio
 * miembro, que pide aquí su billete de tiempo real. Quién entra lo decide
 * `DocumentAccessService` en cada petición.
 *
 * `?k=` es el token del enlace. Viaja en la consulta y no en una cabecera
 * porque es lo que lleva la URL que se comparte.
 */
@ApiTags('Documentos compartidos')
@ApiBearerAuth()
@Controller('documents/:documentId')
export class SharedDocumentsController {
  private readonly log = new Logger(SharedDocumentsController.name);
  private readonly appUrl: string;
  private readonly collabUrl: string;

  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly access: DocumentAccessService,
    private readonly quota: QuotaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('PUBLIC_APP_URL') || 'http://localhost:4100';
    /* Por el propio gateway (`collab-proxy.ts`), igual que en producción. */
    this.collabUrl = config.get<string>('COLLAB_PUBLIC_URL') || 'ws://localhost:3000/api/collab';
  }

  @Get()
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Un documento y lo que puede hacer quien lo pide' })
  async findOne(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Query('k') k: string | undefined,
    @Request() req: Express.Request,
  ) {
    const acceso = await this.access.resolver(id, req.user?.userId ?? null, k ?? null);
    const { linkToken: _t, inviteRole: _r, ...meta } = acceso.meta;
    const { content } = await firstValueFrom(
      this.projectsClient.send<{ content: string }>({ cmd: 'document_collab_load' }, { id }),
    );
    return {
      ...meta,
      content,
      mode: acceso.mode,
      isMember: acceso.esMiembro,
      canShare: acceso.puedeCompartir,
      /* Solo a quien comparte: el token es lo que abre el enlace. */
      ...(acceso.puedeCompartir && { linkToken: acceso.meta.linkToken }),
    };
  }

  /**
   * El billete del tiempo real (E3): un JWT de un minuto con el documento, la
   * persona y el modo. `collab-service` lo valida al conectar y no acepta
   * escrituras de uno de lectura.
   */
  @Post('collab-ticket')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Billete para conectarse al documento en vivo' })
  async ticket(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Query('k') k: string | undefined,
    @Request() req: Express.Request,
  ) {
    const userId = req.user?.userId ?? null;
    const acceso = await this.access.resolver(id, userId, k ?? null);
    const nombre = acceso.nombre ?? 'Invitado';
    const claims: CollabTicketClaims = {
      typ: COLLAB_TICKET_TYP,
      doc: id,
      sub: userId,
      mode: acceso.mode,
      name: nombre,
      color: colorDe(userId ?? `${id}:anonimo`),
    };
    const ticket = this.jwt.sign(claims, { expiresIn: '60s', algorithm: 'HS256' });
    return { ticket, url: this.collabUrl, mode: acceso.mode, name: nombre, color: claims.color };
  }

  /* ─── Compartir ─────────────────────────────────────────────────────── */

  @Get('share')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Cómo se comparte el documento' })
  async share(@Param('documentId', ParseUUIDPipe) id: string, @Request() req: Express.Request) {
    await this.access.exigirCompartir(id, req.user!.userId);
    return this.conEnlace(id);
  }

  @Patch('share')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Cambia quién entra por enlace, o regenera el enlace' })
  async updateShare(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Request() req: Express.Request,
    @Body() body: UpdateDocumentShareBodyDto,
  ) {
    await this.access.exigirCompartir(id, req.user!.userId);
    await firstValueFrom(
      this.projectsClient.send({ cmd: 'document_share_update' }, { ...body, id }),
    );
    return this.conEnlace(id);
  }

  @Post('invites')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Invita a un correo; le llega el enlace' })
  async invite(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Request() req: Express.Request,
    @Body() body: InviteToDocumentBodyDto,
  ) {
    const acceso = await this.access.exigirCompartir(id, req.user!.userId);
    const email = body.email.trim().toLowerCase();
    if (email === acceso.email) {
      throw new BadRequestException('Ese es tu propio correo.');
    }
    await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'document_invite' },
        { documentId: id, email, role: body.role, invitedBy: req.user!.userId },
      ),
    );

    /* Como las invitaciones a organización: el correo no bloquea. Si no sale,
       la invitación ya vale —basta con entrar con ese correo— y el enlace se
       puede pasar a mano. */
    const enlace = `${this.appUrl}/d/${id}`;
    const enviado = await firstValueFrom(
      this.credentialsClient.send<{ enviado: boolean }>(
        { cmd: 'mail_send_document_invite' },
        {
          email,
          titulo: acceso.meta.title,
          invitaPor: acceso.nombre,
          puedeEditar: body.role === 'EDIT',
          enlace,
        },
      ),
    ).catch((error: Error) => {
      this.log.warn(`No se pudo mandar la invitación a ${email}: ${error.message}`);
      return { enviado: false };
    });

    return { ...(await this.conEnlace(id)), enviado: enviado.enviado, enlace };
  }

  @Delete('invites/:inviteId')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Retira una invitación' })
  async uninvite(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Request() req: Express.Request,
  ) {
    await this.access.exigirCompartir(id, req.user!.userId);
    await firstValueFrom(
      this.projectsClient.send({ cmd: 'document_uninvite' }, { documentId: id, inviteId }),
    );
    return this.conEnlace(id);
  }

  /* ─── Imágenes ──────────────────────────────────────────────────────── */

  @Post('assets')
  @UseGuards(OptionalJwtGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_ASSET_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube una imagen al documento (5 MB, PNG/JPEG/GIF/WebP)' })
  async upload(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Query('k') k: string | undefined,
    @Request() req: Express.Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const acceso = await this.access.exigirEdicion(id, req.user?.userId ?? null, k ?? null);
    if (!file || file.size === 0) throw new BadRequestException('No llegó ninguna imagen.');
    if (!(DOCUMENT_ASSET_ALLOWED_MIME as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('Solo imágenes PNG, JPEG, GIF o WebP.');
    }
    if (!esImagenDeVerdad(file.buffer, file.mimetype)) {
      throw new BadRequestException('Ese archivo no es una imagen, aunque lo parezca por el nombre.');
    }
    /* El almacén es de la organización del proyecto, la suba quien la suba:
       un invitado no ocupa asiento, pero sus imágenes sí ocupan espacio. */
    await this.quota.exigirAlmacenamiento(
      acceso.userId ?? acceso.meta.createdBy,
      acceso.meta.projectId,
      file.size,
    );
    const asset = await firstValueFrom(
      this.projectsClient.send<{ id: string }>(
        { cmd: 'document_asset_create' },
        {
          documentId: id,
          filename: file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'imagen',
          mimeType: file.mimetype,
          size: file.size,
          content: file.buffer.toString('base64'),
          uploadedBy: acceso.userId ?? 'anonimo',
        },
      ),
    );
    return { ...asset, src: `/documents/${id}/assets/${asset.id}` };
  }

  @Get('assets/:assetId')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Una imagen del documento' })
  async asset(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Query('k') k: string | undefined,
    @Request() req: Express.Request,
    @Res() res: Response,
  ) {
    await this.access.resolver(id, req.user?.userId ?? null, k ?? null);
    const imagen = await firstValueFrom(
      this.projectsClient.send<{ mimeType: string; content: string }>(
        { cmd: 'document_asset_content' },
        { documentId: id, assetId },
      ),
    );
    const bytes = Buffer.from(imagen.content, 'base64');
    res.setHeader('Content-Type', imagen.mimeType);
    res.setHeader('Content-Length', bytes.length);
    /* Una imagen no cambia nunca (una nueva es otro id): se cachea en el
       navegador, pero **privada**, que la dejó ver un control de acceso. */
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.end(bytes);
  }

  /* ─── Versiones ─────────────────────────────────────────────────────── */

  @Get('revisions')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Versiones del documento, de la más nueva a la más vieja' })
  async revisions(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Query('k') k: string | undefined,
    @Request() req: Express.Request,
  ) {
    await this.access.exigirEdicion(id, req.user?.userId ?? null, k ?? null);
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'document_revisions' }, { documentId: id }),
    );
  }

  @Get('revisions/:revisionId')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Una versión, con su contenido' })
  async revision(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Query('k') k: string | undefined,
    @Request() req: Express.Request,
  ) {
    await this.access.exigirEdicion(id, req.user?.userId ?? null, k ?? null);
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'document_revision' }, { documentId: id, revisionId }),
    );
  }

  private async conEnlace(id: string) {
    const share = await firstValueFrom(
      this.projectsClient.send<{ linkAccess: string; linkToken: string | null }>(
        { cmd: 'document_share' },
        { id },
      ),
    );
    return {
      ...share,
      link: share.linkToken ? `${this.appUrl}/d/${id}?k=${share.linkToken}` : null,
    };
  }
}

/** «Compartidos conmigo»: los documentos a los que te invitaron por correo. */
@ApiTags('Documentos compartidos')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/shared-documents')
export class MySharedDocumentsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  @Get()
  async findAll(@Request() req: Express.Request) {
    const perfil = await firstValueFrom(
      this.credentialsClient.send<{ credential?: { email?: string } }>(
        { cmd: 'user_find_one' },
        { id: req.user!.userId },
      ),
    ).catch(() => null);
    const email = perfil?.credential?.email;
    if (!email) return [];
    return firstValueFrom(this.projectsClient.send({ cmd: 'document_shared_with' }, { email }));
  }
}
