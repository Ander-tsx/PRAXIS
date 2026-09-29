import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Escribe un turno de PRAX como Server-Sent Events (D7 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Por qué a mano y no con `@Sse()`
 *
 * `@Sse()` es para `GET`, y el turno es un `POST` con cuerpo. Y, sobre todo,
 * **no puede pasar por el interceptor del sobre** (trampa 12 de CLAUDE.md): el
 * interceptor mapea cada valor emitido y le quita el `type` de la raíz, así que
 * el navegador no vería ningún evento con nombre. Escribiendo en la respuesta
 * directamente, el interceptor no tiene nada que envolver.
 *
 * ## Qué llega al navegador
 *
 * Un evento por cada uno del turno, con su `tipo` como nombre (`inicio`, `paso`,
 * `texto`, `fin`), y si algo falla a medias, un evento `error` con la forma de
 * los errores de siempre: `{ statusCode, code, message, details }`. Lo que falla
 * **antes** de empezar (permisos, organización) no llega aquí: sale como un JSON
 * normal por el filtro de excepciones, porque todavía no se ha abierto el flujo.
 *
 * ## El latido
 *
 * Un comentario cada 15 s mientras el modelo piensa. Sin él, un proxy que corta
 * conexiones en silencio podría cerrar un turno largo a medias.
 */
const LATIDO_MS = 15_000;

export function transmitirTurno(
  res: Response,
  flujo: Observable<{ tipo: string }>,
  log: Logger,
): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let cerrado = false;
  const latido = setInterval(() => {
    if (!cerrado) res.write(': latido\n\n');
  }, LATIDO_MS);

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearInterval(latido);
    res.end();
  };

  const suscripcion = flujo.subscribe({
    next: (evento) => {
      if (!cerrado) res.write(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`);
    },
    error: (error: unknown) => {
      const cuerpo = errorComoCuerpo(error);
      if (cuerpo.statusCode >= 500) {
        log.warn(`prax_turno_en_vivo_fallido ${cuerpo.statusCode} ${cuerpo.message}`);
      }
      if (!cerrado) res.write(`event: error\ndata: ${JSON.stringify(cuerpo)}\n\n`);
      cerrar();
    },
    complete: cerrar,
  });

  /* Si el navegador se va, se deja de escuchar el turno. El turno en sí termina
     igual en el servicio —ya está pagado y se guarda—, pero nadie escribe ya en
     una conexión muerta. */
  res.on('close', () => {
    suscripcion.unsubscribe();
    cerrar();
  });
}

/** Un error de microservicio con la forma de los errores de la API. */
function errorComoCuerpo(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
} {
  const e = (error ?? {}) as {
    statusCode?: number;
    status?: number;
    code?: string;
    message?: string;
    details?: unknown;
  };
  const statusCode = typeof e.statusCode === 'number' ? e.statusCode : (e.status ?? 502);
  return {
    statusCode,
    code:
      e.code ??
      (statusCode === 402 ? 'QUOTA_EXCEEDED' : statusCode >= 500 ? 'BAD_GATEWAY' : 'ERROR'),
    message: e.message ?? 'El asistente no ha podido responder. Vuelve a intentarlo.',
    ...(e.details !== undefined ? { details: e.details } : {}),
  };
}
