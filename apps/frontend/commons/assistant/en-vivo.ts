import type { AssistantChatResult } from '../api/assistant';
import { ApiError, type ApiErrorCode } from '../api/envelope';
import { detallesDeCuota } from '../billing/planes';
import type { RespuestaChat } from './actions';
import { conversationIdDelError, cuotaDelError, describe } from './errores';

/**
 * Un turno de PRAX contado mientras ocurre (D7 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Por qué no es una Server Action
 *
 * La Server Action esperaba la respuesta entera y la devolvía de golpe, con el
 * plazo común de 15 s (el «PRAX no responde» de §1.3). Esto habla con el gateway
 * a través del proxy autenticado de siempre, que ya transmite los flujos sin
 * cortarlos (`commons/auth/proxy.ts`), y va pintando lo que llega: los pasos de
 * las consultas y el texto según lo escribe Gemini.
 *
 * ## Qué devuelve
 *
 * **La misma `RespuestaChat` que la Server Action**, con los mismos mensajes de
 * error, para que la pantalla trate el final igual que antes: la cuota, la
 * conversación abierta aunque falle, el reintento y `AmpliarPlan`.
 */
export interface OyentesDelTurno {
  alEmpezar?: (conversationId: string) => void;
  alPaso?: (texto: string) => void;
  alTexto?: (delta: string) => void;
}

const FALLO = 'El asistente no ha podido responder. Inténtalo otra vez.';

function sinRespuesta(error: unknown): RespuestaChat {
  return {
    reply: null,
    proposals: [],
    conversationId: conversationIdDelError(error),
    cuota: cuotaDelError(error),
    topeAgotado: detallesDeCuota(error),
    error: describe(error, FALLO),
  };
}

export async function preguntarEnVivo(
  opciones: {
    gatewayPath: string;
    projectId: string | null;
    message: string;
    conversationId?: string;
    attachmentIds?: string[];
    organizationId?: string | null;
  },
  oyentes: OyentesDelTurno = {},
): Promise<RespuestaChat> {
  const ruta = opciones.projectId
    ? `/projects/${opciones.projectId}/assistant/chat/stream`
    : '/me/assistant/chat/stream';

  let respuesta: Response;
  try {
    respuesta = await fetch(`${opciones.gatewayPath}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        message: opciones.message,
        ...(opciones.conversationId ? { conversationId: opciones.conversationId } : {}),
        /* Solo si los hay: un campo de más es un 400 (CLAUDE.md). */
        ...(opciones.attachmentIds?.length ? { attachmentIds: opciones.attachmentIds } : {}),
        ...(opciones.organizationId ? { organizationId: opciones.organizationId } : {}),
      }),
    });
  } catch {
    return {
      ...sinRespuesta(null),
      error: 'Se ha perdido la conexión con el servidor. Inténtalo otra vez.',
    };
  }

  /* Lo que falla antes de abrir el flujo —permisos, organización, sesión— llega
     como el JSON de error de siempre. */
  if (!respuesta.ok || !(respuesta.headers.get('content-type') ?? '').includes('event-stream')) {
    const sobre = (await respuesta.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    return sinRespuesta(
      new ApiError(
        respuesta.status,
        (sobre?.error?.code ?? 'ERROR') as ApiErrorCode,
        sobre?.error?.message ?? FALLO,
        sobre?.error?.details,
      ),
    );
  }

  const lector = respuesta.body?.getReader();
  if (!lector) return sinRespuesta(null);
  const decodificador = new TextDecoder();
  let pendiente = '';
  let conversationId: string | null = null;
  let final: AssistantChatResult | null = null;
  let fallo: RespuestaChat | null = null;

  const atender = (tipo: string, datos: string) => {
    const evento = JSON.parse(datos) as Record<string, unknown>;
    if (tipo === 'inicio') {
      conversationId = String(evento.conversationId);
      oyentes.alEmpezar?.(conversationId);
    } else if (tipo === 'paso') {
      oyentes.alPaso?.(String(evento.texto ?? ''));
    } else if (tipo === 'texto') {
      oyentes.alTexto?.(String(evento.delta ?? ''));
    } else if (tipo === 'fin') {
      final = evento.resultado as AssistantChatResult;
    } else if (tipo === 'error') {
      const e = evento as {
        statusCode?: number;
        code?: string;
        message?: string;
        details?: unknown;
      };
      fallo = sinRespuesta(
        new ApiError(
          e.statusCode ?? 502,
          (e.code ?? 'ERROR') as ApiErrorCode,
          e.message ?? FALLO,
          e.details,
        ),
      );
    }
  };

  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      pendiente += decodificador.decode(value, { stream: true });
      /* Un evento SSE termina en línea en blanco. Los comentarios (el latido)
         empiezan por «:» y no llevan nada que atender. */
      let corte = pendiente.indexOf('\n\n');
      while (corte !== -1) {
        const bloque = pendiente.slice(0, corte);
        pendiente = pendiente.slice(corte + 2);
        let tipo = 'message';
        const datos: string[] = [];
        for (const linea of bloque.split('\n')) {
          if (linea.startsWith('event:')) tipo = linea.slice(6).trim();
          else if (linea.startsWith('data:')) datos.push(linea.slice(5).trimStart());
        }
        if (datos.length > 0) atender(tipo, datos.join('\n'));
        corte = pendiente.indexOf('\n\n');
      }
    }
  } catch {
    return {
      ...sinRespuesta(null),
      conversationId,
      error: 'Se ha perdido la conexión a mitad de la respuesta. Inténtalo otra vez.',
    };
  }

  if (fallo)
    return {
      ...(fallo as RespuestaChat),
      conversationId: (fallo as RespuestaChat).conversationId ?? conversationId,
    };
  const resultado = final as AssistantChatResult | null;
  if (!resultado?.reply) {
    return {
      ...sinRespuesta(null),
      conversationId: resultado?.conversationId ?? conversationId,
      cuota: resultado?.cuota ?? null,
      error: 'El asistente no ha respondido nada.',
    };
  }
  return {
    reply: resultado.reply,
    proposals: resultado.proposals ?? [],
    cuota: resultado.cuota ?? null,
    topeAgotado: null,
    conversationId: resultado.conversationId ?? conversationId,
    error: null,
    ...(resultado.uso ? { uso: resultado.uso } : {}),
  };
}
