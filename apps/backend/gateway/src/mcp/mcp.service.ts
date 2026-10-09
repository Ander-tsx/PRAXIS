import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { scopeCovers } from '@praxis/contracts';
import type { McpConnectionView } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { McpAccessError, McpAccessService, type McpSession } from './mcp-access.service';
import {
  CAMPOS_CREAR_TAREA,
  HERRAMIENTAS_DE_ORGANIZACION,
  type JsonSchema,
  MCP_TOOLS,
  MCP_TOOLS_BY_NAME,
  type McpTool,
  type ToolCall,
} from './mcp-tools';

/** Las versiones del protocolo que se aceptan, la más nueva primero. */
export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/** Un mensaje JSON-RPC 2.0 tal y como llega. */
export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | {
      jsonrpc: '2.0';
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };

/** Lo que devuelve una llamada a la API: el `data` del sobre, o su error. */
type ApiResult = { ok: true; data: unknown } | { ok: false; status: number; error: unknown };

function instrucciones(session: Pick<McpSession, 'connection'>): string {
  return [
    'Praxis es un gestor de proyectos: organización → proyectos → espacios → tableros → columnas → tareas.',
    session.connection
      ? 'Trabajas en una organización a la vez: list_organizations dice cuáles hay y cuál está activa, y switch_organization cambia. Todo lo que hagas queda a nombre de quien te conectó.'
      : 'Este token vale para una sola organización; todo lo que hagas queda a nombre de quien lo creó.',
    'Para orientarte: list_projects → list_workspaces → list_boards → get_board (columnas) → list_tasks.',
    'Antes de escribir en un proyecto, get_my_permissions dice qué puedes hacer.',
    'Las herramientas delete_* son irreversibles: confírmalo con tu usuario antes de usarlas.',
  ].join(' ');
}

/**
 * El servidor MCP (docs/PLAN-MCP.md, M1 y M3–M4).
 *
 * ## Streamable HTTP, sin estado
 *
 * Cada `POST` trae un mensaje (o un lote) JSON-RPC y se contesta con JSON. No
 * se abre flujo SSE ni se guarda sesión (`Mcp-Session-Id`): ninguna
 * herramienta lo necesita, y sin estado el monolito puede dormir y reiniciar
 * sin dejar a ningún cliente con una sesión que ya no existe.
 *
 * ## Las herramientas llaman a la API de siempre
 *
 * Con el JWT del canje y por HTTP contra el propio gateway (M5). Así pasan por
 * los mismos guards, cuotas, validación y límite por cuenta que la interfaz:
 * el MCP no puede más que el usuario (I1) porque **es** el usuario usando la
 * API.
 */
@Injectable()
export class McpService {
  private readonly log = new Logger(McpService.name);
  private readonly base: string;

  constructor(
    private readonly access: McpAccessService,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    config: ConfigService,
  ) {
    const puerto = config.get<number>('HTTP_PORT') ?? 3000;
    this.base = `http://127.0.0.1:${puerto}/api`;
  }

  /** Atiende un mensaje. `null` si era una notificación (sin respuesta). */
  async handle(session: McpSession, message: JsonRpcMessage): Promise<JsonRpcResponse | null> {
    const id = message.id ?? null;
    const esNotificacion = message.id === undefined;

    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return esNotificacion ? null : this.fallo(id, -32600, 'Mensaje JSON-RPC no válido.');
    }
    if (esNotificacion) return null;

