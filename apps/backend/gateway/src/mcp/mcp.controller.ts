import { Controller, Delete, Get, Headers, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { KylooOAuthService } from './kyloo-oauth.service';
import { McpAccessError, McpAccessService } from './mcp-access.service';
import { type JsonRpcMessage, type JsonRpcResponse, McpService } from './mcp.service';

/**
 * La puerta del MCP: `POST /api/mcp` (M1 de docs/PLAN-MCP.md).
 *
 * ## Fuera del sobre y del filtro global, a propósito
 *
 * JSON-RPC tiene su propia forma de respuesta, y el sobre `{ success, data }`
 * del interceptor global la rompería (trampa 12 de CLAUDE.md, con otra cara).
 * Por eso se responde con `@Res()` y se capturan aquí todos los errores.
 *
 * ## Sin el limitador por cuenta en la entrada
 *
 * `IdentityThrottlerGuard` identifica por el JWT, y aquí llega un token
 * personal: caería a la IP, que en Railway es la del servidor de `web` — un
 * solo cubo para todos los agentes de todo el mundo. El límite de esta puerta
 * es el de M9, por token (`McpAccessService.limitar`), y el de cuenta sigue
 * aplicando a cada llamada que hacen las herramientas.
 *
 * ⚠️ Desde fuera se entra por `web` (`/api/mcp` de la app de Next), porque el
 * gateway no tiene dominio público (M15).
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('mcp')
export class McpController {
  constructor(
    private readonly access: McpAccessService,
    private readonly mcp: McpService,
    private readonly oauth: KylooOAuthService,
  ) {}

  @Post()
  async post(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('authorization') authorization?: string,
  ) {
    let session: Awaited<ReturnType<McpAccessService['abrir']>>;
    try {
      session = await this.access.abrir(authorization);
    } catch (error) {
      return this.rechazar(res, error);
    }

    const cuerpo = req.body as JsonRpcMessage | JsonRpcMessage[] | undefined;
    if (!cuerpo || typeof cuerpo !== 'object') {
      return res.status(HttpStatus.BAD_REQUEST).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'El cuerpo tiene que ser JSON-RPC en JSON.' },
      });
    }

    const mensajes = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    const respuestas: JsonRpcResponse[] = [];
    for (const mensaje of mensajes) {
      const respuesta = await this.mcp.handle(session, mensaje);
      if (respuesta) respuestas.push(respuesta);
    }

    /* Solo notificaciones: 202 sin cuerpo, como pide el transporte. */
    if (respuestas.length === 0) return res.status(HttpStatus.ACCEPTED).end();
    return res.status(HttpStatus.OK).json(Array.isArray(cuerpo) ? respuestas : respuestas[0]);
  }

  /** Sin flujo de servidor ni sesiones: el transporte permite responder 405. */
  @Get()
  get(@Res() res: Response) {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).set('allow', 'POST').end();
  }

  @Delete()
  delete(@Res() res: Response) {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).set('allow', 'POST').end();
  }

  /**
   * Un rechazo antes de leer el mensaje: token, plan, organización o límite.
   * Con su estado HTTP y el motivo en claro (M8). El 401 lleva
   * `WWW-Authenticate`, que es lo que mira un cliente para pedir credenciales.
   */
  private rechazar(res: Response, error: unknown) {
    const e =
      error instanceof McpAccessError
        ? error
        : new McpAccessError(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL', 'Error interno.');
    if (e.getStatus() === HttpStatus.UNAUTHORIZED) {
      /* Con `resource_metadata` (RFC 9728) un cliente MCP sabe dónde descubrir
         el servidor de autorización y arranca el OAuth solo: es lo que hace que
         «Añadir conector» funcione sin que nadie pegue nada. */
      const metadatos = this.oauth.activo
        ? `, resource_metadata="${this.metadatosDelRecurso()}"`
        : '';
      res.set('www-authenticate', `Bearer realm="praxis", error="invalid_token"${metadatos}`);
    }
    return res.status(e.getStatus()).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: e.message, data: { code: e.code, details: e.details } },
    });
  }

  /** `https://host/.well-known/oauth-protected-resource/<ruta del MCP>` (RFC 9728 §3.1). */
  private metadatosDelRecurso(): string {
    const recurso = new URL(this.oauth.recurso);
    return `${recurso.origin}/.well-known/oauth-protected-resource${recurso.pathname}`;
  }
}
