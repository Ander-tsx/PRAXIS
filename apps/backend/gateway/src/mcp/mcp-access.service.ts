import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  type ExchangedMcpConnection,
  type ExchangedPersonalToken,
  PAT_CALLS_PER_MINUTE,
  PAT_PREFIX,
  type PatScope,
  patScopesFromOAuth,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { QuotaService } from '../billing/quota.service';
import { KylooOAuthService } from './kyloo-oauth.service';
import { McpAccessError } from './mcp-errors';
import type { ToolAnchor } from './mcp-tools';

/** Lo que vale durante una petición al MCP. */
export interface McpSession {
  personalTokenId: string;
  userId: string;
  organizationId: string;
  scopes: PatScope[];
  /** JWT `typ: access` de vida corta para llamar a la API (M5). */
  accessToken: string;
  /**
   * Solo en una sesión por OAuth: la conexión, con las organizaciones a las que
   * llega. Un token personal vale para una sola y no tiene esto.
   */
  connection?: { id: string; clientName: string; allowedOrgIds: string[] };
  /**
   * Por qué la organización activa **no se puede usar ahora** (se salió de ella,
   * su plan bajó, apagaron el MCP). La sesión sigue abierta para que el agente
   * pueda cambiar de organización; solo las herramientas de organización pasan.
   */
  bloqueo?: McpAccessError;
}

/* `McpAccessError` vive en `mcp-errors.ts` y se reexporta: kyloo-oauth.service lo usa y esta
   clase usa a kyloo-oauth.service, y un ciclo de importación entre ambos deja la inyección
   con `undefined` sin ningún error al arrancar. */
export { McpAccessError } from './mcp-errors';

/** Ver `ID_SEGURO` en `mcp.service.ts`: los ids sembrados no son hexadecimales. */
const ID_SEGURO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Quién puede entrar por el MCP y a qué (docs/PLAN-MCP.md, M5, M9, M14, I2).
 *
 * ## Tres comprobaciones en CADA petición
 *
 * 1. **El token** (credentials): hash, revocación, caducidad y estado de la
 *    cuenta. Revocar corta al instante (I4).
 * 2. **El plan** de la organización del token trae integraciones (Pro o más).
 *    `planDe` devuelve FREE si esa persona ya no está dentro, así que esto
 *    cubre también a quien sacaron de la organización.
 * 3. **El interruptor** de la organización (`mcpAllowed`).
 *
 * Ninguna se cachea entre peticiones: son dos o tres mensajes en memoria en el
 * monolito, y cachearlas abre exactamente la ventana que I4 cierra.
 */
