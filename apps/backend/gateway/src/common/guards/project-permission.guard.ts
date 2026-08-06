import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PROJECT_PERMISSION_KEY } from '../decorators/require-project-permission.decorator';
import {
  PROJECT_SUSPENDED_CODE,
  ProjectPermission,
  READ_ONLY_PROJECT_PERMISSIONS,
} from '@praxis/contracts';

/** Forma de un UUID. Lo que no la tenga en la ruta se trata como slug. */
const esUuid = (valor: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);

/** Nombres de controladores que usan el param `:id` como projectId */
const PROJECT_ID_CONTROLLERS = new Set(['ProjectsController']);

/**
 * Controladores donde un parámetro de ruta identifica una **tarea**.
 *
 * `TasksController` la nombra `:id`; los que cuelgan de una tarea la nombran
 * `:taskId` y usan `:id` para su propio recurso, así que se prueba `taskId`
 * primero.
 *
 * ⚠️ **Un controlador nuevo que cuelgue de una tarea tiene que apuntarse
 * aquí.** Si no, el guard no encuentra el proyecto y responde
 * `403 "Contexto de proyecto no encontrado"` — que es exactamente lo que pasó
 * al añadir los comentarios.
 */
const TASK_CONTROLLERS = new Set([
  'TasksController',
  'ChecklistsController',
  'CommentsController',
  'AttachmentsController',
]);

/**
 * Resuelve el proyecto de un recurso y comprueba el permiso pedido.
 *
 * ⚠️ **El `projectId` sale siempre de la ruta, nunca del cuerpo.** Antes se
 * aceptaba `body.projectId` como último recurso y eso era un bypass completo,
 * reproducido con dos cuentas: bastaba con mandar el id de un proyecto propio
 * para leer, editar y borrar tareas de un proyecto ajeno, porque el guard
 * concedía por ser dueño de *ese* proyecto y nadie comparaba después con el
 * proyecto real de la tarea. El permiso lo decide el recurso al que apuntas,
 * no lo que declares.
 *
 * El id resuelto queda en `request.projectId` para que el controlador lo
 * inyecte en el payload al microservicio.
 *
 * ## También aplica el estado del proyecto
 *
 * Un proyecto `SUSPENDED` es de solo lectura y uno `DELETED` no existe para
 * nadie salvo para el panel de administración. Se comprueba **aquí** porque este
 * guard ya resuelve el proyecto de cada petición: una comprobación en este punto
 * cubre tareas, columnas, comentarios, adjuntos, miembros, roles, etiquetas e
 * informes de golpe, sin tocar ninguno de los servicios.
 *
 * ⚠️ **Lo que no lleva `@RequireProjectPermission` no pasa por aquí.** La primera
 * línea de `canActivate` devuelve `true` si el handler no declara permiso, así
 * que las rutas sin decorador se saltan también la comprobación de estado. Eran
 * tres escrituras —aceptar una invitación, rechazarla y salirse del proyecto— y
 * están cerradas a mano en sus controladores. Una ruta nueva que escriba sin
 * declarar permiso volvería a abrir el mismo agujero.
 */
