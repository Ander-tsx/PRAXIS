import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AssistantChatBodyDto, ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * El asistente de un proyecto.
 *
 * Cuelga de `/projects/:projectId/...`, así que `ProjectPermissionGuard`
 * resuelve el proyecto de `params` sin que haya que tocar el guard ni apuntar
 * este controlador en `TASK_CONTROLLERS`. Mismo caso que los reportes.
 *
 * ### Qué hace este controlador que no hace assistant-service
 *
 * Resuelve **quién es quién y qué puede hacer**, que es trabajo del gateway y de
 * nadie más: es el único que habla con projects y con credentials, y el único
 * que sabe de roles. `assistant-service` recibe el mapa de permisos ya expandido
 * y los miembros ya con nombre, y se dedica a lo suyo —la cuota y hablar con
 * Gemini— sin abrir clientes hacia media plataforma.
 *
 * ### La línea de permisos
 *
 * | | |
 * |---|---|
 * | Hablar con el asistente | `canViewProject` |
 * | Que le llegue el desglose por persona | `canViewReports` |
 * | Que se le declare `proponer_tarea` | `canCreateTask` |
 * | Que se le declare `proponer_asignacion` | `canEditTask` |
 *
 * Los tres últimos no son guards: son **datos que viajan** y que recortan lo que
 * el modelo ve y lo que puede sugerir. El guard de verdad sigue estando donde
 * estaba: al aceptar la propuesta se llama al endpoint de siempre, con su
 * permiso de siempre.
 *
 * ⚠️ **Este controlador no escribe nada.** No crea tareas, no asigna y no toca
 * el tablero. Devuelve texto y propuestas.
 */
@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/assistant')
export class AssistantController {
  constructor(
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  /**
   * Cuánta cuota le queda a quien pregunta.
   *
   * Va por su cuenta y no dentro del turno porque la pantalla lo necesita **al
   * cargar**, antes de que nadie escriba nada: poner el coste a la vista de
   * quien lo gasta evita la sorpresa de encontrarse el límite de golpe.
   *
   * Es del usuario, no del proyecto, pero cuelga de `/projects/:projectId` para
   * que el guard tenga contra qué comprobar `canViewProject`: sin proyecto en la
   * ruta no hay nada que resolver, que es el mismo motivo por el que `/me/tasks`
   * cuelga de `/me`.
   */
  @Get('quota')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Cuota mensual del asistente para quien llama' })
  @ApiResponse({ status: 200, description: 'plan, usados, limite, periodo y fecha de reinicio' })
  quota(
    @Param('projectId', ParseUUIDPipe) _projectId: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.assistantClient.send({ cmd: 'assistant_quota' }, { userId: req.user!.userId }),
    );
  }

  /**
   * Un turno de conversación.
   *
   * ⚠️ **Responde con propuestas, nunca con hechos.** Si el modelo decide llamar
   * a una función, lo que sale por aquí es la propuesta; crear la tarea es otra
   * petición, a `POST /boards/:boardId/tasks`, con `canCreateTask` y la misma
   * validación de siempre.
   *
   * Códigos que puede devolver, además de los normales:
   * - **429** cuota agotada, con la cuota en `details` para que el chat la pinte;
   * - **502** Gemini no respondió. En ese caso **no se ha consumido cuota**.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Un turno de conversación con el asistente del proyecto' })
  @ApiResponse({ status: 200, description: 'Respuesta, propuestas pendientes de aceptar y cuota' })
  @ApiResponse({ status: 429, description: 'Cuota mensual agotada' })
  @ApiResponse({ status: 502, description: 'Gemini no respondió. No se ha consumido cuota' })
  async chat(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: Express.Request,
    @Body() body: AssistantChatBodyDto,
  ) {
    const userId = req.user!.userId;

    const [permisos, miembros] = await Promise.all([
      this.permisosEfectivos(userId, projectId),
      this.miembrosConNombre(projectId),
    ]);

    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_chat' },
        {
          projectId,
          userId,
          message: body.message,
          history: body.history ?? [],
          permisos,
          miembros,
        },
      ),
    );
  }

  /**
   * El mapa efectivo, ya expandido por jerarquía y con el bypass del dueño.
   *
   * Es exactamente lo que devuelve `GET /projects/:id/permissions/me`, y se pide
   * aquí en vez de fiarse de nada que venga del cliente: quien decide qué
   * herramientas ve el modelo no puede ser el navegador.
   */
  private async permisosEfectivos(
    userId: string,
    projectId: string,
  ): Promise<Record<string, boolean>> {
    const efectivos = await firstValueFrom(
      this.projectsClient.send<{ permissions?: Record<string, boolean> }>(
        { cmd: 'project_effective_permissions' },
        { userId, projectId },
      ),
    );
    return efectivos?.permissions ?? {};
  }

  /**
   * Los miembros, con un nombre que se pueda decir en voz alta.
   *
   * El modelo necesita las dos cosas: el `userId` para poder rellenar
   * `assigneeIds` en una propuesta, y el nombre para escribir «Carlos» en vez de
   * un UUID en mitad de una frase.
   *
   * Los nombres viven en credentials-service, que no conoce los proyectos, y los
   * miembros en projects-service, que no conoce los nombres. Cruzarlos es
   * trabajo del gateway — es el mismo cruce que ya hace la pantalla de Reportes
   * pidiendo `/members` y `/users` por separado.
   *
   * Si credentials no responde, cada persona se queda con su id como nombre en
   * vez de tumbar el turno: perder los nombres empeora la respuesta, perder el
   * turno la borra.
   */
  private async miembrosConNombre(
    projectId: string,
  ): Promise<{ userId: string; nombre: string }[]> {
    const miembros = await firstValueFrom(
      this.projectsClient.send<{ userId: string }[]>({ cmd: 'member_find_all' }, { projectId }),
    ).catch(() => [] as { userId: string }[]);

    return Promise.all(
      (miembros ?? []).map(async (miembro) => {
        const perfil = await firstValueFrom(
          this.credentialsClient.send<{ firstName?: string; lastName?: string }>(
            { cmd: 'user_find_one' },
            { id: miembro.userId },
          ),
        ).catch(() => null);

        const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
        return { userId: miembro.userId, nombre: nombre || miembro.userId };
      }),
    );
  }
}
