import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminActionType,
  AdminTargetType,
  FindAdminProjectsQueryDto,
  GLOBAL_ROLES,
  ProjectStatus,
  SetProjectStatusBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireGlobalRole } from '../common/decorators/require-global-role.decorator';
import { GlobalRoleGuard } from '../common/guards/global-role.guard';
import { AutomationPurgeService } from '../projects/automation-purge.service';
import { TaskPurgeService } from '../projects/task-purge.service';
import { AdminActivityRecorder } from './admin-activity.recorder';

interface ProyectoCrudo {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerId: string;
  /** El estado que tenía antes del cambio. Lo devuelve `project_set_status`. */
  previousStatus?: string;
}

interface PerfilCrudo {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  credential?: { email?: string | null } | null;
}

/**
 * Lo único que se cuenta del dueño en la pantalla de proyectos: quién es y cómo
 * escribirle. Ni su estado de cuenta ni su rol, que son de la pantalla de Cuentas.
 */
interface DueñoVisible {
  id: string;
  name: string | null;
  email: string | null;
}

/** Nombre completo, o el correo si la cuenta todavía no tiene nombre. */
const nombreDe = (perfil: PerfilCrudo | null | undefined): string | null => {
  const nombre = [perfil?.firstName, perfil?.lastName]
    .map((parte) => parte?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  return nombre || perfil?.credential?.email || null;
};

/**
 * Qué acción del registro corresponde al cambio.
 *
 * ⚠️ **Depende del estado anterior, no solo del nuevo.** Reactivar un suspendido y
 * recuperar un archivado terminan los dos en `ACTIVE`, y son dos cosas distintas
 * para quien lee la auditoría: una levanta un bloqueo que todos veían, la otra
 * devuelve a la vista un proyecto que había desaparecido. Con un mapa por estado
 * nuevo, `PROJECT_RESTORED` no se emitiría nunca y el filtro del panel tendría una
 * opción que no devuelve nada.
 */
export const accionDelCambio = (nuevo: ProjectStatus, anterior?: string): AdminActionType => {
  if (nuevo === ProjectStatus.SUSPENDED) return AdminActionType.PROJECT_SUSPENDED;
  if (nuevo === ProjectStatus.DELETED) return AdminActionType.PROJECT_ARCHIVED;

  return anterior === ProjectStatus.DELETED
    ? AdminActionType.PROJECT_RESTORED
    : AdminActionType.PROJECT_REACTIVATED;
};

/**
 * Administración de proyectos: inventario, ficha de solo lectura y estado.
 *
 * ## Por qué el panel tiene sus propias rutas para leer proyectos
 *
 * Porque **el rol global no otorga permisos dentro de un proyecto**, y esa regla
 * de las dos capas se mantiene entera (`docs/backend/permissions.md`).
 * `ProjectPermissionGuard` le daría 403 a un administrador que no es miembro, y
 * está bien que lo haga.
 *
 * Lo que hay aquí no es un atajo a ese guard sino **otra puerta**: una proyección
 * administrativa de solo lectura, servida bajo `@RequireGlobalRole`, que no
 * concede ningún permiso de proyecto. El administrador no gana `canEditTask` por
 * mirar; puede ver el inventario y suspender, nada más.
 *
 * ⚠️ **Por eso el panel no enlaza a `/projects/<slug>`.** Ese enlace le daría 403
 * a quien no sea miembro, y parecería roto. La ficha se pinta con lo que devuelve
 * `GET /admin/projects/:id`.
 *
 * ## Y por qué no hay borrado
 *
 * `DELETE /projects/:id` existe y **se queda con el dueño**: cascadea, purga las
 * tareas en otro microservicio y no tiene vuelta atrás. Un administrador que se
 * equivoca con eso no puede deshacerlo. Lo que ofrece el panel son dos estados
 * reversibles: suspender (solo lectura, visible) y archivar (invisible para todos
 * menos para el panel).
 */
@ApiTags('Admin')
@ApiBearerAuth()
@RequireGlobalRole(GLOBAL_ROLES.ADMIN)
@UseGuards(JwtGuard, GlobalRoleGuard)
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly actividad: AdminActivityRecorder,
    /* Las tareas y las automatizaciones viven en otros microservicios: el
       cascade de Prisma no llega hasta ellas. Es la misma purga que hace el
       `DELETE` del dueño, y por eso se reutilizan sus servicios en vez de
       repetir las llamadas. */
    private readonly taskPurge: TaskPurgeService,
    private readonly automationPurge: AutomationPurgeService,
  ) {}

  /**
   * El inventario completo, archivados incluidos.
   *
   * `GET /projects` no sirve para esto: filtra por dueño o miembro, y añadirle una
   * forma de ver todos sería poner un interruptor de bypass en la ruta que usa
   * cualquiera.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inventario de proyectos de la plataforma (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Inventario recuperado: { items, total }' })
  async findAll(@Query() query: FindAdminProjectsQueryDto) {
    const { items, total } = await firstValueFrom(
      this.projectsClient.send<{ items: ProyectoCrudo[]; total: number }>(
        { cmd: 'project_find_all_admin' },
        {
          page: query.page ?? 1,
          limit: query.limit ?? 25,
          ...(query.search ? { search: query.search } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
      ),
    );

    return { items: await this.conDueño(items), total };
  }

  /**
   * Añade el dueño a cada fila.
   *
   * ## Por qué el gateway y no el servicio
   *
   * Porque los proyectos y las personas viven en **microservicios distintos**, y
   * projects-service no tiene ni la tabla ni por qué llamar a credentials. Cruzar
   * dos dominios es exactamente el trabajo del gateway.
   *
   * ## Una llamada, no una por fila
   *
   * `user_find_by_ids` con los ids únicos de la página: 25 filas de tres dueños son
   * tres perfiles, no 25 peticiones. Un `user_find_one` por fila habría convertido
   * cada carga del inventario en 26 saltos de red.
   *
   * ⚠️ **Solo salen el nombre y el correo.** `findByIds` devuelve el perfil entero
   * —estado de la cuenta incluido— y esta es la pantalla de proyectos: si hiciera
   * falta saber que el dueño está suspendido, se mira en Cuentas. Copiar aquí el
   * registro completo sería filtrar por una ruta lo que otra ya sirve con su propio
   * criterio.
   *
   * Si credentials no responde, las filas salen sin dueño en lugar de fallar: un
   * inventario sin nombres sigue sirviendo para suspender, y un 500 no.
   */
  private async conDueño<T extends ProyectoCrudo>(
    items: T[],
  ): Promise<Array<T & { owner?: DueñoVisible | null }>> {
    const ids = [...new Set(items.map((p) => p.ownerId).filter(Boolean))];
    if (ids.length === 0) return items;

    let perfiles: PerfilCrudo[] = [];
    try {
      perfiles = await firstValueFrom(
        this.credentialsClient.send<PerfilCrudo[]>({ cmd: 'user_find_by_ids' }, { ids }),
      );
    } catch {
      return items;
    }

    const porId = new Map(
      (perfiles ?? []).map((perfil) => [
        perfil.id,
        {
          id: perfil.id,
          name: nombreDe(perfil),
          email: perfil.credential?.email ?? null,
        },
      ]),
    );

    return items.map((proyecto) => ({
      ...proyecto,
      owner: porId.get(proyecto.ownerId) ?? null,
    }));
  }

  /**
   * La ficha de un proyecto, en solo lectura.
   *
   * Trae el árbol de espacios, tableros y columnas, más los miembros y los roles.
   * No trae las tareas: viven en otro microservicio y para saber si un proyecto
   * hay que suspenderlo no hace falta leerlas.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ficha de solo lectura de un proyecto (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Proyecto recuperado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const proyecto = await firstValueFrom(
      this.projectsClient.send<ProyectoCrudo>({ cmd: 'project_find_one_admin' }, { id }),
    );

    /* Con dueño, igual que el inventario: la ficha se abre justo para decidir si se
       suspende, y «de quién es» es la primera pregunta. */
    const [ficha] = await this.conDueño([proyecto]);
    return ficha;
  }

  /**
   * Suspender, reactivar o archivar.
   *
   * El motivo es **obligatorio** salvo para reactivar, y aquí importa más que en
   * las cuentas: es el texto que va a leer el dueño en el aviso de su propia
   * pantalla de proyecto. Sin él vería un proyecto donde ningún botón funciona y
   * ni una palabra que lo explique — y abriría un ticket en vez de entenderlo.
   */
  /**
   * Borra un proyecto de verdad, con su purga en los otros servicios.
   *
   * ## ⚠️ No es `PROJECT_ARCHIVED`, y la diferencia importa
   *
   * Archivar es un **estado**: el proyecto sigue ahí, responde 404 a todo el
   * mundo menos a administración, y se deshace. Esto quita la fila y arrastra
   * sus espacios, tableros, columnas, roles, miembros y chat por el cascade —
   * más las tareas y las reglas, que están en otros esquemas y hay que purgar a
   * mano—. No se deshace.
   *
   * Existe porque archivar no basta para lo que administración necesita de vez
   * en cuando: un proyecto de prueba, uno duplicado, o el que bloquea el borrado
   * de una cuenta.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra un proyecto y purga sus datos (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Proyecto borrado' })
  @ApiResponse({ status: 404, description: 'Ese proyecto ya no existe' })
  async delete(@Request() req: Express.Request, @Param('id', ParseUUIDPipe) id: string) {
    const actorId = req.user!.userId;

    /* Antes de borrar: después no hay a quién preguntarle cómo se llamaba, y el
       registro se quedaría con un UUID. */
    const proyecto = await firstValueFrom(
      this.projectsClient.send<ProyectoCrudo>({ cmd: 'project_find_one_admin' }, { id }),
    );

    const resultado = await firstValueFrom(
      this.projectsClient.send({ cmd: 'project_delete' }, { id }),
    );

    await Promise.all([
      this.taskPurge.afterProjectDeleted(id),
      this.automationPurge.afterProjectDeleted(id),
    ]);

    await this.actividad.record({
      actorId,
      actorLabel: await this.etiquetaDe(actorId),
      action: AdminActionType.PROJECT_DELETED,
      targetType: AdminTargetType.PROJECT,
      targetId: id,
      targetLabel: proyecto?.name,
      metadata: { slug: proyecto?.slug, ownerId: proyecto?.ownerId },
    });

    return resultado;
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia el estado de un proyecto (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 400, description: 'Falta el motivo al suspender o archivar' })
  async setStatus(
    @Request() req: Express.Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetProjectStatusBodyDto,
  ) {
    const actorId = req.user!.userId;

    if (body.status !== ProjectStatus.ACTIVE && !body.reason?.trim()) {
      throw new BadRequestException(
        'Hace falta un motivo: es lo que va a leer el dueño del proyecto en el aviso.',
      );
    }

    const actualizado = await firstValueFrom(
      this.projectsClient.send<ProyectoCrudo>(
        { cmd: 'project_set_status' },
        { id, status: body.status, reason: body.reason, actorId },
      ),
    );

    await this.actividad.record({
      actorId,
      actorLabel: await this.etiquetaDe(actorId),
      action: accionDelCambio(body.status, actualizado?.previousStatus),
      targetType: AdminTargetType.PROJECT,
      targetId: id,
      targetLabel: actualizado?.name,
      reason: body.reason,
      metadata: { status: body.status, slug: actualizado?.slug },
    });

    /* `previousStatus` es para elegir la entrada del registro, no parte de la
       respuesta: el proyecto que devuelve esta ruta tiene la misma forma que los
       del inventario, y así la interfaz puede reemplazar la fila sin más. */
    const { previousStatus: _anterior, ...proyecto } = actualizado ?? {};
    return proyecto;
  }

  /** Nombre de quien administra, para la copia que guarda el registro. */
  private async etiquetaDe(userId: string): Promise<string> {
    try {
      const usuario = await firstValueFrom(
        this.credentialsClient.send<PerfilCrudo>({ cmd: 'user_find_one' }, { id: userId }),
      );
      return nombreDe(usuario) ?? userId;
    } catch {
      return userId;
    }
  }
}
