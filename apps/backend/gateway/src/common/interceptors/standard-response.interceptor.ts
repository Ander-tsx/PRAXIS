import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ErrorPayload {
  statusCode: number;
  message: string;
  error?: unknown;
  details?: unknown;
}

interface StandardEnvelope {
  success: boolean;
  data?: unknown;
  meta?: unknown;
  error?: unknown;
}

@Injectable()
export class StandardResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    /**
     * ⚠️ **Los flujos SSE salen sin envolver, y no es una excepción cosmética:
     * envolverlos rompía el nombre del evento.**
     *
     * Un `@Sse()` no emite una respuesta, emite muchas, y cada una es un
     * `MessageEvent` cuyo `type` Nest convierte en la línea `event:` del
     * protocolo. Este interceptor mapea **cada valor emitido**, así que
     * `{ type: 'aviso', data }` se convertía en
     * `{ success: true, data: { type: 'aviso', data }, meta: {} }`: un objeto
     * que ya no tiene `type` en la raíz.
     *
     * Sin `type`, Nest no escribe la línea `event:`, el navegador lo entrega
     * como evento genérico `message`, y el `addEventListener('aviso', …)` de
     * `LiveNotices` **no se dispara nunca**. Los avisos en vivo llegaban hasta
     * el navegador y morían ahí: sin tarjeta y sin sonido, sin ningún error de
     * por medio ni en el servidor ni en la consola.
     *
     * Se detecta por la marca que pone el propio decorador en el handler. No se
     * puede usar `Reflector` porque este interceptor se instancia con `new` en
     * `main.ts` y no pasa por el inyector.
     */
    if (Reflect.getMetadata(SSE_METADATA, context.getHandler())) {
      return next.handle();
    }

    return next.handle().pipe(map((response) => this.normalizeResponse(response)));
  }

  private normalizeResponse(response: unknown): unknown {
    if (response === undefined || response === null) {
      return { success: true, data: null, meta: {} };
    }

    if (this.isStandardEnvelope(response)) {
      return response;
    }

    if (this.isErrorPayload(response)) {
      throw new HttpException(response.message, response.statusCode);
    }

    return {
      success: true,
      data: response,
      meta: {},
    };
  }

  private isStandardEnvelope(payload: unknown): payload is StandardEnvelope {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return 'success' in payload && ('data' in payload || 'error' in payload || 'meta' in payload);
  }

  private isErrorPayload(payload: unknown): payload is ErrorPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return (
      'statusCode' in payload &&
      'message' in payload &&
      typeof (payload as ErrorPayload).statusCode === 'number'
    );
  }
}