    try {
      switch (message.method) {
        case 'initialize':
          return this.ok(id, this.initialize(session, message.params));
        case 'ping':
          return this.ok(id, {});
        case 'tools/list':
          return this.ok(id, { tools: this.toolsFor(session) });
        case 'tools/call':
          return this.ok(id, await this.call(session, message.params ?? {}));
        default:
          return this.fallo(id, -32601, `Método no soportado: ${message.method}`);
      }
    } catch (error) {
      if (error instanceof McpAccessError) {
        return this.fallo(id, -32602, error.message, { code: error.code, details: error.details });
      }
      return this.fallo(id, -32603, 'Error interno del servidor MCP.');
    }
  }

  private initialize(session: McpSession, params: Record<string, unknown> | undefined) {
    const pedida = typeof params?.protocolVersion === 'string' ? params.protocolVersion : null;
    return {
      protocolVersion:
        pedida && MCP_PROTOCOL_VERSIONS.includes(pedida) ? pedida : MCP_PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'praxis', title: 'Praxis', version: '1.0.0' },
      instructions: instrucciones(session),
    };
  }

  /** Solo las que el token puede usar: un `read` no ve las de escritura. */
  toolsFor(session: Pick<McpSession, 'scopes'>) {
    return MCP_TOOLS.filter((tool) => scopeCovers(session.scopes, tool.scope)).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: tool.scope === 'read',
        destructiveHint: tool.scope === 'delete',
      },
    }));
  }

  private async call(session: McpSession, params: Record<string, unknown>) {
    const tool = MCP_TOOLS_BY_NAME.get(String(params.name));
    /* La misma respuesta para «no existe» y «tu token no la tiene»: la lista
       que vio el agente ya no la incluía. */
    if (!tool || !scopeCovers(session.scopes, tool.scope)) {
      throw new McpAccessError(
        HttpStatus.BAD_REQUEST,
        'UNKNOWN_TOOL',
        `La herramienta «${String(params.name)}» no existe o este token no tiene permiso para usarla.`,
      );
    }

    this.access.limitar(session.personalTokenId);

    /* La organización activa no se puede usar (te sacaron, bajó el plan, apagaron
       el MCP): solo pasan las herramientas que sirven para cambiar de organización. */
    if (session.bloqueo && !HERRAMIENTAS_DE_ORGANIZACION.has(tool.name)) {
      return this.resultadoDeError(session.bloqueo.getStatus(), {
        code: session.bloqueo.code,
        message: `${session.bloqueo.message} Usa list_organizations y switch_organization para trabajar en otra.`,
        details: session.bloqueo.details,
      });
    }

    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const invalida = validar(tool.inputSchema, args);
    if (invalida)
      return this.resultadoDeError(400, { code: 'VALIDATION_ERROR', message: invalida });

    const inicio = Date.now();
    try {
      if (tool.anchor !== 'organization') {
        await this.access.exigirEnLaOrganizacion(session, tool.anchor, args[tool.anchor]);
      }
      const resultado = tool.custom
        ? await this.custom(session, tool, args)
        : await this.single(session, tool.call as ToolCall, args);

      /* M12: qué herramientas se usan y cómo les va, para decidir si OAuth
         compensa. Sin argumentos ni resultados: ni contenido ni ids. */
      this.log.log(
        `mcp_tool_call ${JSON.stringify({ tool: tool.name, ok: resultado.ok, status: resultado.ok ? 200 : resultado.status, ms: Date.now() - inicio })}`,
      );

      return resultado.ok
        ? { content: [{ type: 'text', text: JSON.stringify(resultado.data) }] }
        : this.resultadoDeError(resultado.status, resultado.error);
    } catch (error) {
      if (error instanceof McpAccessError) {
        this.log.log(
          `mcp_tool_call ${JSON.stringify({ tool: tool.name, ok: false, status: error.getStatus(), ms: Date.now() - inicio })}`,
        );
        return this.resultadoDeError(error.getStatus(), {
          code: error.code,
          message: error.message,
          details: error.details,
        });
      }
      throw error;
    }
  }

  /**
   * M8: el error del gateway llega al agente **tal cual**, con su estado, su
   * código y sus detalles (`puedeAmpliar` en un 402, el campo en un 400). Es
   * un resultado con `isError`, no un error de protocolo: así el agente lo lee
   * y se lo cuenta a su usuario en vez de reintentar a ciegas.
   */
  private resultadoDeError(status: number, error: unknown) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ status, ...(error as object) }) }],
    };
  }

  /** Una herramienta que es una sola llamada a la API. */
  private single(session: McpSession, call: ToolCall, args: Record<string, unknown>) {
    const path = call.path.replace(/\{(\w+)\}/g, (_, nombre: string) =>
      encodeURIComponent(String(args[nombre] ?? '')),
    );

    const query = new URLSearchParams();
    for (const campo of call.query ?? []) {
      if (args[campo] !== undefined) query.set(campo, String(args[campo]));
    }
    if (call.inject?.organizationId === 'query')
      query.set('organizationId', session.organizationId);

    const body = call.body ? elegir(args, call.body) : undefined;
    if (body && call.inject?.organizationId === 'body')
      body.organizationId = session.organizationId;

    const qs = query.toString();
    return this.api(session, call.method, qs ? `${path}?${qs}` : path, body);
  }

  /* ─── Las que no son una sola llamada ─────────────────────────────────── */

  private async custom(
    session: McpSession,
    tool: McpTool,
    args: Record<string, unknown>,
  ): Promise<ApiResult> {
    switch (tool.custom) {
      case 'create_task':
        return this.crearTarea(session, String(args.boardId), args);
      case 'create_tasks':
        return this.lote(args.tasks as Record<string, unknown>[], (tarea) =>
          this.crearTarea(session, String(args.boardId), tarea),
        );
      case 'move_task':
        return this.moverTarea(session, args);
      case 'move_tasks':
        return this.lote(args.moves as Record<string, unknown>[], async (movimiento) => {
          await this.access.exigirEnLaOrganizacion(session, 'taskId', movimiento.taskId);
          return this.moverTarea(session, movimiento);
        });
      case 'delete_tasks':
        return this.lote(
          (args.taskIds as string[]).map((taskId) => ({ taskId })),
          async ({ taskId }) => {
            await this.access.exigirEnLaOrganizacion(session, 'taskId', taskId);
            return this.api(session, 'DELETE', `/tasks/${encodeURIComponent(String(taskId))}`, {});
          },
        );
      case 'list_my_tasks':
        return this.misTareas(session, args);
      case 'set_task_field':
        return this.valorDeCampo(session, args);
      case 'list_organizations':
        return this.listarOrganizaciones(session);
      case 'switch_organization':
        return this.cambiarOrganizacion(session, String(args.targetOrgId));
      default:
        return { ok: false, status: 500, error: { message: 'Herramienta sin implementar.' } };
    }
  }

  /* ─── Organizaciones ──────────────────────────────────────────────────── */

  /** Las organizaciones de esa persona, para poner nombre a los ids de la conexión. */
  private async organizacionesDe(userId: string) {
    const todas = await firstValueFrom(
      this.billingClient.send<{ id: string; name: string | null; kind: string }[]>(
        { cmd: 'billing_orgs_of' },
        { userId },
      ),
    ).catch(() => []);
    return Array.isArray(todas) ? todas : [];
  }

  private async listarOrganizaciones(session: McpSession): Promise<ApiResult> {
    const permitidas = new Set(session.connection?.allowedOrgIds ?? [session.organizationId]);
    const organizaciones = (await this.organizacionesDe(session.userId))
      .filter((o) => permitidas.has(o.id))
      .map((o) => ({
        id: o.id,
        name: o.name,
        personal: o.kind === 'PERSONAL',
        active: o.id === session.organizationId,
      }));
    return { ok: true, data: organizaciones };
  }

  private async cambiarOrganizacion(session: McpSession, targetOrgId: string): Promise<ApiResult> {
    if (!session.connection) {
      return {
        ok: false,
        status: 400,
        error: {
          code: 'NOT_SUPPORTED',
          message:
            'Un token personal vale para una sola organización. Crea otro token, o conecta por OAuth para poder cambiar.',
        },
      };
    }
    if (!session.connection.allowedOrgIds.includes(targetOrgId)) {
      return {
        ok: false,
        status: 403,
        error: {
          code: 'OUT_OF_SCOPE',
          message:
            'Esa organización no está entre las de esta conexión. Quien te conectó puede añadirla en Integraciones, en Praxis.',
        },
      };
    }
    /* Que se pueda USAR, antes de guardarla: cambiar a una que ya no deja entrar
       sería dejar la conexión en un callejón. Lanza con el motivo exacto. */
    await this.access.exigirOrganizacionUsable(session.userId, targetOrgId);

    await firstValueFrom(
      this.credentialsClient.send<McpConnectionView>(
        { cmd: 'mcp_conn_update' },
        { userId: session.userId, id: session.connection.id, activeOrgId: targetOrgId },
      ),
    );
    return { ok: true, data: { activeOrgId: targetOrgId } };
  }

  /**
   * Crea una tarea poniendo su `status`, que la API exige igual al nombre de
   * la columna. Pedírselo al agente sería pedirle que adivine.
   */
  private async crearTarea(
    session: McpSession,
    boardId: string,
    datos: Record<string, unknown>,
  ): Promise<ApiResult> {
    const columna = (await this.access.columnasDe(boardId)).find((c) => c.id === datos.columnId);
    if (!columna) {
      return {
        ok: false,
        status: 400,
        error: { code: 'VALIDATION_ERROR', message: 'Esa columna no es de ese tablero.' },
      };
    }
    const body = { ...elegir(datos, CAMPOS_CREAR_TAREA), status: columna.name };
    return this.api(session, 'POST', `/boards/${encodeURIComponent(boardId)}/tasks`, body);
  }

  /**
   * El valor de un campo personalizado (`docs/PLAN-CAMPOS-PERSONALIZADOS.md`).
   *
   * La ruta recibe un solo `value` cuya forma depende del tipo del campo —texto,
   * número, sí/no o lista de ids—, y el catálogo no admite uniones en un esquema
   * (trampa 2). Así que la herramienta pide **un parámetro con tipo por cada
   * forma** y aquí se elige el que llegó. Más de uno a la vez es ambiguo y se
   * rechaza en vez de adivinar; qué forma corresponde a qué tipo lo valida la
   * ruta, que es la que conoce el campo.
   */
  private async valorDeCampo(
    session: McpSession,
    args: Record<string, unknown>,
  ): Promise<ApiResult> {
    const formas = (['text', 'number', 'checked', 'ids'] as const).filter(
      (forma) => args[forma] !== undefined,
    );
    const vaciar = args.clear === true;
    if (formas.length + (vaciar ? 1 : 0) !== 1) {
      return {
        ok: false,
        status: 400,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Indica exactamente uno: text, number, checked, ids o clear: true.',
        },
      };
    }
    const value = vaciar ? null : args[formas[0]];
    return this.api(
      session,
      'PUT',
      `/tasks/${encodeURIComponent(String(args.taskId))}/fields/${encodeURIComponent(String(args.fieldId))}`,
      { value },
    );
  }

  /** Mueve una tarea dentro de su tablero, con el `status` de la columna destino. */
  private async moverTarea(
    session: McpSession,
    datos: Record<string, unknown>,
  ): Promise<ApiResult> {
    const taskId = String(datos.taskId);
    const boardId = await this.access.tableroDeLaTarea(taskId);
    const columna = boardId
      ? (await this.access.columnasDe(boardId)).find((c) => c.id === datos.columnId)
      : undefined;
    if (!columna) {
      return {
        ok: false,
        status: 400,
        error: { code: 'VALIDATION_ERROR', message: 'Esa columna no es del tablero de la tarea.' },
      };
    }
    return this.api(session, 'POST', `/tasks/${encodeURIComponent(taskId)}/move`, {
      columnId: columna.id,
      status: columna.name,
      ...(datos.order !== undefined ? { order: datos.order } : {}),
    });
  }

  /**
   * Las tareas asignadas, **solo de la organización del token** (I2).
   *
   * `/me/tasks` no sabe de organizaciones: devuelve las de todos tus
   * proyectos. Se filtra por los proyectos de esta organización.
   */
  private async misTareas(session: McpSession, args: Record<string, unknown>): Promise<ApiResult> {
    if (args.projectId) {
      await this.access.exigirEnLaOrganizacion(session, 'projectId', args.projectId);
    }

    const proyectos = await this.api(
      session,
      'GET',
      `/projects?organizationId=${encodeURIComponent(session.organizationId)}&limit=100`,
    );
    if (!proyectos.ok) return proyectos;
    const ids = new Set(listaDe(proyectos.data).map((p) => (p as { id: string }).id));

    const query = new URLSearchParams();
    for (const campo of ['projectId', 'status', 'priority', 'dueBefore', 'excludeDone', 'limit']) {
      if (args[campo] !== undefined) query.set(campo, String(args[campo]));
    }
    const tareas = await this.api(session, 'GET', `/me/tasks?${query.toString()}`);
    if (!tareas.ok) return tareas;

    const items = listaDe(tareas.data).filter((t) =>
      ids.has((t as { projectId: string }).projectId),
    );
    return { ok: true, data: { items, total: items.length } };
  }

  /**
   * M7: un lote **no es una transacción**. Cada elemento va por su ruta normal,
   * uno detrás de otro, y se devuelve qué salió y qué falló para que el agente
   * reintente solo lo que falló.
   */
  private async lote<T extends Record<string, unknown>>(
    elementos: T[],
    hacer: (elemento: T) => Promise<ApiResult>,
  ): Promise<ApiResult> {
    const resultados: { index: number; ok: boolean; data?: unknown; error?: unknown }[] = [];

    for (const [index, elemento] of elementos.entries()) {
      try {
        const r = await hacer(elemento);
        resultados.push(
          r.ok
            ? { index, ok: true, data: r.data }
            : { index, ok: false, error: { status: r.status, ...(r.error as object) } },
        );
      } catch (error) {
        const e =
          error instanceof McpAccessError
            ? { status: error.getStatus(), code: error.code, message: error.message }
            : { status: 500, message: 'Error interno.' };
        resultados.push({ index, ok: false, error: e });
      }
    }

    const fallidos = resultados.filter((r) => !r.ok).length;
    return {
      ok: true,
      data: {
        total: elementos.length,
        ok: elementos.length - fallidos,
        failed: fallidos,
        results: resultados,
      },
    };
  }

  /* ─── La llamada a la API ─────────────────────────────────────────────── */

  /**
   * Llama al gateway con el JWT del canje y desenvuelve el sobre
   * `{ success, data, error }`.
   *
   * ⚠️ **Se confirma contra `success`, no contra el estado** (regla de los
   * fetch de CLAUDE.md): una ruta puede contestar 200 sin haber hecho nada.
   */
  private async api(
    session: McpSession,
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<ApiResult> {
    const respuesta = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const sobre = (await respuesta.json().catch(() => null)) as {
      success?: boolean;
      data?: unknown;
      error?: unknown;
    } | null;

    if (respuesta.ok && sobre?.success !== false) return { ok: true, data: sobre?.data ?? null };
    return {
      ok: false,
      status: respuesta.status,
      error: sobre?.error ?? { message: `La API respondió ${respuesta.status}.` },
    };
  }

  private ok(id: string | number | null, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
  }

  private fallo(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
  ): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
  }
}

