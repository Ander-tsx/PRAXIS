import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PLANS,
  type PlanTier,
  ProjectPermission,
  REPORT_CROSS_DIMENSIONS,
  ReportBundleQueryDto,
  /* ⚠️ Import de **valor**, no `type`: con `type` el parámetro de `@Query()`
     queda tipado en runtime como `Function`, y el `ValidationPipe` con
     `forbidNonWhitelisted` rechazaba cualquier filtro en las cuatro rutas que
     usan la clase base (snapshot y compañía) — 400 «property boardId should
     not exist». Misma trampa que el `Omit<>` de CLAUDE.md, trampa 3. */
  ReportFiltersQueryDto,
  ReportMatrixQueryDto,
  ReportWeeklyQueryDto,
  ReportWindowQueryDto,
  type Tope,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Lo más ancho que puede ser un tramo `from`/`to`.
 *
 * El mismo número que el techo de `days`, y a propósito: son dos formas de pedir
 * la misma ventana y tener dos topes distintos solo serviría para que una de las
 * dos respondiera a algo que la otra rechaza.
 */
const MAX_DIAS_DE_TRAMO = 365;

/**
 * Hasta dónde alcanza hacia atrás el plan de quien mira, y si se ha notado.
 *
 * Viaja en el paquete de informes (`GET /projects/:id/reports`) bajo la clave
 * `ventana`, para que la pantalla pueda escribirlo. Ver `ReportsController.acotar`.
 */
export interface VentanaDelPlan {
  /** Días de historial que alcanza el plan. `null` es sin tope. */
  dias: number | null;
  tier: PlanTier;
  /** El nombre del plan, para poder nombrarlo en la frase sin traducir el enum. */
  plan: string;
  /**
   * Si **esta** petición se recortó de verdad.
   *
   * ⚠️ No es lo mismo que tener tope: un plan de 90 días que responde a una
   * pregunta de 60 no ha recortado nada, y avisar ahí sería un aviso que se
   * aprende a ignorar antes de que llegue el que importa.
   */
  recortado: boolean;
  /** La fecha más antigua que alcanza el plan, en ISO. `null` si no hay tope. */
  desde: string | null;
}