@Injectable()
export class McpAccessService {
  /** Llamadas recientes por token, para M9. Ver `limitar`. */
  private readonly llamadas = new Map<string, number[]>();

  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    private readonly quota: QuotaService,
    private readonly oauth: KylooOAuthService,
  ) {}

  /**
   * Abre la sesión de una petición a partir de la cabecera `Authorization`.
   *
   * ⚠️ El token en claro no se registra nunca (I3): ni aquí ni en el mensaje de
   * error. La cabecera ya la oculta el registro de peticiones
   * (`pino.config.ts`).
   */
  async abrir(authorization: string | undefined): Promise<McpSession> {
    const [tipo, token] = authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new McpAccessError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        `Falta el token. Conecta con tu cuenta de Kyloo (OAuth) o crea un token en Integraciones y mándalo como «Authorization: Bearer ${PAT_PREFIX}…».`,
      );
    }
    if (!token.startsWith(PAT_PREFIX)) return this.abrirConOAuth(token);

    const sesion = await firstValueFrom(
      this.credentialsClient.send<ExchangedPersonalToken>({ cmd: 'pat_exchange' }, { token }),
    ).catch(() => null);
    if (!sesion) {
      throw new McpAccessError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'El token no vale: está revocado, caducado o no existe.',
      );
    }

    await this.exigirOrganizacionUsable(sesion.userId, sesion.organizationId);
    return sesion;
  }

  /**
   * Una conexión por OAuth (Kyloo Accounts).
   *
   * El token solo identifica **la conexión**: la organización con la que se
   * trabaja se lee de ella en cada llamada, de modo que cambiarla —o revocar la
   * conexión— surte efecto en la siguiente petición y no cuando el token caduque.
   */
  private async abrirConOAuth(token: string): Promise<McpSession> {
    const verificado = await this.oauth.verificar(token);

    const conexion = await firstValueFrom(
      this.credentialsClient.send<ExchangedMcpConnection>(
        { cmd: 'mcp_conn_session' },
        { connectionId: verificado.connectionId, sub: verificado.sub },
      ),
    ).catch(() => null);
    if (!conexion) {
      throw new McpAccessError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Esta conexión fue revocada o ya no existe. Vuelve a conectar desde tu cliente.',
      );
    }

    const scopes = patScopesFromOAuth(verificado.scope);
    if (scopes.length === 0) {
      throw new McpAccessError(
        HttpStatus.FORBIDDEN,
        'INSUFFICIENT_SCOPE',
        'El token no concede ningún permiso sobre Praxis.',
      );
    }

    const sesion: McpSession = {
      /* La clave del límite de M9 y del registro: la conexión hace de "token". */
      personalTokenId: conexion.connectionId,
      userId: conexion.userId,
      organizationId: conexion.activeOrgId,
      scopes,
      accessToken: conexion.accessToken,
      connection: {
        id: conexion.connectionId,
        clientName: conexion.clientName,
        allowedOrgIds: conexion.allowedOrgIds,
      },
    };

    /* A diferencia de un token personal, aquí un fallo de la organización activa
       no cierra la puerta: el agente tiene que poder pedir las suyas y cambiar. */
    try {
      await this.exigirOrganizacionUsable(conexion.userId, conexion.activeOrgId);
    } catch (error) {
      if (!(error instanceof McpAccessError)) throw error;
      sesion.bloqueo = error;
    }
    return sesion;
  }

  /**
   * Las tres comprobaciones de siempre sobre una organización: que sigas
   * dentro, que su plan traiga integraciones y que su interruptor esté
   * encendido. Se usa en cada petición y al cambiar de organización.
   */
  async exigirOrganizacionUsable(userId: string, organizationId: string): Promise<void> {
    /* El plan primero: si no trae integraciones, ese es el motivo que hay que
       dar, aunque el interruptor también esté apagado. Lanza un 402 con
       `puedeAmpliar` (QuotaService). */
    try {
      await this.quota.exigirIntegraciones(userId, organizationId);
    } catch (error) {
      if (error instanceof HttpException) {
        const cuerpo = error.getResponse() as { code: string; message: string; details?: unknown };
        throw new McpAccessError(error.getStatus(), cuerpo.code, cuerpo.message, cuerpo.details);
      }
      throw error;
    }

    const acceso = await firstValueFrom(
      this.billingClient.send<{ miembro: boolean; mcpAllowed: boolean }>(
        { cmd: 'billing_org_mcp_access' },
        { organizationId, userId },
      ),
    ).catch(() => null);

    if (!acceso?.miembro) {
      throw new McpAccessError(
        HttpStatus.FORBIDDEN,
        'NOT_IN_ORG',
        'Ya no perteneces a la organización de este token.',
      );
    }
    if (!acceso.mcpAllowed) {
      throw new McpAccessError(
        HttpStatus.FORBIDDEN,
        'MCP_DISABLED',
        'Esta organización no permite conectar agentes por MCP. Lo decide quien la administra, en Integraciones.',
      );
    }
  }

  /**
   * M9: como mucho `PAT_CALLS_PER_MINUTE` llamadas a herramientas por minuto
   * y token, en una ventana deslizante.
   *
   * ⚠️ **En memoria, y es suficiente aquí**: en producción el backend es un
   * proceso (PLAN-MONOLITO). Si algún día hay dos réplicas, cada una contará
   * la suya y el tope real será el doble — no es un agujero, es un tope menos
   * fino. El límite por cuenta del gateway (`IdentityThrottlerGuard`) sigue
   * aplicando a cada petición que hace la herramienta.
   */
  limitar(personalTokenId: string): void {
    const ahora = Date.now();
    const recientes = (this.llamadas.get(personalTokenId) ?? []).filter((t) => ahora - t < 60_000);

    if (recientes.length >= PAT_CALLS_PER_MINUTE) {
      this.llamadas.set(personalTokenId, recientes);
      throw new McpAccessError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        `Demasiadas llamadas: el tope es ${PAT_CALLS_PER_MINUTE} por minuto por token. Espera un poco o usa las herramientas por lotes.`,
      );
    }

    recientes.push(ahora);
    this.llamadas.set(personalTokenId, recientes);

    /* Que el mapa no crezca sin fin con tokens que ya no llaman. */
    if (this.llamadas.size > 5_000) {
      for (const [clave, marcas] of this.llamadas) {
        if (marcas.every((t) => ahora - t >= 60_000)) this.llamadas.delete(clave);
      }
    }
  }

  /**
   * 🔴 I2: que el recurso de una herramienta sea de la organización del token.
   *
   * Se resuelve el proyecto con los **mismos mensajes que usa
   * `ProjectPermissionGuard`** (tarea → tablero → proyecto) y se compara su
   * organización. Sin esto, un token de la organización A abriría los
   * proyectos de la B en los que esa persona también está: el guard de
   * proyecto mira permisos, no organizaciones.
   *
   * Devuelve el id del proyecto, ya traducido si llegó un slug.
   */
  async exigirEnLaOrganizacion(
    session: McpSession,
    anchor: Exclude<ToolAnchor, 'organization'>,
    valor: unknown,
  ): Promise<string> {
    if (typeof valor !== 'string' || valor.length === 0) {
      throw new McpAccessError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', `Falta ${anchor}.`);
    }

    const projectId = ID_SEGURO.test(valor) ? await this.proyectoDe(anchor, valor) : null;
    const organizationId = projectId ? await this.quota.organizacionDelProyecto(projectId) : null;
    if (!projectId || !organizationId) {
      throw new McpAccessError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `No existe ese ${anchor}.`);
    }

    if (organizationId !== session.organizationId) {
      /* Igual que un recurso que no existe para quien no lo puede ver: no se
         dice de qué organización es. */
      throw new McpAccessError(
        HttpStatus.FORBIDDEN,
        'OUT_OF_SCOPE',
        'Ese recurso no es de la organización de este token. Cada token vale para una sola organización.',
      );
    }
    return projectId;
  }

  private async proyectoDe(anchor: string, valor: string): Promise<string | null> {
    const enviar = <T>(cliente: ClientProxy, cmd: string, datos: unknown) =>
      firstValueFrom(cliente.send<T>({ cmd }, datos)).catch(() => null);

    switch (anchor) {
      case 'projectId': {
        /* Un id o un slug: primero como id, y si no hay proyecto, como slug. */
        if (await this.quota.organizacionDelProyecto(valor)) return valor;
        const res = await enviar<{ projectId?: string }>(
          this.projectsClient,
          'project_resolve_slug',
          {
            slug: valor,
          },
        );
        return res?.projectId ?? null;
      }
      case 'workspaceId':
      case 'boardId': {
        const res = await enviar<{ projectId?: string }>(
          this.projectsClient,
          'project_resolve_resource',
          { [anchor]: valor },
        );
        return res?.projectId ?? null;
      }
      case 'taskId': {
        const tarea = await enviar<{ boardId?: string }>(this.tasksClient, 'task_find_one', {
          id: valor,
        });
        if (!tarea?.boardId) return null;
        const res = await enviar<{ projectId?: string }>(
          this.projectsClient,
          'project_resolve_resource',
          { boardId: tarea.boardId },
        );
        return res?.projectId ?? null;
      }
      default:
        return null;
    }
  }

  /** Las columnas de un tablero, para poner el `status` de una tarea. */
  async columnasDe(boardId: string): Promise<{ id: string; name: string }[]> {
    const tablero = await firstValueFrom(
      this.projectsClient.send<{ columns?: { id: string; name: string }[] } | null>(
        { cmd: 'board_find_one' },
        { id: boardId },
      ),
    ).catch(() => null);
    return tablero?.columns ?? [];
  }

  /** El tablero de una tarea, para moverla. */
  async tableroDeLaTarea(taskId: string): Promise<string | null> {
    const tarea = await firstValueFrom(
      this.tasksClient.send<{ boardId?: string } | null>({ cmd: 'task_find_one' }, { id: taskId }),
    ).catch(() => null);
    return tarea?.boardId ?? null;
  }
}
