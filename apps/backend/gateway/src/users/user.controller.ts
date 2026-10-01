import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
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
import { DeleteUserDto, FindUsersQueryDto, UpdateUserBodyDto } from '@praxis/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { AccountOwnerGuard } from '../common/guards/account-owner.guard';
import { PresenceService } from '../presence/presence.service';

/**
 * Tope de la foto de perfil: 2 MB.
 *
 * Mucho menos que un adjunto del chat (25 MB) a propósito: una foto de perfil
 * se pinta en cada burbuja y en cada lista de equipo, y de 2 MB ya salen 512 px
 * de sobra. Lo que se evita es que alguien suba una foto de cámara sin recortar
 * y la pague todo el que abra la pantalla.
 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Tipos que se aceptan como foto.
 *
 * ⚠️ **Sin SVG**, por el mismo motivo que en el chat y en los adjuntos de
 * tarea: es XML con scripts, y servirlo desde el mismo origen que la aplicación
 * es XSS con todas las letras.
 */
const AVATAR_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** ¿Los primeros bytes dicen lo mismo que el `Content-Type` declarado? */
function firmaDeImagenValida(mimeType: string, contenido: Uint8Array): boolean {
  const empiezaPor = (firma: number[], offset = 0) =>
    contenido.length >= offset + firma.length &&
    firma.every((byte, i) => contenido[offset + i] === byte);

  if (mimeType === 'image/png') return empiezaPor([0x89, 0x50, 0x4e, 0x47]);
  if (mimeType === 'image/jpeg') return empiezaPor([0xff, 0xd8, 0xff]);
  if (mimeType === 'image/webp')
    return empiezaPor([0x52, 0x49, 0x46, 0x46]) && empiezaPor([0x57, 0x45, 0x42, 0x50], 8);
  return false;
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly presencia: PresenceService,
  ) {}

  /**
   * Cambia la presencia **elegida** por la que se le enseña al resto.
   *
   * ## Por qué se hace aquí y no en credentials-service
   *
   * `User.presence` es lo que la persona eligió, y por sí solo miente: era
   * front-driven —el navegador avisaba al cerrar la pestaña— así que una
   * conexión que se corta, una batería que se agota o un navegador que se cae
   * dejaban la cuenta «Disponible» **para siempre**. Usuarios fantasma.
   *
   * La otra mitad del dato —si hay una conexión abierta— solo la conoce el
   * gateway, que es quien mantiene los flujos SSE. credentials-service no tiene
   * forma de saberlo y no debería: no participa en el tiempo real.
   *
   * Así que se cruza en el último punto por el que pasa un perfil antes de salir
   * hacia el navegador, y **toda** la interfaz se corrige sola: el punto del
   * avatar en el chat, la lista de conversaciones, el equipo del proyecto. Sin
   * esto habría que acordarse en cada pantalla.
   *
   * Una sola consulta a Redis (`MGET`) para toda la lista, no una por persona.
   */
  private async conPresenciaReal<T extends { id: string; presence?: string | null }>(
    usuarios: T[],
  ): Promise<T[]> {
    if (usuarios.length === 0) return usuarios;

    const vivos = await this.presencia.conectados(usuarios.map((usuario) => usuario.id));
    return usuarios.map((usuario) => ({
      ...usuario,
      presence: this.presencia.efectiva(usuario.presence, vivos.has(usuario.id)),
    }));
  }

  /** Lo mismo para un perfil suelto. */
  private async unoConPresenciaReal<T extends { id: string; presence?: string | null }>(
    usuario: T | null,
  ): Promise<T | null> {
    if (!usuario) return usuario;
    const [conPresencia] = await this.conPresenciaReal([usuario]);
    return conPresencia ?? usuario;
  }

  /**
   * Filtros por **query params**, no por body: `fetch` no puede enviar cuerpo
   * en un GET y esta ruta era inalcanzable desde el navegador.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buscar o listar usuarios' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios recuperada' })
  async findAll(@Query() query: FindUsersQueryDto) {
    /**
     * `?ids=a,b,c` resuelve varios perfiles concretos en **una** petición.
     *
     * El `cmd` ya existía —lo usa el panel de administración— y lo único que
     * faltaba era la puerta HTTP. Sin ella, cada pantalla que
     * tiene una lista de `userId` (la bandeja de avisos, el equipo de un
     * proyecto, el chat, la rejilla de proyectos) pedía **un `GET /users/:id`
     * por persona**.
     *
     * ⚠️ **Se responde con la misma forma que el listado** (`{ items, total }`)
     * aunque aquí no haya paginación que valga: quien consume esta ruta no
     * debería tener que desenvolver dos formas distintas según el parámetro que
     * mandó. `total` es cuántos se encontraron, que con ids es lo mismo que
     * `items.length` — y puede ser menor que los ids pedidos si alguno ya no
     * existe, que no es un error.
     *
     * No se combina con `search` ni con la paginación: si llegan los dos, mandan
     * los ids. Mezclarlos daría una consulta que nadie necesita y dos formas de
     * significar lo mismo.
     */
    if (query.ids?.length) {
      const items = await firstValueFrom(
        this.credentialsClient.send<{ id: string; presence?: string | null }[]>(
          { cmd: 'user_find_by_ids' },
          { ids: query.ids },
        ),
      );
      const conPresencia = await this.conPresenciaReal(Array.isArray(items) ? items : []);
      return { items: conPresencia, total: conPresencia.length };
    }

    const pagina = await firstValueFrom(
      this.credentialsClient.send<{ items?: { id: string; presence?: string | null }[] }>(
        { cmd: 'user_find_all' },
        query.toFindUsersDto(),
      ),
    );
    return { ...pagina, items: await this.conPresenciaReal(pagina?.items ?? []) };
  }

  /**
   * El perfil de quien pregunta.
   *
   * ⚠️ Va **antes** de `@Get(':id')`: Nest resuelve por orden de declaración y
   * la ruta con parámetro se comería «me» tratándolo como un id —que además
   * fallaría en `ParseUUIDPipe` con un 400 de lo más confuso.
   *
   * Existe para que el frontend no tenga que sacar el `sub` del JWT y pedir
   * `/users/:id` por su cuenta: eso obligaba a cada zona a saber leer un token
   * que, por diseño, es una cookie httpOnly que el navegador no puede abrir.
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perfil de quien hace la petición' })
  @ApiResponse({ status: 200, description: 'Perfil recuperado' })
  async findMe(@Request() req: Express.Request) {
    return this.unoConPresenciaReal(
      await firstValueFrom(
        this.credentialsClient.send<{ id: string; presence?: string | null } | null>(
          { cmd: 'user_find_one' },
          { id: req.user!.userId },
        ),
      ),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de usuario por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del usuario recuperado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.unoConPresenciaReal(
      await firstValueFrom(
        this.credentialsClient.send<{ id: string; presence?: string | null } | null>(
          { cmd: 'user_find_one' },
          { id },
        ),
      ),
    );
  }

  /**
   * Solo el dueño de la cuenta o un administrador global (`AccountOwnerGuard`).
   *
   * ⚠️ El `id` va **después** del spread: si fuera `{ id, ...body }`, un `id`
   * colado en el cuerpo pisaría al de la ruta y se saltaría el guard, que
   * comprueba el parámetro de ruta.
   */
  @Patch(':id')
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Actualizar información de un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  @ApiResponse({ status: 403, description: 'Solo puedes modificar tu propia cuenta' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserBodyDto) {
    const actualizado = await firstValueFrom(
      this.credentialsClient.send<{ id: string; presence?: string | null } | null>(
        { cmd: 'user_update' },
        { ...body, id },
      ),
    );

    const conPresencia = await this.unoConPresenciaReal(actualizado);

    /**
     * Un cambio **manual** de estado se anuncia a quien comparte proyecto.
     *
     * Sin esto, ponerse «No molestar» solo se veía en la pantalla de quien lo
     * hizo: el resto seguía viendo el punto verde hasta que su navegador
     * volviera a pedir un perfil, cosa que puede no pasar en toda la sesión.
     *
     * ⚠️ Se anuncia **la presencia efectiva**, no lo que llega en el cuerpo: si
     * la conexión se ha caído entre medias, lo que hay que enseñar es «ausente»
     * y no el estado que se acaba de guardar. La verdad es el cruce, siempre.
     */
    if (body.presence !== undefined && conPresencia) {
      void this.presencia.anunciar(
        id,
        this.presencia.efectiva(conPresencia.presence, await this.presencia.estaConectado(id)),
      );
    }

    return conPresencia;
  }

  /**
   * Sube la foto de perfil.
   *
   * ⚠️ **La ruta lleva el `:id` y el guard de dueño**, aunque siempre sea la
   * tuya: es la misma regla que `PATCH` y `DELETE` de esta clase, y hacerla
   * `/users/me/avatar` habría sido la única de las cuatro con otra forma.
   */
  @Post(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountOwnerGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube la foto de perfil' })
  @ApiResponse({ status: 200, description: 'Perfil con la avatarUrl nueva' })
  async setAvatar(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No llegó ningún archivo en el campo «file»');
    if (!(AVATAR_ALLOWED_MIME as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('La foto tiene que ser PNG, JPEG o WebP.');
    }
    if (file.size === 0) throw new BadRequestException('El archivo está vacío');
    /* El `mimetype` lo declara quien sube: se comprueba contra la firma real,
       igual que en los adjuntos del chat. */
    if (!firmaDeImagenValida(file.mimetype, file.buffer)) {
      throw new BadRequestException('Ese archivo no es la imagen que dice ser.');
    }

    return await firstValueFrom(
      this.credentialsClient.send(
        { cmd: 'user_set_avatar' },
        { userId: id, mimeType: file.mimetype, base64: file.buffer.toString('base64') },
      ),
    );
  }

  /**
   * Vuelve a la foto de la cuenta de Google. Mismo guard de dueño que las demás:
   * es tu cuenta y tu foto.
   */
  @Post(':id/avatar/google')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Usa la foto de la cuenta de Google' })
  async useGoogleAvatar(@Param('id', ParseUUIDPipe) id: string) {
    return await firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_use_google_avatar' }, { userId: id }),
    );
  }

  @Delete(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Quita la foto de perfil' })
  async deleteAvatar(@Param('id', ParseUUIDPipe) id: string) {
    return await firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_delete_avatar' }, { userId: id }),
    );
  }

  /**
   * Sirve los bytes de la foto.
   *
   * **Sin `AccountOwnerGuard`**: una foto de perfil la ve cualquiera que esté
   * dentro —sale en cada burbuja del chat y en cada lista de equipo—, así que
   * basta con tener sesión. Lo que no se expone por aquí es nada más del perfil.
   */
  
  @Get(':id/cover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bytes de la foto de portada' })
  async getCover(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const cover = await firstValueFrom(
      this.credentialsClient.send<{ mimeType: string; size: number; base64: string } | null>(
        { cmd: 'user_get_cover' },
        { userId: id },
      ),
    );
    if (!cover) throw new NotFoundException('Esa cuenta no tiene portada');

    const bytes = Buffer.from(cover.base64, 'base64');
    res.setHeader('Content-Type', cover.mimeType);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(bytes);
  }

  @Post(':id/cover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountOwnerGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube la foto de portada' })
  @ApiResponse({ status: 200, description: 'Perfil con la coverUrl nueva' })
  async setCover(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No llegó ningún archivo en el campo «file»');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('La foto tiene que ser PNG, JPEG o WebP.');
    }
    if (file.size === 0) throw new BadRequestException('El archivo está vacío');

    return this.unoConPresenciaReal(
      await firstValueFrom(
        this.credentialsClient.send<any>(
          { cmd: 'user_set_cover' },
          { userId: id, mimeType: file.mimetype, base64: file.buffer.toString('base64') },
        ),
      ),
    );
  }

  @Delete(':id/cover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Borra la foto de portada' })
  @ApiResponse({ status: 200, description: 'Perfil sin coverUrl' })
  async deleteCover(@Param('id', ParseUUIDPipe) id: string) {
    return this.unoConPresenciaReal(
      await firstValueFrom(
        this.credentialsClient.send<any>({ cmd: 'user_delete_cover' }, { userId: id }),
      ),
    );
  }

  @Get(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bytes de la foto de perfil' })
  async getAvatar(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const avatar = await firstValueFrom(
      this.credentialsClient.send<{ mimeType: string; size: number; base64: string } | null>(
        { cmd: 'user_get_avatar' },
        { userId: id },
      ),
    );
    if (!avatar) throw new NotFoundException('Esa cuenta no tiene foto');

    const bytes = Buffer.from(avatar.base64, 'base64');
    res.setHeader('Content-Type', avatar.mimeType);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    /* Un año de caché **inmutable**: la URL lleva `?v=<epoch>` y cambia con
       cada foto nueva, así que la respuesta vieja nunca se pide otra vez. Sin
       la versión en la URL, esto sería justo lo que dejaría la foto vieja
       pegada durante un año. */
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(bytes);
  }

  @Delete(':id')
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Eliminar un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  @ApiResponse({ status: 403, description: 'Solo puedes eliminar tu propia cuenta' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return await firstValueFrom(
      this.credentialsClient.send({ cmd: 'user_delete' }, { id } satisfies DeleteUserDto),
    );
  }
}
