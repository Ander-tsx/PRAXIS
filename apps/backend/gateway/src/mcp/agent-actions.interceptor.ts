import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { Request } from 'express';
import { type Observable, from, mergeMap } from 'rxjs';
import { firstValueFrom } from 'rxjs';

const ESCRITURAS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Una respuesta con forma de `{ id }`, venga sola o dentro del sobre. */
function idDe(respuesta: unknown): string | null {
  const r = respuesta as { id?: unknown; data?: { id?: unknown } } | null;
  const id = r?.id ?? r?.data?.id;
  return typeof id === 'string' ? id : null;
}

/**
 * Anota cada escritura que sale bien y viene de un agente por el MCP
 * (coautoría: docs/PLAN-MCP.md).
 *
 * ## Por qué un interceptor global y no la lista de herramientas
 *
 * Las herramientas llaman a la API de siempre con el JWT del canje, así que **todo
 * lo que escriben pasa por aquí**, también lo que hoy se añada o lo que una
 * herramienta haga con varias llamadas. Una lista por herramienta se olvida de la
 * siguiente; esto no puede olvidarse, y es lo que hace que no haya forma de
 * escribir por MCP sin dejar la marca.
 *
 * La marca (`req.user.agent`) la pone `JwtGuard` leyendo el JWT que firma
 * credentials. Una sesión normal no la trae.
 *
 * ## Se espera al registro antes de responder
 *
 * Así quien abre la tarea justo después ya ve el rastro. Si el registro falla, la
 * escritura ya ocurrió y no se puede deshacer entre servicios: se avisa en el log
 * y se contesta igual, en vez de dar un error por una acción que sí se hizo.
 */
@Injectable()
export class AgentActionsInterceptor implements NestInterceptor {
  private readonly log = new Logger(AgentActionsInterceptor.name);

  constructor(@Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      mergeMap((respuesta) => {
        if (!ESCRITURAS.has(req.method) || !req.user?.agent) return from([respuesta]);
        return from(this.anotar(req, respuesta).then(() => respuesta));
      }),
    );
  }

  private async anotar(req: Request, respuesta: unknown): Promise<void> {
    const agent = req.user?.agent;
    if (!agent || !req.user) return;

    const ruta = (req.route?.path as string | undefined) ?? req.path;
    const params = req.params as Record<string, string | undefined>;
    const esTarea = /\/tasks\/:(taskId|id)(\/|$)/.test(ruta);
    const crea = req.method === 'POST' && /\/boards\/:boardId\/tasks$/.test(ruta);

    const taskId =
      params.taskId ?? (esTarea ? params.id : undefined) ?? (crea ? idDe(respuesta) : null);
    const area = ruta.includes('/checklists')
      ? 'checklist'
      : ruta.includes('/comments')
        ? 'comment'
        : taskId
          ? 'task'
          : 'other';

    try {
      await firstValueFrom(
        this.credentialsClient.send(
          { cmd: 'mcp_action_record' },
          {
            userId: req.user.userId,
            agentId: agent.agentId,
            agentName: agent.agentName,
            agentKind: agent.agentKind,
            route: `${req.method} ${ruta.replace(/^\/api/, '')}`,
            area,
            taskId: taskId ?? null,
            projectId: req.projectId ?? null,
            /* Lo que se tocó: el `:id` de la ruta si lo hay (un paso, una nota…) y, al crear, el id nuevo. */
            entityId: (esTarea && !params.taskId ? taskId : params.id) ?? idDe(respuesta),
          },
        ),
      );
    } catch (error) {
      this.log.error(
        `No se pudo anotar la acción del agente ${JSON.stringify({ route: ruta, area })}: ${String(error)}`,
      );
    }
  }
}
