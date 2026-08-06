import { Controller, Get, HttpCode, HttpStatus, Inject, Query, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FindAdminActivityQueryDto, GLOBAL_ROLES } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireGlobalRole } from '../common/decorators/require-global-role.decorator';
import { GlobalRoleGuard } from '../common/guards/global-role.guard';

/**
 * El registro de actividad administrativa, consultable con filtros.
 *
 * ## Solo lectura, y solo esta ruta
 *
 * No hay `POST`: las entradas las escribe el gateway desde dentro
 * (`AdminActivityRecorder`) justo después de cada acción, nunca un cliente. Y no
 * hay `PATCH` ni `DELETE` en ningún nivel de la pila, tampoco para un
 * SuperAdmin: un registro que se puede reescribir no es auditoría.
 *
 * ## Lo ve cualquier administrador, incluida la actividad del SuperAdmin
 *
 * `Admin` como mínimo, sin filtrar por nivel. Un registro de auditoría con
 * partes ocultas según quién mire sirve de poco, y el caso que más importa
 * —quién tocó qué cuenta— es justo el que un `Admin` necesita poder ver del
 * nivel de encima.
 *
 * ## No es tiempo real, y no lo finge
 *
 * No hay WebSocket ni SSE en el repo. Quien quiera sensación de actualidad
 * reconsulta, igual que hace la bandeja de avisos con `AutoRefresh`. Un endpoint
 * que se llamara «stream» y por dentro hiciera lo mismo sería peor que decirlo.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@RequireGlobalRole(GLOBAL_ROLES.ADMIN)
@UseGuards(JwtGuard, GlobalRoleGuard)
@Controller('admin/activity')
export class AdminActivityController {
  constructor(@Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy) {}

  /**
   * Filtros por **query params**: quién (`actorId`), sobre quién (`targetId`),
   * qué (`action`, `targetType`) y cuándo (`from`, `to`), más `page` y `limit`.
   *
   * El «por qué» no se filtra: es texto libre, y una caja de búsqueda sobre él
   * prometería más de lo que puede cumplir.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registro de acciones de administración, con filtros' })
  @ApiResponse({ status: 200, description: 'Registro recuperado: { items, total, page, limit }' })
  @ApiResponse({ status: 403, description: 'Requiere rol global Admin o superior' })
  find(@Query() query: FindAdminActivityQueryDto) {
    return firstValueFrom(
      this.permissionsClient.send({ cmd: 'admin_activity_find' }, query.toFindAdminActivityDto()),
    );
  }
}
