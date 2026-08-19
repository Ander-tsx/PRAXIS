import { Controller, Get, Inject, Query, Request, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ProjectPermission,
  ReportPortfolioQueryDto,
  type ReportPortfolioRow,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

/**
 * Cuántos proyectos entran en la cartera.
 *
 * El mismo tope que usa `/me/tasks` para acotar la búsqueda. No es una
 * paginación: es un cortafuegos para que una cuenta con cien proyectos no
 * convierta esta ruta en una consulta sin límite. Quien pase de aquí verá los
 * cien primeros de su listado, que es más de lo que se lee de un vistazo.
 */
const MAX_PROYECTOS = 100;

/**
 * La cartera: todos tus proyectos en una tabla, para saber en cuál entrar.
 *
 * ## Por qué cuelga de `/me` y no de `/projects/:id`
 *
 * Porque no hay ningún proyecto en la ruta contra el que comprobar un permiso —
 * es el mismo motivo por el que `/me/tasks` existe—. Lo que sí hay es una
 * decisión de acceso, y se toma aquí: **la lista de proyectos se pide ya
 * filtrada por `canViewReports`**, así que la línea es exactamente la misma que
 * la de la pantalla de un proyecto, resuelta una vez en vez de N.
 *
 * ⚠️ **Esa lista es toda la seguridad de la vista.** Ni reports-service ni
 * tasks-service comprueban nada: reciben `projectIds` y agregan. Si algún día
 * otro sitio construye esa lista, tiene que filtrarla igual.
 *
 * ## Y agrega en el servidor, que era el encargo
 *
 * La alternativa —que el navegador pidiera el informe de cada proyecto— eran N
 * peticiones, N resoluciones de permisos en `ProjectPermissionGuard` y N
 * travesías del proxy de la zona, para pintar una tabla. Es el mismo cálculo que
 * llevó a agrupar los siete informes en R4.2, multiplicado por cuántos proyectos
 * lleve cada cual. Aquí son **dos** consultas agrupadas por proyecto, cueste uno
 * o cincuenta.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/reports')
export class MyReportsController {
  constructor(
    @Inject('REPORTS_SERVICE') private readonly reportsClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** El umbral de parón, acotado como el `days` de los demás informes. */
  private umbral(dias?: string): number {
    if (dias === undefined) return 7;
    const n = Number(dias);
    if (!Number.isFinite(n)) return 7;
    return Math.min(Math.max(Math.trunc(n), 1), 365);
  }

  @Get('portfolio')
  @ApiOperation({ summary: 'Una fila por proyecto con análisis abierto' })
  @ApiResponse({
    status: 200,
    description: 'Sin ningún proyecto con `canViewReports`, una lista vacía. No es un error',
  })
  async portfolio(@Request() req: Express.Request, @Query() query: ReportPortfolioQueryDto) {
    const userId = req.user!.userId;

    const projects = await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_find_all' },
        {
          userId,
          permission: ProjectPermission.CAN_VIEW_REPORTS,
          query: { page: 1, limit: MAX_PROYECTOS },
        },
      ),
    );

    const items: { id: string; name: string; slug: string }[] = projects?.items ?? [];
    const projectIds = items.map((proyecto) => proyecto.id);

    const filas = await firstValueFrom(
      this.reportsClient.send<ReportPortfolioRow[]>(
        { cmd: 'report_portfolio' },
        { projectIds, dias: this.umbral(query.dias) },
      ),
    );

    /**
     * El nombre y el slug se pegan aquí, y no en reports-service.
     *
     * Aquel no conoce los proyectos —los pide por TCP cuando le hacen falta las
     * columnas— y en esta ruta el gateway **ya los tiene delante**: son los que
     * acaba de listar para resolver el permiso. Mandárselos para que los
     * devolviera sería un viaje de ida y vuelta con datos que ya están aquí.
     *
     * El slug y no solo el id porque la tabla enlaza a `/reports/<slug>`, y en
     * la URL va el slug (invariante 4). El id se conserva: es lo que entiende la
     * API.
     */
    const porId = new Map(items.map((proyecto) => [proyecto.id, proyecto]));

    return (filas ?? []).map((fila) => ({
      ...fila,
      name: porId.get(fila.projectId)?.name,
      slug: porId.get(fila.projectId)?.slug,
    }));
  }
}