/**
 * Reportes de un proyecto.
 *
 * Todas las rutas cuelgan de `/projects/:projectId/...`, y eso no es cosmético:
 * `ProjectPermissionGuard` resuelve el `projectId` directamente de `params`, así
 * que **no hay que tocar el guard ni apuntar este controlador en ninguna lista**
 * —al contrario que los de tarea, que cuelgan de `/tasks/:id` y necesitan estar
 * en `TASK_CONTROLLERS` para que el guard sepa resolverles el proyecto.
 *
 * ### La línea de permisos
 *
 * | Ruta | Permiso | Por qué |
 * |---|---|---|
 * | Todo lo agregado | `canViewProject` | No nombra a nadie: es el estado del trabajo |
 * | `/people` | `canViewReports` | Desglosa por persona |
 *
 * Los números **propios** no están aquí: van en `/me/reports`, sin permiso, por
 * el mismo motivo que `/me/tasks` — no hay proyecto en la ruta contra el que
 * comprobar nada, y el usuario sale del token.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(
    @Inject('REPORTS_SERVICE') private readonly reportsClient: ClientProxy,
    /* `historialAnalisisDias`: hasta dónde hacia atrás alcanza el plan. Ver
       `acotar` y `QuotaService.ventanaDeAnalisis`. */
    private readonly quota: QuotaService,
  ) {}

  /**
   * Cuántos días de historial mira un informe.
   *
   * Se acota en el gateway y no en el servicio para que un `?days=100000` no
   * convierta una consulta barata en un escaneo de la tabla entera.
   */
  private ventana(days?: string): number | undefined {
    if (days === undefined) return undefined;
    const n = Number(days);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(Math.max(Math.trunc(n), 1), 365);
  }

  /** Lo mismo para la serie semanal: menos de 2 no compara nada, más de 52 sobra. */
  private semanas(weeks?: string): number | undefined {
    if (weeks === undefined) return undefined;
    const n = Number(weeks);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(Math.max(Math.trunc(n), 2), 52);
  }

  /**
   * Los filtros de la query, comprobados, o `undefined` si no hay ninguno.
   *
   * Las formas ya las validó el DTO —fechas ISO, UUIDs, prioridad del enum—.
   * Aquí se comprueba lo único que un decorador no puede ver: que el tramo tenga
   * sentido y que no sea infinito.
   *
   * ## ⚠️ Un tramo demasiado ancho se rechaza, no se recorta
   *
   * `days` sí se recorta en silencio, y es distinto: quien escribe `?days=100000`
   * está pidiendo «todo», y devolverle 365 días es exactamente lo que quería. Un
   * tramo con dos fechas es una pregunta concreta —«del 1 de enero al 30 de
   * junio»— y estrecharla por detrás devolvería un gráfico que se lee como la
   * respuesta a la pregunta que se hizo, y no lo es. Es la misma regla que el
   * inventario del asistente: **un recorte mudo es peor que no recortar**.
   *
   * El techo existe por lo mismo que el de `days`: sin él, dos fechas separadas
   * por veinte años convierten cada informe en un recorrido del historial entero.
   */
  private filtros(query: ReportFiltersQueryDto): ReportFiltersQueryDto | undefined {
    const { from, boardId, assigneeId, labelId, priority, sprintId } = query;

    /* Un `to` suelto no filtra nada: sería la ventana por defecto acabando antes,
       que no es una pregunta que nadie haga. Se ignora en vez de responder 400 —
       no es un error de quien llama, es un parámetro sin efecto. */
    const to = from ? query.to : undefined;

    if (from) {
      const desde = new Date(from);
      const hasta = to ? new Date(to) : new Date();

      if (hasta.getTime() < desde.getTime()) {
        throw new BadRequestException('El final del tramo no puede ser anterior al principio.');
      }

      const dias = (hasta.getTime() - desde.getTime()) / 86_400_000;
      if (dias > MAX_DIAS_DE_TRAMO) {
        throw new BadRequestException(
          `El tramo no puede pasar de ${MAX_DIAS_DE_TRAMO} días. Pide uno más corto o usa \`days\`.`,
        );
      }
    }

    const filtros = { from, to, boardId, assigneeId, labelId, priority, sprintId };
    return Object.values(filtros).some((valor) => valor !== undefined) ? filtros : undefined;
  }

  /**
   * Lo que el plan alcanza, y si esta petición se ha tenido que recortar.
   *
   * ## Se recorta, no se rechaza — y por eso hay que decirlo
   *
   * `historialAnalisisDias` es la única cuota del catálogo que acota una
   * **lectura**, así que no lanza 402: un muro de pago a media consulta sobre
   * una pregunta razonable no tiene salida —no es que te hayas pasado, es que
   * preguntaste por más atrás de lo que tu plan llega—. La decisión entera está
   * en D4 de `docs/PLAN-CUOTAS.md` y en `QuotaService.ventanaDeAnalisis`.
   *
   * ⚠️ **Y un recorte mudo es peor que no recortar.** Por eso esto devuelve
   * `recortado` y `desde`, y el paquete los publica: un gráfico que empieza
   * noventa días atrás sin explicar por qué se lee como un dato incompleto, y
   * quien lo lea sacará conclusiones de una serie que cree entera.
   *
   * ⚠️ **`days` de `blocked` NO pasa por aquí, y es la trampa de este cambio.**
   * En los demás informes `days` es la ventana de historial; en aquel es
   * **cuántos días lleva una tarea sin moverse**. Recortárselo al tope del plan
   * convertiría «lo que lleva 120 días parado» en «lo que lleva 90», con el
   * mismo nombre y sin que nada fallara. Es el mismo motivo por el que el
   * paquete tampoco le pasa su `days`.
   */
  private async acotar(
    userId: string,
    projectId: string,
    query: ReportFiltersQueryDto,
    opciones: { days?: number; weeks?: number } = {},
  ): Promise<{
    days?: number;
    weeks?: number;
    filtros?: ReportFiltersQueryDto;
    ventana: VentanaDelPlan;
  }> {
    const filtros = this.filtros(query);
    const { dias, tier } = await this.quota.ventanaDeAnalisis(userId, projectId);

    if (dias === null) {
      return {
        ...(opciones.days !== undefined ? { days: opciones.days } : {}),
        ...(opciones.weeks !== undefined ? { weeks: opciones.weeks } : {}),
        ...(filtros ? { filtros } : {}),
        ventana: { dias: null, tier, plan: PLANS[tier].nombre, recortado: false, desde: null },
      };
    }

    const desde = new Date(Date.now() - dias * 86_400_000);
    let recortado = false;

    /* `days` por defecto es 60 al otro lado, así que un plan de 90 no recorta
       nada mientras no se pida más. Solo se toca lo que se pidió. */
    let days = opciones.days;
    if (days !== undefined && days > dias) {
      days = dias;
      recortado = true;
    }

    /* Las semanas son la misma ventana contada en otra unidad, y se recortan
       hacia abajo: 90 días son 12 semanas completas y no 12,8. Redondear hacia
       arriba devolvería una semana que empieza antes de donde llega el plan. */
    let weeks = opciones.weeks;
    const semanasDelPlan = Math.max(Math.floor(dias / 7), 1);
    if (weeks !== undefined && weeks > semanasDelPlan) {
      weeks = semanasDelPlan;
      recortado = true;
    }

    let acotados = filtros;
    if (filtros?.from && new Date(filtros.from).getTime() < desde.getTime()) {
      acotados = { ...filtros, from: desde.toISOString() };
      recortado = true;
    }

    /**
     * ⚠️ **Sin `from` también se acota, y es lo que cierra el hueco.** Los
     * informes que no reciben `days` —`dynamics`, `column-time`, `people`,
     * `matrix`— miran **todo el historial capturado** si nadie les dice otra
     * cosa. Recortar solo cuando el cliente manda un `from` dejaría el tope
     * abierto para quien no lo manda, que es justo el caso normal.
     */
    if (!acotados?.from) {
      acotados = { ...(acotados ?? {}), from: desde.toISOString() };
    }

    return {
      ...(days !== undefined ? { days } : {}),
      ...(weeks !== undefined ? { weeks } : {}),
      filtros: acotados,
      ventana: {
        dias,
        tier,
        plan: PLANS[tier].nombre,
        recortado,
        desde: desde.toISOString(),
      },
    };
  }

  /**
   * Quién pregunta.
   *
   * El `JwtGuard` ya garantiza que hay sesión, así que esto no puede fallar en
   * la práctica; existe para no repetir once veces una aserción de no-nulo que
   * el tipo de `Express.Request` no respalda. Un `?? ''` sería peor: acabaría
   * pidiéndole el plan a un usuario vacío, que responde FREE, y el recorte
   * saldría de la nada.
   */
  private actor(req: Express.Request): string {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  /** El atajo de los tres informes cuyo `days` **sí** es ventana de historial. */
  private acotarConDias(
    req: Express.Request,
    projectId: string,
    query: ReportWindowQueryDto,
  ): ReturnType<ReportsController['acotar']> {
    const dias = this.ventana(query.days);
    return this.acotar(this.actor(req), projectId, query, {
      ...(dias !== undefined ? { days: dias } : {}),
    });
  }

  /**
   * Varios informes en **una** petición.
   *
   * ## Por qué existe, con el coste delante
   *
   * La pantalla de Análisis pinta hasta siete informes, y los pedía en siete
   * peticiones. El ida y vuelta era lo de menos: **cada una pasa por
   * `ProjectPermissionGuard`**, que resuelve los permisos efectivos preguntando
   * a projects-service por TCP. Siete informes eran siete resoluciones de
   * permisos idénticas para pintar una sola pantalla, más siete travesías del
   * proxy de la zona.
   *
   * Ahora: una petición, un guard, una resolución. Los cálculos siguen yendo en
   * paralelo dentro de reports-service y cada uno conserva su caché de 60 s, así
   * que lo que se ahorra es el andamiaje.
   *
   * ⚠️ **Las siete rutas sueltas se quedan.** No son deuda: la skill de voz y
   * cualquier otro cliente piden un informe concreto, y un endpoint que devuelve
   * un objeto con una sola clave es peor API que el que devuelve el informe. Lo
   * que se colapsa es el caso de «pintar el lienzo», que es el que pedía siete.
   *
   * ⚠️ **Un informe que falla vuelve como `null`, no tumba el resto.** Es la
   * misma degradación que tenía la pantalla pidiéndolos uno a uno; agrupar las
   * peticiones no puede significar agrupar los fallos.
   */
  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Varios informes del proyecto en una sola respuesta' })
  @ApiQuery({ name: 'include', required: false, description: 'Informes separados por comas' })
  @ApiQuery({ name: 'days', required: false })
  @ApiQuery({ name: 'weeks', required: false })
  @ApiResponse({
    status: 200,
    description: 'Solo las claves pedidas. Una a `null` es «se pidió y no se pudo»',
  })
  async bundle(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportBundleQueryDto,
  ) {
    const acotado = await this.acotar(this.actor(req), projectId, query, {
      ...(this.ventana(query.days) !== undefined ? { days: this.ventana(query.days) } : {}),
      ...(this.semanas(query.weeks) !== undefined ? { weeks: this.semanas(query.weeks) } : {}),
    });

    const informes = await firstValueFrom(
      this.reportsClient.send<Record<string, unknown>>(
        { cmd: 'report_bundle' },
        {
          projectId,
          incluir: query.include ?? [],
          days: acotado.days,
          weeks: acotado.weeks,
          filtros: acotado.filtros,
        },
      ),
    );

    /**
     * ⚠️ **`ventana` va dentro del paquete y no en el `meta` del sobre.** El
     * cliente de la interfaz devuelve el `data` ya desenvuelto y **tira el
     * `meta`**, así que un aviso ahí llegaría hasta el navegador y no lo leería
     * nadie — el mismo final que tuvieron los avisos en vivo cuando el sobre se
     * comía su `type`.
     *
     * ⚠️ Y es el paquete quien lo publica porque es lo que pide la pantalla de
     * Análisis. Las siete rutas sueltas **se recortan igual** —el tope es del
     * plan, no de una ruta— pero devuelven el informe pelado y no tienen dónde
     * decirlo sin cambiarles la forma a todas. Está en su Swagger y en el
     * contrato; si algún día una de ellas la pinta una persona, esto tiene que
     * subir al sobre y el cliente aprender a leer `meta`.
     */
    return { ...informes, ventana: acotado.ventana };
  }

  @Get('snapshot')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({
    summary: 'Estado actual del proyecto. Es el único informe que no necesita historial',
  })
  @ApiResponse({ status: 200, description: 'Instantánea del proyecto' })
  async snapshot(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportFiltersQueryDto,
  ) {
    const acotado = await this.acotar(this.actor(req), projectId, query);
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_snapshot' }, { projectId, filtros: acotado.filtros }),
    );
  }

  @Get('flow')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Flujo acumulado: cuántas tareas hay en cada columna cada día' })
  @ApiQuery({ name: 'days', required: false, description: 'Días de historial (1–365)' })
  async flow(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportWindowQueryDto,
  ) {
    const acotado = await this.acotarConDias(req, projectId, query);
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_flow' },
        { projectId, days: acotado.days, filtros: acotado.filtros },
      ),
    );
  }

  @Get('cycle-time')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Tiempos de entrega y de ciclo, en percentiles 50 y 85' })
  @ApiQuery({ name: 'days', required: false })
  async cycleTime(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportWindowQueryDto,
  ) {
    const acotado = await this.acotarConDias(req, projectId, query);
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_cycle_time' },
        { projectId, days: acotado.days, filtros: acotado.filtros },
      ),
    );
  }

  @Get('forecast')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({
    summary: 'Cuándo estaría vacío el tablero, por simulación sobre el ritmo observado',
  })
  @ApiResponse({
    status: 200,
    description:
      'Con poco historial devuelve `prediccion: null` y cuánto falta, en vez de un número inventado',
  })
  @ApiQuery({ name: 'days', required: false })
  async forecast(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportWindowQueryDto,
  ) {
    const acotado = await this.acotarConDias(req, projectId, query);
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_forecast' },
        { projectId, days: acotado.days, filtros: acotado.filtros },
      ),
    );
  }

  /**
   * Cómo fue la semana, con la anterior al lado.
   *
   * Existe porque el flujo acumulado **no contesta a esto**: aquel dice dónde
   * está el trabajo cada día, no cuánto se cerró en un tramo. Y un total suelto
   * —«5 tareas»— no dice si eso es bueno; la comparación es el informe.
   *
   * ⚠️ La semana en curso está a medias, así que la respuesta trae también el
   * ritmo diario de las dos: comparar cuatro días contra siete completos sale
   * catastrófico siempre.
   */
  @Get('weekly')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Cierres y entradas por semana, con la anterior para comparar' })
  @ApiQuery({ name: 'weeks', required: false, description: 'Semanas de serie (2–52)' })
  async weekly(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportWeeklyQueryDto,
  ) {
    const semanas = this.semanas(query.weeks);
    const acotado = await this.acotar(this.actor(req), projectId, query, {
      ...(semanas !== undefined ? { weeks: semanas } : {}),
    });
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_weekly' },
        { projectId, weeks: acotado.weeks, filtros: acotado.filtros },
      ),
    );
  }

  /**
   * Lo que está parado.
   *
   * No hay ningún estado «bloqueada» en el modelo y no se inventa: son las
   * abiertas que llevan `days` sin cambiar de columna, deducido del historial.
   * `updatedAt` no valdría —lo pisa cualquier edición— por el mismo motivo por
   * el que el historial guarda `columnId` y no `status`.
   */
  @Get('blocked')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Tareas abiertas que llevan días sin moverse de columna' })
  @ApiQuery({ name: 'days', required: false, description: 'Umbral en días (1–365). Por defecto 7' })
  @ApiResponse({
    status: 200,
    description: 'Las anteriores a la captura del historial vienen marcadas con `sinHistorial`',
  })
  async blocked(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportWindowQueryDto,
  ) {
    /**
     * 🔴 **Su `days` no pasa por `acotar`, y es el único de los once así.**
     *
     * Aquí `days` no es la ventana de historial que se mira: es **cuántos días
     * lleva una tarea sin moverse** para considerarla parada. Recortarlo al tope
     * del plan convertiría «lo que lleva 120 días quieto» en «lo que lleva 90»,
     * con el mismo nombre en la pantalla y sin que nada fallara — el informe
     * seguiría saliendo, contestando a otra pregunta. Es la misma trampa por la
     * que el paquete tampoco le pasa su `days`.
     *
     * El `from` de los filtros sí se acota: ese sí es historial.
     */
    const acotado = await this.acotar(this.actor(req), projectId, query);
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_blocked' },
        { projectId, days: this.ventana(query.days), filtros: acotado.filtros },
      ),
    );
  }

  /**
   * **Dónde espera el trabajo**: cuánto tiempo pasa una tarea en cada columna.
   *
   * `cycle-time` dice cuánto tarda una tarea; este dice **dónde** se va ese
   * tiempo, que es lo único de los dos sobre lo que se puede actuar.
   *
   * Devuelve dos mitades que se leen juntas y no se suman: `p50Horas`/`p85Horas`
   * son las estancias **que ya terminaron** —la referencia de la columna— y
   * `enCurso*` es lo que llevan ahora mismo las tareas abiertas que están ahí.
   *
   * ⚠️ **Sin `days`**, igual que `dynamics`: la referencia de una columna es
   * todo lo que se ha podido medir, y para acotar un sprint están `from`/`to`.
   * Ahí el tramo acota **cuándo terminó la estancia**, que es la única columna
   * de fecha que tiene sentido para esto — ver `StatsService.columnTime`.
   */
  @Get('column-time')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Cuánto tiempo pasa una tarea en cada columna' })
  @ApiResponse({
    status: 200,
    description: 'Una fila por columna del tablero, tenga estancias o no',
  })
  async columnTime(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportFiltersQueryDto,
  ) {
    const acotado = await this.acotar(this.actor(req), projectId, query);
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_column_time' },
        { projectId, filtros: acotado.filtros },
      ),
    );
  }

  /**
   * Retrabajo, rotación de responsable y volatilidad de prioridad.
   *
   * ## Los tres salen de eventos que ya se guardaban
   *
   * `TaskEvent` tiene ocho tipos y los informes usaban tres. Aquí se leen
   * `REOPENED`, `ASSIGNED`/`UNASSIGNED` y `PRIORITY_CHANGED`, que estaban
   * capturados desde el principio y no los miraba nadie. **No se captura nada
   * nuevo**: es la misma tabla con otra pregunta.
   *
   * ⚠️ **Sin `days`, y no es un olvido.** Los otros lo usan como ventana móvil
   * —«los últimos 60 días»— y aquí la pregunta no es esa: el retrabajo de un
   * proyecto es el de todo lo que se ha podido medir. Quien quiera acotar un
   * sprint tiene `from`/`to`, que es lo que sirve para eso.
   *
   * ⚠️ Pide `canViewReports` como el resto. Los `top` nombran **tareas**, nunca
   * personas: ver `StatsService.dynamics`, donde está por qué.
   */
  @Get('dynamics')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Retrabajo, rotación de responsable y volatilidad de prioridad' })
  @ApiResponse({
    status: 200,
    description: '`desde` es el primer evento capturado: antes de eso no hay nada que medir',
  })
  async dynamics(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportFiltersQueryDto,
  ) {
    const acotado = await this.acotar(this.actor(req), projectId, query);
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_dynamics' }, { projectId, filtros: acotado.filtros }),
    );
  }

  /**
   * **Dos dimensiones a la vez**: el cruce que la sección no podía pedir.
   *
   * «De lo de frontend, cuánto es urgente» es una pregunta de dos dimensiones, y
   * hasta aquí todos los gráficos tenían una. `groupBy` y `splitBy` salen de un
   * conjunto cerrado de cuatro —columna, prioridad, etiqueta, persona— porque
   * cada una es un trozo de SQL escrito a mano al otro lado.
   *
   * ⚠️ **Las celdas no suman el total del proyecto** cuando alguna dimensión es
   * de muchos a muchos: una tarea con tres etiquetas está en tres celdas. La
   * respuesta trae `tareas` —las distintas que entran— para que la pantalla
   * pueda decirlo. Un total al pie que no cuadra se lee como una avería.
   *
   * ⚠️ Cruzar una dimensión consigo misma da la diagonal y nada más: se rechaza.
   *
   * Existe además como parte del paquete (`include=matrix:etiqueta:prioridad`),
   * porque un lienzo con tres cruces distintos no puede costar tres peticiones
   * más — que es el coste que quitó R4.2.
   */
  @Get('matrix')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Cruce de dos dimensiones: una tabla de contingencia' })
  @ApiQuery({ name: 'groupBy', required: true, enum: REPORT_CROSS_DIMENSIONS })
  @ApiQuery({ name: 'splitBy', required: true, enum: REPORT_CROSS_DIMENSIONS })
  @ApiResponse({
    status: 200,
    description: '`tareas` son las distintas que entran; la suma de las celdas puede ser mayor',
  })
  async matrix(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportMatrixQueryDto,
  ) {
    if (query.groupBy === query.splitBy) {
      throw new BadRequestException('Las dos dimensiones del cruce tienen que ser distintas.');
    }
    const acotado = await this.acotar(this.actor(req), projectId, query);
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_matrix' },
        {
          projectId,
          agruparPor: query.groupBy,
          partirPor: query.splitBy,
          filtros: acotado.filtros,
        },
      ),
    );
  }

  /**
   * Carga y flujo por persona.
   *
   * El único que pide `canViewReports`. Se enseña como reparto, no como
   * clasificación: no devuelve ninguna medida que ordene a la gente por
   * «productividad», porque estos datos no saben de dificultad ni de contexto y
   * un número así se acaba leyendo como una nota.
   */
  @Get('people')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Carga y flujo por persona (requiere canViewReports)' })
  @ApiResponse({ status: 403, description: 'Sin canViewReports' })
  async people(
    @Request() req: Express.Request,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportFiltersQueryDto,
  ) {
    const acotado = await this.acotar(this.actor(req), projectId, query);
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_people' }, { projectId, filtros: acotado.filtros }),
    );
  }
}