@Injectable()
export class ProjectPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<ProjectPermission>(
      PROJECT_PERMISSION_KEY,
      context.getHandler(),
    );

    // Si no se requiere permiso específico, deja pasar
    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    if (!userId) return false;

    const controllerName = context.getClass().name;
    const params = request.params;

    // --- Resolver projectId desde el contexto más específico al más amplio ---
    // Solo desde `params`: el cuerpo no participa (ver la nota de la clase).

    let projectId: string | undefined = params.projectId;

    // ProjectsController usa `:id` como projectId directamente
    if (!projectId && PROJECT_ID_CONTROLLERS.has(controllerName) && params.id) {
      projectId = params.id;
    }

    /**
     * El parámetro puede ser un **slug** en vez de un UUID.
     *
     * `/projects/rediseno-del-panel` tiene que acabar comprobando permisos
     * sobre el id real, y eso hay que hacerlo **aquí y no en el controlador**:
     * el guard corre antes, y si le llega un slug intentaría resolver permisos
     * sobre la cadena literal y respondería 403 sin más explicación.
     *
     * Se resuelve una sola vez y el resto del guard sigue igual, porque a
     * partir de este punto `projectId` ya es un UUID. Las rutas anidadas
     * (`/projects/:projectId/members`) siguen esperando el id: la interfaz lo
     * conoce en cuanto carga el proyecto, así que no hace falta pagar esta
     * traducción en cada petición.
     */
    if (projectId && !esUuid(projectId)) {
      try {
        const res = await firstValueFrom(
          this.projectsClient.send({ cmd: 'project_resolve_slug' }, { slug: projectId }),
        );
        projectId = res?.projectId;
      } catch {
        /* Un slug que no existe es un 404, no un 403: esa URL no corresponde a
           nada, y decir «prohibido» sugeriría que existe y no es tuyo. */
        throw new NotFoundException('Proyecto no encontrado');
      }
    }

    // Si el controlador maneja tareas, resolvemos taskId → boardId → projectId.
    // Va antes que el bloque de boardId: al crear (`boards/:boardId/tasks`) no
    // hay tarea todavía y cae solo al siguiente.
    if (!projectId && TASK_CONTROLLERS.has(controllerName)) {
      const taskId: string | undefined = params.taskId ?? params.id;

      if (taskId) {
        try {
          const task = await firstValueFrom(
            this.tasksClient.send({ cmd: 'task_find_one' }, { id: taskId }),
          );
          if (task?.boardId) {
            const res = await firstValueFrom(
              this.projectsClient.send(
                { cmd: 'project_resolve_resource' },
                { boardId: task.boardId },
              ),
            );
            projectId = res?.projectId;
          }
        } catch {
          throw new ForbiddenException('Tarea no encontrada o no se pudo resolver el proyecto');
        }
      }
    }

    // Si tenemos workspaceId o boardId, los resolvemos vía projects-service
    const workspaceId: string | undefined = params.workspaceId;
    const boardId: string | undefined = params.boardId;

    if (!projectId && (workspaceId || boardId)) {
      try {
        const res = await firstValueFrom(
          this.projectsClient.send({ cmd: 'project_resolve_resource' }, { workspaceId, boardId }),
        );
        projectId = res?.projectId;
      } catch {
        throw new ForbiddenException('Recurso no encontrado o no se pudo resolver');
      }
    }

    if (!projectId) {
      throw new ForbiddenException('Contexto de proyecto no encontrado en la petición');
    }

    // Disponible para el controlador, que lo inyecta en el payload.
    request.projectId = projectId;

    /**
     * 1. El estado del proyecto, y solo después el dueño.
     *
     * ⚠️ **El orden es la mitad del diseño.** La comprobación de estado va
     * *antes* del atajo del dueño: si fuera después, el dueño —que es justo la
     * persona a la que se le está suspendiendo el proyecto— seguiría pudiendo
     * hacer de todo, y la suspensión solo afectaría a los demás miembros.
     *
     * Se aprovecha la petición que ya hacía falta para saber quién es el dueño,
     * así que la suspensión no cuesta ni un salto de red más.
     */
    let project: {
      ownerId?: string;
      status?: string;
      suspendedReason?: string | null;
    } | null = null;

    try {
      project = await firstValueFrom(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
      );
    } catch {
      // Si no se encuentra el proyecto, continuar con la verificación de permisos
    }

    if (project?.status && project.status !== 'ACTIVE') {
      this.exigirEstadoQueDejePasar(project.status, project.suspendedReason, requiredPermission);
    }

    if (project?.ownerId === userId) return true;

    // 2. Consultar projects-service por el permiso granular
    try {
      const { allowed } = await firstValueFrom(
        this.projectsClient.send(
          { cmd: 'project_check_permission' },
          { userId, projectId, permission: requiredPermission },
        ),
      );
      return !!allowed;
    } catch {
      return false;
    }
  }

  /**
   * Un proyecto que no está activo: qué se deja pasar y qué no.
   *
   * ## Suspendido: solo lectura
   *
   * Pasan `canViewProject` y `canViewReports`; todo lo demás implica escribir y
   * se bloquea. El 403 lleva el código `PROJECT_SUSPENDED` **porque la interfaz
   * tiene que distinguirlo de un 403 de permisos**: uno se arregla pidiéndole
   * permiso a quien administra el proyecto y el otro no se arregla, hay que
   * esperar a que la plataforma lo reactive. Sin el código, el dueño de un
   * proyecto suspendido acabaría pidiéndose permisos a sí mismo.
   *
   * El motivo viaja en la respuesta. Es lo que permite que la pantalla lo diga en
   * lugar de dejar que cada botón falle en silencio.
   *
   * ## Archivado: 404, no 403
   *
   * Para todo el mundo, dueño incluido. Un 403 diría «existe y no es tuyo», que
   * es falso y además filtra que ese proyecto existe; un 404 dice lo que hay que
   * decir: por esta puerta no hay nada. El administrador lo ve por la suya
   * (`/admin/projects`), que no pasa por este guard.
   */
  private exigirEstadoQueDejePasar(
    status: string,
    reason: string | null | undefined,
    requiredPermission: ProjectPermission,
  ): void {
    if (status === 'DELETED') {
      throw new NotFoundException('Proyecto no encontrado');
    }

    if (status === 'SUSPENDED') {
      if (READ_ONLY_PROJECT_PERMISSIONS.includes(requiredPermission)) return;

      throw new ForbiddenException({
        code: PROJECT_SUSPENDED_CODE,
        message: reason
          ? `Este proyecto está suspendido por la administración: ${reason}`
          : 'Este proyecto está suspendido por la administración y solo se puede consultar.',
        details: { reason: reason ?? null },
      });
    }
  }
}
