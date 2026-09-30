import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
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
import {
  CreateProjectBodyDto,
  FindProjectsQueryDto,
  ProjectPermission,
  TransferProjectBodyDto,
  UpdateProjectBodyDto,
} from '@praxis/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { IMAGEN_MAX_BYTES, validarImagenSubida } from '../common/imagen';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { AutomationPurgeService } from './automation-purge.service';
import { TaskPurgeService } from './task-purge.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects')
export class ProjectsController {
  private readonly log = new Logger(ProjectsController.name);

  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    /* Solo para la exportación: las tareas viven en su propio servicio. */
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    /* Para dejar en el registro de la organización los gestos que le importan a
       un equipo: un traspaso de responsable, un acceso autoconcedido. */
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    private readonly taskPurge: TaskPurgeService,
    private readonly automationPurge: AutomationPurgeService,
    private readonly quota: QuotaService,
  ) {}

  /**
   * Crea un nuevo proyecto (el ownerId viene del token).
   *
   * ⚠️ **El tope del plan se comprueba aquí, antes de escribir**, y responde
   * **402** con `QUOTA_EXCEEDED` — no 403. Un 403 se arregla pidiéndole permiso
   * a alguien; esto se arregla borrando un proyecto o ampliando el plan, y
   * ofrecer «pídeselo a quien administra» a quien administra es la peor ayuda
   * posible. La pantalla apaga el botón antes; quien decide es esto.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea un nuevo proyecto' })
  @ApiResponse({ status: 201, description: 'Proyecto creado exitosamente' })
  @ApiResponse({ status: 402, description: 'Tu plan no da para otro proyecto' })
  @ApiResponse({ status: 409, description: 'Ya existe un proyecto con ese nombre' })
  async create(@Request() req: Express.Request, @Body() body: CreateProjectBodyDto) {
    /* El orden importa y no es intercambiable: primero **dónde** va el proyecto
       —con las dos comprobaciones de pertenencia y permiso— y solo después si
       cabe. Contar antes de saber en qué organización se cuenta daría el tope de
       la personal a quien está creando en la de su empresa. */
    const organizationId = await this.quota.resolverOrganizacionParaProyecto({
      userId: req.user!.userId,
      organizationId: body.organizationId,
    });

    /* 🔴 **Y el asiento vivo antes que la cuota**, porque no son la misma
       negativa. `ProjectPermissionGuard` no llega aquí: no hay proyecto todavía
       que le dé el contexto, así que esta es la **única** puerta de escritura de
       la aplicación que el congelado tiene que cerrar por su cuenta. Sin esto,
       quien está en solo lectura no puede tocar una tarea y sí puede crear un
       tablero entero — que es justo lo contrario de lo que dice D4 («ni crear,
       ni editar, ni mover»), y no daría ningún error.

       Va **antes** de contar: quien está congelado no necesita enterarse de si
       cabía o no, y un 402 le ofrecería borrar algo o pagar, que son las dos
       cosas que no puede hacer. */
    await this.quota.exigirAsientoVivo(req.user!.userId, organizationId);

    await this.quota.exigirProyecto(req.user!.userId, organizationId);

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_create' },
        {
          ...body,
          ownerId: req.user!.userId,
          organizationId,
        },
      ),
    );
  }

  /** Lista proyectos del usuario autenticado */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista proyectos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Lista de proyectos recuperada' })
  findAll(@Request() req: Express.Request, @Query() query: FindProjectsQueryDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_find_all' },
        query.toFindProjectsDto(req.user!.userId),
      ),
    );
  }

  /**
   * Todo el contenido de un proyecto, en un JSON.
   *
   * ## Por qué existe
   *
   * Responde a la objeción de **«¿y si mañana os dejamos?»** sin discutirla, que
   * es una de las tres o cuatro preguntas que hace cualquier empresa antes de
   * meter el trabajo de su equipo en un sitio ajeno. Un producto que no puede
   * contestarla pierde la venta antes de que nadie mire una pantalla.
   *
   * ## Qué lleva y qué no
   *
   * Lleva el proyecto, sus tableros y columnas, sus roles, sus miembros por
   * identificador, y todas sus tareas con checklists, comentarios y etiquetas.
   *
   * ⚠️ **No lleva los bytes de los adjuntos.** Van sus nombres y sus tamaños,
   * pero el contenido vive en Postgres —el punto rojo de la revisión de
   * arquitectura— y meterlo aquí convertiría una exportación en una respuesta de
   * cientos de megas montada entera en memoria. Cuando los adjuntos salgan a
   * almacenamiento de objetos, esto pasa a llevar sus URLs.
   *
   * ⚠️ **Ni correos ni nombres de persona.** Solo `userId`. Este servicio no
   * tiene el directorio, y hacerle una vuelta a credentials por cada
   * identificador convertiría una exportación en un volcado del padrón. Quien
   * exporta ya sabe quién es su equipo.
   *
   * ## Quién puede
   *
   * `canViewProject` **no basta**: exporta quien podría borrarlo. Llevarse el
   * contenido entero de un tablero es un gesto de la misma familia que
   * destruirlo, no de la de mirarlo.
   */
  @Get(':id/export')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_PROJECT)
  @ApiOperation({ summary: 'Exporta el proyecto entero en JSON' })
  @ApiResponse({ status: 200, description: 'El proyecto, sus tableros y sus tareas' })
  async exportar(@Request() req: Express.Request) {
    const projectId = req.projectId!;

    const [proyecto, tareas] = await Promise.all([
      firstValueFrom(this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId })),
      firstValueFrom(
        this.tasksClient.send({ cmd: 'task_find_by_project' }, { projectId }),
      ).catch(() => []),
    ]);

    return {
      /* La versión del formato, y va desde el primer día. Sin ella, quien
         escriba un importador dentro de dos años tiene que adivinar qué
         esperaba: un JSON sin versión es un contrato sin fecha. */
      formato: 1,
      exportadoEn: new Date().toISOString(),
      proyecto,
      tareas,
    };
  }

  /**
   * Cambia de responsable un proyecto. **O4.7.**
   *
   * ## Dos caminos, y cada uno con su puerta
   *
   * 1. **Voluntario** — lo hace quien es responsable hoy. `canDeleteProject` es
   *    el permiso que se exige porque el responsable siempre lo tiene por
   *    bypass, y porque regalar un proyecto es de la misma familia que borrarlo.
   * 2. **Forzado** — lo hace quien tenga `canManageAllProjects` en la
   *    organización del proyecto. Es la mitad que hace que la empresa pueda
   *    recuperar un tablero cuando su responsable se va, que es literalmente por
   *    lo que paga.
   *
   * 🔴 **Y las dos dejan rastro y avisan a las dos personas.** Un cambio de
   * responsable que nadie ve es la clase de gesto que se descubre semanas
   * después y ya no se puede reconstruir quién lo hizo.
   */
  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pasa la responsabilidad del proyecto a otro miembro' })
  @ApiResponse({ status: 200, description: 'El proyecto, con su responsable nuevo' })
  @ApiResponse({ status: 403, description: 'Ni eres su responsable ni administras la organización' })
  @ApiResponse({ status: 400, description: 'Esa persona no es miembro del proyecto' })
  async traspasar(
    @Request() req: Express.Request,
    @Param('id') _id: string,
    @Body() body: TransferProjectBodyDto,
  ) {
    const projectId = req.projectId!;
    const actorId = req.user!.userId;

    await this.exigirMandoSobreElProyecto(projectId, actorId);

    const resultado = await firstValueFrom(
      this.projectsClient.send<
        { id: string; name: string; ownerId: string; anteriorOwnerId: string } | { error: string }
      >({ cmd: 'project_transfer_ownership' }, { projectId, nuevoOwnerId: body.userId }),
    );

    if ('error' in resultado) throw new BadRequestException(resultado.error);

    /* Los dos avisos y el registro. Ninguno puede tumbar el traspaso: ya está
       hecho, y perderlo por no haber podido avisar sería cambiar el dato
       importante por el accesorio. */
    void this.avisarDelTraspaso(resultado, actorId);
    void this.registrarEnLaOrganizacion(projectId, 'proyecto_traspasado', {
      projectId,
      nombre: resultado.name,
      de: resultado.anteriorOwnerId,
      a: resultado.ownerId,
      por: actorId,
    });

    return resultado;
  }

  /**
   * Entra en un proyecto de tu organización del que no eres miembro. **O4.8.**
   *
   * ## 🔴 Es la única puerta que un papel de organización abre hacia dentro
   *
   * Está escrito que el **plan** no abre ninguna: pagar no da permisos. Lo que
   * abre esta es `canManageAllProjects`, que es un papel — y solo así, con un
   * gesto explícito que **queda registrado y le llega al responsable del
   * proyecto**.
   *
   * La alternativa que se descartó era que administración viera y entrara en
   * todo, siempre. Eso convierte a PRAXIS en un sitio donde nadie escribe nada
   * honesto en un comentario. Y la contraria —que no pueda entrar nunca— deja a
   * la empresa sin forma de recuperar un tablero cuando su responsable se va.
   *
   * ⚠️ **Entra con el rol por defecto del proyecto**, no como responsable. Ver
   * un tablero para recuperarlo no es apropiárselo.
   */
  @Post(':id/self-access')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Te da acceso a un proyecto de tu organización, dejando rastro' })
  @ApiResponse({ status: 200, description: 'Ya eres miembro. Queda registrado y se avisa' })
  @ApiResponse({ status: 403, description: 'No administras los proyectos de esa organización' })
  async autoAcceso(@Request() req: Express.Request, @Param('id', ParseUUIDPipe) id: string) {
    const actorId = req.user!.userId;

    const proyecto = await firstValueFrom(
      this.projectsClient.send<{
        id: string;
        name: string;
        ownerId: string;
        organizationId?: string;
        roles?: { id: string; name: string }[];
        members?: { userId: string }[];
      } | null>({ cmd: 'project_find_one' }, { id }),
    ).catch(() => null);

    if (!proyecto?.organizationId) throw new NotFoundException('Ese proyecto no existe.');

    await this.quota.exigirMandoEnLaOrganizacion(proyecto.organizationId, actorId);

    if (proyecto.members?.some((miembro) => miembro.userId === actorId)) {
      return { ok: true, yaEras: true };
    }

    const rol = proyecto.roles?.[0];
    if (!rol) throw new BadRequestException('Ese proyecto no tiene ningún rol que asignar.');

    await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'member_add' },
        { projectId: proyecto.id, userId: actorId, projectRoleId: rol.id },
      ),
    );

    void this.avisarDelAutoAcceso(proyecto, actorId);
    void this.registrarEnLaOrganizacion(proyecto.id, 'acceso_autoconcedido', {
      projectId: proyecto.id,
      nombre: proyecto.name,
      por: actorId,
    });

    return { ok: true, yaEras: false };
  }

  /** Detalle de un proyecto. Basta con poder verlo. */
  @Get(':id')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Detalle de un proyecto' })
  @ApiResponse({ status: 200, description: 'Detalle del proyecto recuperado' })
  findOne(@Request() req: Express.Request) {
    /* `req.projectId` y no el parámetro: la ruta acepta también el slug, y el
       guard ya lo tradujo al UUID real. Leerlo del `@Param` volvería a mandar
       «rediseno-del-panel» al microservicio, que solo entiende ids. */
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_find_one' }, { id: req.projectId! }),
    );
  }

  /**
   * Actualiza el nombre y la descripción de un proyecto.
   *
   * Exige `canEditProject`. Pedía `canEditBoard`, el permiso de otra cosa: es la
   * misma familia de rarezas que `canMoveTask`, `canComment` y
   * `canDeleteProject`, y se cierra igual — el permiso nuevo entra implicado por
   * el que se usaba antes, así que ningún rol existente pierde capacidad.
   */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_PROJECT)
  @ApiOperation({ summary: 'Actualiza un proyecto' })
  @ApiResponse({ status: 200, description: 'Proyecto actualizado exitosamente' })
  update(@Request() req: Express.Request, @Body() body: UpdateProjectBodyDto) {
    const id = req.projectId!;
    // El id va después del spread: uno colado en el cuerpo no debe pisar la ruta.
    return firstValueFrom(this.projectsClient.send({ cmd: 'project_update' }, { ...body, id }));
  }

  /**
   * Sube la imagen del proyecto. Misma puerta que renombrarlo (`canEditProject`):
   * es identidad igual que el nombre y el icono. Devuelve el proyecto con la
   * `imageUrl` nueva.
   */
  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_PROJECT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGEN_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube la imagen del proyecto' })
  setImage(@Request() req: Express.Request, @UploadedFile() file: Express.Multer.File) {
    validarImagenSubida(file);
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_set_image' },
        { id: req.projectId!, mimeType: file.mimetype, base64: file.buffer.toString('base64') },
      ),
    );
  }

  @Delete(':id/image')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_PROJECT)
  @ApiOperation({ summary: 'Quita la imagen del proyecto' })
  deleteImage(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_delete_image' }, { id: req.projectId! }),
    );
  }

  /**
   * Sirve los bytes de la imagen a quien pueda ver el proyecto.
   *
   * Un año de caché **inmutable**: la URL lleva `?v=<epoch>` y cambia con cada
   * imagen nueva, así que la respuesta vieja nunca se vuelve a pedir.
   */
  @Get(':id/image')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Bytes de la imagen del proyecto' })
  async getImage(@Request() req: Express.Request, @Res() res: Response) {
    const imagen = await firstValueFrom(
      this.projectsClient.send<{ mimeType: string; size: number; base64: string } | null>(
        { cmd: 'project_get_image' },
        { id: req.projectId! },
      ),
    );
    if (!imagen) throw new NotFoundException('Ese proyecto no tiene imagen');

    const bytes = Buffer.from(imagen.base64, 'base64');
    res.setHeader('Content-Type', imagen.mimeType);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(bytes);
  }

  /** Elimina un proyecto (requiere poder eliminar boards) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_PROJECT)
  @ApiOperation({ summary: 'Elimina un proyecto' })
  @ApiResponse({ status: 200, description: 'Proyecto eliminado exitosamente' })
  async delete(@Request() req: Express.Request) {
    const id = req.projectId!;
    const result = await firstValueFrom(
      this.projectsClient.send({ cmd: 'project_delete' }, { id }),
    );
    // Las tareas viven en otro microservicio: el cascade no llega hasta ellas.
    await Promise.all([
      this.taskPurge.afterProjectDeleted(id),
      this.automationPurge.afterProjectDeleted(id),
    ]);
    return result;
  }
  /**
   * Quién puede traspasar: su responsable, o quien administre la organización.
   *
   * ⚠️ **Dos puertas y un solo mensaje de error.** Decir cuál de las dos falló
   * sería decirle a quien no está dentro qué organización lo contiene.
   */
  private async exigirMandoSobreElProyecto(projectId: string, actorId: string) {
    const proyecto = await firstValueFrom(
      this.projectsClient.send<{ ownerId: string; organizationId?: string } | null>(
        { cmd: 'project_find_one' },
        { id: projectId },
      ),
    ).catch(() => null);

    if (!proyecto) throw new NotFoundException('Ese proyecto no existe.');
    if (proyecto.ownerId === actorId) return;

    const manda =
      proyecto.organizationId &&
      (await this.quota.mandaEnLaOrganizacion(proyecto.organizationId, actorId));

    if (!manda) {
      throw new ForbiddenException(
        'Solo su responsable, o quien administre los proyectos de la organización, puede traspasarlo.',
      );
    }
  }

  /**
   * Avisa a las dos personas y deja el rastro.
   *
   * ⚠️ **Nunca tumba el traspaso**: ya está hecho, y perderlo por no haber
   * podido avisar sería cambiar el dato importante por el accesorio.
   */
  private async avisarDelTraspaso(
    proyecto: { id: string; name: string; ownerId: string; anteriorOwnerId: string },
    actorId: string,
  ) {
    const avisos = [
      {
        userId: proyecto.ownerId,
        message: `Ahora eres responsable de «${proyecto.name}».`,
      },
      {
        userId: proyecto.anteriorOwnerId,
        message: `Ya no eres responsable de «${proyecto.name}». Sigues dentro del proyecto.`,
      },
    ].filter((aviso) => aviso.userId !== actorId);

    await Promise.all(
      avisos.map((aviso) =>
        firstValueFrom(
          this.projectsClient.send(
            { cmd: 'notification_create' },
            {
              userId: aviso.userId,
              type: 'PROJECT_UPDATED',
              message: aviso.message,
              projectId: proyecto.id,
            },
          ),
        ).catch((error: Error) => {
          this.log.warn(`No se pudo avisar del traspaso de ${proyecto.id}: ${error.message}`);
        }),
      ),
    );
  }

  /**
   * Avisa al responsable de que alguien de administración ha entrado.
   *
   * 🔴 **Es la mitad que hace aceptable la puerta.** Sin este aviso,
   * `canManageAllProjects` sería una llave maestra silenciosa — y eso es lo que
   * se decidió no construir.
   */
  private async avisarDelAutoAcceso(
    proyecto: { id: string; name: string; ownerId: string },
    actorId: string,
  ) {
    if (proyecto.ownerId === actorId) return;

    await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'notification_create' },
        {
          userId: proyecto.ownerId,
          type: 'PROJECT_UPDATED',
          message: `Alguien que administra la organización se ha dado acceso a «${proyecto.name}».`,
          projectId: proyecto.id,
        },
      ),
    ).catch((error: Error) => {
      this.log.warn(`No se pudo avisar del acceso a ${proyecto.id}: ${error.message}`);
    });
  }

  /**
   * Deja el gesto en el registro de la organización del proyecto. **O7.1.**
   *
   * ## Por qué aquí y no en la auditoría de plataforma
   *
   * 🔴 Son **dos registros para dos públicos**. El de `permissions-service`
   * responde «¿qué ha hecho la administración de PRAXIS?» y lo lee quien lleva
   * la instalación; el de la organización responde «¿qué ha pasado en mi
   * equipo?» y lo lee quien lleva la empresa. Un traspaso de responsable o un
   * acceso autoconcedido le importan a la segunda, y hasta ahora **no aparecían
   * en ninguno de los dos**: solo llegaba un aviso a una persona, que se lee una
   * vez y desaparece.
   *
   * ⚠️ **Nunca falla hacia fuera.** Es prueba, no camino: si no se puede
   * escribir, la acción ya está hecha y perderla por el registro sería el peor
   * de los dos resultados.
   */
  private async registrarEnLaOrganizacion(projectId: string, tipo: string, payload: unknown) {
    const proyecto = await firstValueFrom(
      this.projectsClient.send<{ organizationId?: string } | null>(
        { cmd: 'project_find_one' },
        { id: projectId },
      ),
    ).catch(() => null);

    if (!proyecto?.organizationId) return;

    await firstValueFrom(
      this.billingClient.send(
        { cmd: 'billing_org_log' },
        { organizationId: proyecto.organizationId, type: tipo, payload },
      ),
    ).catch((error: Error) => {
      this.log.warn(`No se pudo registrar «${tipo}» de ${projectId}: ${error.message}`);
    });
  }

}