/** Los campos de `campos` que vienen en `datos`, y ninguno más. */
function elegir(datos: Record<string, unknown>, campos: readonly string[]) {
  const fuera: Record<string, unknown> = {};
  for (const campo of campos) if (datos[campo] !== undefined) fuera[campo] = datos[campo];
  return fuera;
}

/** La lista de una respuesta paginada o suelta: `[...]`, `{ items }` o `{ data }`. */
function listaDe(datos: unknown): unknown[] {
  if (Array.isArray(datos)) return datos;
  const objeto = datos as { items?: unknown[]; data?: unknown[] } | null;
  return objeto?.items ?? objeto?.data ?? [];
}

/**
 * Un id que se puede meter en una ruta sin escaparse de ella.
 *
 * ⚠️ **No se exige UUID hexadecimal**, aunque el esquema diga `uuid`: los
 * datos sembrados usan ids como `task0003-0003-…`, que la API acepta, y el
 * agente los lee de ella. Lo que importa aquí es que no traiga `/`, `.` ni
 * `?` — la API ya valida el resto.
 */
const ID_SEGURO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Validación ligera contra el esquema de la herramienta. Devuelve el primer
 * problema, en español, o `null`.
 *
 * No sustituye a la del gateway, que es la que manda: está para dar un
 * mensaje claro antes, y sobre todo para **rechazar campos que el esquema no
 * declara** — un `organizationId` colado por el agente no llega a ninguna
 * ruta (I2).
 */
