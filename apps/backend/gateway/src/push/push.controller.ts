import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

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

export class VisiblePushDto {
  @IsBoolean()
  visible: boolean;
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

  /** El cliente avisa de si Praxis está a la vista; mientras lo está, no se le manda push de chat. */
  @Post('visible')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Praxis está (o deja de estar) a la vista' })
  visible(@Request() req: Express.Request, @Body() dto: VisiblePushDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'push_visible' },
        { userId: req.user!.userId, visible: dto.visible },
      ),
    );
  }

  /**
   * Una notificación de prueba a **todos tus dispositivos**, sin mirar si Praxis
   * está a la vista. Sirve para saber si el envío funciona de punta a punta.
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manda una notificación de prueba a tus dispositivos' })
  test(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send<{ enviados: number }>(
        { cmd: 'push_send' },
        {
          userIds: [req.user!.userId],
          carga: {
            title: 'Praxis',
            body: 'Así llegarán tus notificaciones.',
            url: '/main/me',
            tag: 'prueba',
          },
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
