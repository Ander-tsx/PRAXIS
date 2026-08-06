import {
  Controller,
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
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FindNotificationsQueryDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

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
  constructor(@Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy) {}

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