export function validar(schema: JsonSchema, valor: unknown, ruta = 'arguments'): string | null {
  switch (schema.type) {
    case 'object': {
      if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
        return `${ruta} tiene que ser un objeto.`;
      }
      const objeto = valor as Record<string, unknown>;
      const propiedades = schema.properties ?? {};
      for (const clave of Object.keys(objeto)) {
        if (!(clave in propiedades)) return `${ruta}.${clave} no existe en esta herramienta.`;
      }
      for (const requerida of schema.required ?? []) {
        if (objeto[requerida] === undefined || objeto[requerida] === null) {
          return `Falta ${ruta}.${requerida}.`;
        }
      }
      for (const [clave, sub] of Object.entries(propiedades)) {
        if (objeto[clave] === undefined) continue;
        const problema = validar(sub, objeto[clave], `${ruta}.${clave}`);
        if (problema) return problema;
      }
      return null;
    }
    case 'array': {
      if (!Array.isArray(valor)) return `${ruta} tiene que ser una lista.`;
      if (schema.maxItems !== undefined && valor.length > schema.maxItems) {
        return `${ruta} admite como mucho ${schema.maxItems} elementos.`;
      }
      for (const [i, elemento] of valor.entries()) {
        const problema = schema.items ? validar(schema.items, elemento, `${ruta}[${i}]`) : null;
        if (problema) return problema;
      }
      return null;
    }
    case 'string': {
      if (typeof valor !== 'string') return `${ruta} tiene que ser texto.`;
      if (schema.format === 'uuid' && !ID_SEGURO.test(valor)) return `${ruta} no es un id válido.`;
      if (schema.enum && !schema.enum.includes(valor)) {
        return `${ruta} tiene que ser uno de: ${schema.enum.join(', ')}.`;
      }
      return null;
    }
    case 'integer':
      return Number.isInteger(valor) ? null : `${ruta} tiene que ser un número entero.`;
    case 'number':
      return typeof valor === 'number' && Number.isFinite(valor)
        ? null
        : `${ruta} tiene que ser un número.`;
    case 'boolean':
      return typeof valor === 'boolean' ? null : `${ruta} tiene que ser verdadero o falso.`;
    default:
      return null;
  }
}
