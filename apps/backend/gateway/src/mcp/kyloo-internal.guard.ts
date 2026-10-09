import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** Cuánto puede diferir el reloj de Accounts del nuestro. Más allá, una firma vieja no vale. */
const TOLERANCIA_MS = 60_000;

/** La cabecera con la hora (ms desde 1970) y la que lleva la firma. */
export const CABECERA_HORA = 'x-kyloo-timestamp';
export const CABECERA_FIRMA = 'x-kyloo-signature';

/**
 * Autentica las llamadas de servidor a servidor de Kyloo Accounts (HMAC-SHA256).
 *
 * Accounts no tiene sesión de Praxis ni la puede tener —son dominios distintos—,
 * así que lo que pide (las organizaciones de una persona, guardar una conexión)
 * se firma con un secreto que solo conocen los dos:
 *
 *   firma = HMAC(secreto, `${hora}.${método}.${ruta}.${cuerpo crudo}`)
 *
 * - **El cuerpo crudo**, no el parseado: la firma cubre lo que se mandó, byte a
 *   byte.
 * - **La ruta y el método** van dentro: una firma de `organizations` no sirve
 *   para `connections`.
 * - **La hora**, con tolerancia de un minuto: una firma capturada no se puede
 *   reproducir mañana.
 * - Comparación en tiempo constante.
 *
 * Sin `KYLOO_INTERNAL_SECRET` configurado, **503** y no "abierto": una puerta
 * sin cerradura no puede ser el valor por omisión.
 */
@Injectable()
export class KylooInternalGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secreto = this.config.get<string>('KYLOO_INTERNAL_SECRET');
    if (!secreto) throw new ServiceUnavailableException('La integración con Kyloo no está activa.');

    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const hora = String(req.headers[CABECERA_HORA] ?? '');
    const firma = String(req.headers[CABECERA_FIRMA] ?? '');
    const ms = Number(hora);
    if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > TOLERANCIA_MS || !firma) {
      throw new UnauthorizedException();
    }

    const ruta = req.originalUrl.split('?')[0] ?? '';
    const esperada = createHmac('sha256', secreto)
      .update(`${hora}.${req.method}.${ruta}.`)
      .update(req.rawBody ?? Buffer.alloc(0))
      .digest();
    let recibida: Buffer;
    try {
      recibida = Buffer.from(firma, 'hex');
    } catch {
      throw new UnauthorizedException();
    }
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
