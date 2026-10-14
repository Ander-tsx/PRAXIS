import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { type ModoVencimiento, modoPorDefecto, textoDelAviso, tramoDe } from './vencimientos';

class ClavesPushDto {
  @IsString()
  @MaxLength(200)
  p256dh: string;

  @IsString()
  @MaxLength(100)
  auth: string;
}

export class SuscripcionPushDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => ClavesPushDto)
  keys: ClavesPushDto;
}

export class BajaPushDto {
  @IsString()
  @MaxLength(1000)
  endpoint: string;
}

export class EstadoPushQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  endpoint?: string;
}

/**
 * Notificaciones push de quien pregunta (`docs/PLAN-PUSH.md`).
 *
 * El usuario sale siempre del token. `endpoint` es el identificador del
 * dispositivo: el cliente lo conoce porque se lo dio el navegador al suscribirse.
 */
@ApiTags('My Push')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/push')
export class MyPushController {
  constructor(@Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy) {}

  /** La clave pública VAPID, que el navegador necesita para suscribirse. */
  @Get('key')
  @ApiOperation({ summary: 'Clave pública VAPID' })
  key() {
    return firstValueFrom(this.projectsClient.send({ cmd: 'push_public_key' }, {}));
  }

  @Get('state')
  @ApiOperation({ summary: 'Si este dispositivo recibe notificaciones' })
  state(@Request() req: Express.Request, @Query() query: EstadoPushQueryDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'push_state' },
        { userId: req.user!.userId, endpoint: query.endpoint ?? null },
      ),
    );
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra este dispositivo' })
  subscribe(
    @Request() req: Express.Request,
    @Body() dto: SuscripcionPushDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'push_subscribe' },
        {
          userId: req.user!.userId,
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          userAgent: userAgent ?? null,
        },
      ),
    );
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Da de baja este dispositivo' })
  unsubscribe(@Request() req: Express.Request, @Body() dto: BajaPushDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'push_unsubscribe' },
        { userId: req.user!.userId, endpoint: dto.endpoint },
      ),
    );
  }
}

/**
 * El recordatorio de vencimientos, que dispara un cron de Railway (dos veces al
 * día) a través de `web` —el gateway no tiene dominio público—.
 *
 * Sin `PUSH_CRON_SECRET` configurado responde **404**, como si la ruta no
 * existiera: una puerta sin cerradura no puede ser el valor por omisión.
 */
@ApiTags('Internal')
@Controller('internal/push')
export class PushCronController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  @Post('vencimientos')
  @HttpCode(HttpStatus.OK)
  async vencimientos(
    @Headers('x-cron-secret') recibido?: string,
    @Query('modo') modoPedido?: string,
  ) {
    const secreto = this.config.get<string>('PUSH_CRON_SECRET');
    if (!secreto) throw new NotFoundException();
    const a = Buffer.from(recibido ?? '');
    const b = Buffer.from(secreto);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();

    const ahora = Date.now();
    const modo: ModoVencimiento =
      modoPedido === 'hoy' || modoPedido === 'manana' ? modoPedido : modoPorDefecto(ahora);

    const tareas = await firstValueFrom(
      this.tasksClient.send<{ title: string; userIds: string[] }[]>(
        { cmd: 'task_find_due_between' },
        tramoDe(modo, ahora),
      ),
    );

    /* Una notificación por persona, no por tarea. */
    const porPersona = new Map<string, string[]>();
    for (const tarea of tareas) {
      for (const userId of tarea.userIds) {
        const lista = porPersona.get(userId) ?? [];
        lista.push(tarea.title);
        porPersona.set(userId, lista);
      }
    }

    const personas = [...porPersona.entries()];
    let enviados = 0;
    /* De veinte en veinte: un cron no debe abrir cientos de conexiones a la vez. */
    for (let i = 0; i < personas.length; i += 20) {
      const resultados = await Promise.all(
        personas.slice(i, i + 20).map(([userId, titulos]) =>
          firstValueFrom(
            this.projectsClient.send<{ enviados: number }>(
              { cmd: 'push_send' },
              {
                userIds: [userId],
                carga: {
                  ...textoDelAviso(modo, titulos),
                  url: '/projects',
                  tag: `vencimientos:${modo}`,
                },
              },
            ),
          ).catch(() => ({ enviados: 0 })),
        ),
      );
      enviados += resultados.reduce((suma, r) => suma + r.enviados, 0);
    }

    return { modo, tareas: tareas.length, personas: personas.length, enviados };
  }
}
