import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FindNotificationsQueryDto } from '@praxis/contracts';
import { type Observable, firstValueFrom, interval, map, merge } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { NotificationsStreamService } from './notifications-stream.service';

/**
 * Cada cuánto se manda un latido por el flujo abierto.
 *
 * Una conexión SSE sin tráfico la cierra cualquier intermediario que haya en
 * medio —el balanceador de Google corta a los 60 s de silencio, y el proxy de
 * la zona tiene su propio tiempo de espera—. El navegador reconectaría solo,
 * pero cada reconexión es una petición nueva y un hueco en el que un aviso se
 * pierde. Con 25 s vamos cómodamente por debajo del más corto.
 */
const LATIDO_MS = 25_000;

/**
 * Los avisos de quien pregunta.
 *
 * Cuelga de `/me` como las tareas y las invitaciones, y por lo mismo: no hay
 * ningún proyecto en la ruta contra el que `ProjectPermissionGuard` pueda
 * comprobar nada, porque la bandeja cruza todos los proyectos de la persona.
 *
 * **La autorización es que solo puedes ver y tocar las tuyas**, y el usuario sale
 * del token, nunca de la petición. Por eso no existe `GET /notifications` con un
 * `userId` por parámetro: sería leer la bandeja de cualquiera.
 */
@ApiTags('My Notifications')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/notifications')
export class MyNotificationsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly avisosEnVivo: NotificationsStreamService,
  ) {}

  /**
   * Los avisos según ocurren, en un flujo abierto (SSE).
   *
   * Es de **una sola vía**: el servidor empuja, el navegador nunca escribe por
   * aquí. Para eso no hacen falta websockets, y evitarlos importa —una conexión
   * bidireccional habría que autenticarla y autorizarla por mensaje, y aquí la
   * autorización es la misma de siempre: el `JwtGuard` del controlador, una vez,
   * al abrir.
   *
   * ⚠️ **`EventSource` no puede mandar cabeceras**, así que el token no llega
   * desde el navegador: llega porque la petición cruza el proxy de la zona, que
   * lee la cookie httpOnly y añade el `Authorization`. Llamar a esta ruta
   * directamente contra el gateway desde el navegador da 401, y así debe ser.
   *
   * El `userId` sale del token, nunca de la petición: no hay forma de pedir el
   * flujo de otra persona.
   */
  @Sse('stream')
  @ApiOperation({ summary: 'Flujo de avisos en vivo de quien hace la petición' })
  stream(@Request() req: Express.Request): Observable<MessageEvent> {
    const avisos = this.avisosEnVivo
      .suscribir(req.user!.userId)
      .pipe(map((aviso): MessageEvent => ({ type: 'aviso', data: aviso })));

    /* El latido va como un tipo de evento propio para que el cliente pueda
       ignorarlo sin confundirlo con un aviso vacío. */
    const latido = interval(LATIDO_MS).pipe(
      map((): MessageEvent => ({ type: 'latido', data: { t: Date.now() } })),
    );

    return merge(avisos, latido);
  }

  /**
   * Bandeja + contador de no leídas.
   *
   * `unread` viaja siempre, también con `unreadOnly=true`: es lo que pinta la
   * insignia de la barra lateral, y sacarlo de `items.length` daría un número
   * recortado por el `limit`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Avisos de quien hace la petición' })
  @ApiResponse({ status: 200, description: 'Bandeja recuperada' })
  findMine(@Request() req: Express.Request, @Query() query: FindNotificationsQueryDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'notification_find_mine' },
        { ...query, userId: req.user!.userId },
      ),
    );
  }

  /** Marca una como leída. Ajena o inexistente responden igual: 404. */
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca un aviso como leído' })
  @ApiResponse({ status: 200, description: 'Aviso marcado' })
  markRead(@Param('id', ParseUUIDPipe) id: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'notification_mark_read' }, { id, userId: req.user!.userId }),
    );
  }

  /** El gesto de «ya lo he visto todo», que es como se vacía una bandeja. */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca todos los avisos como leídos' })
  @ApiResponse({ status: 200, description: 'Avisos marcados' })
  markAllRead(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'notification_mark_all_read' }, { userId: req.user!.userId }),
    );
  }
}
