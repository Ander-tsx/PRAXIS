import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  type GeminiClient,
  type GeminiContent,
  GeminiError,
  type GeminiPart,
  type GeminiReply,
  type UsoDeGemini,
} from './gemini.client';

/**
 * El otro modelo de PRAX: `gpt-oss-120b` por OpenRouter.
 *
 * ## Por qué existe
 *
 * En producción, con la clave de Gemini en el nivel gratuito, una pregunta real
 * —tres o cuatro llamadas seguidas por el bucle de consultas— agotaba la cuota
 * por minuto y PRAX contestaba «límite de uso». gpt-oss cuesta del orden de una
 * décima parte (≈ $0,04 por millón de entrada y $0,17 de salida, medido el
 * 2026-09-30), llama bien a las herramientas y tiene **otra cuota de otro
 * proveedor**: es la alternativa que se puede elegir en el compositor.
 *
 * ## Mismo contrato que `GeminiClient`, a propósito
 *
 * Recibe los mismos parámetros —en el formato de Gemini: partes,
 * `functionCall`/`functionResponse` y esquemas con tipos en mayúsculas— y
 * devuelve la misma `GeminiReply`, con `partes` también en formato Gemini. Así el
 * bucle de consultas, la validación de propuestas y el turno de recuperación no
 * saben con qué modelo hablan: la traducción vive entera aquí.
 *
 * ⚠️ **Solo texto.** Las imágenes y los PDF no se mandan: el turno que los trae
 * lo responde Gemini (lo decide `AssistantService`, y lo dice en el
 * pensamiento).
 *
 * ⚠️ **La clave es `PRAX_OPENROUTER_API_KEY`, no `OPENROUTER_API_KEY`.** Aquella
 * es la de Jev (el router de contexto): son usos distintos y pueden ser cuentas
 * distintas. Si falta esta, se usa aquella como respaldo.
 */

/** Un mensaje en el formato de OpenAI, que es el que habla OpenRouter. */
type MensajeOpenAI =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

interface TrozoOpenRouter {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { code?: number | string; message?: string };
}

/** Más que Gemini: gpt-oss razona antes de contestar y el razonamiento cuenta. */
const TIMEOUT_MS = 90_000;
const MAX_INTENTOS = 3;
/** El razonamiento gasta del mismo `max_tokens`: se le deja sitio aparte. */
const MARGEN_DE_RAZONAMIENTO = 2048;

/** Los tipos del esquema de Gemini (`OBJECT`, `STRING`…) en JSON Schema. */
export function esquemaJson(esquema: unknown): unknown {
  if (Array.isArray(esquema)) return esquema.map(esquemaJson);
  if (!esquema || typeof esquema !== 'object') return esquema;
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(esquema)) {
    /* `nullable` es de Gemini; en JSON Schema no significa nada. */
    if (clave === 'nullable') continue;
    if (clave === 'type' && typeof valor === 'string') salida.type = valor.toLowerCase();
    else if (clave === 'properties' && valor && typeof valor === 'object') {
      salida.properties = Object.fromEntries(
        Object.entries(valor).map(([nombre, sub]) => [nombre, esquemaJson(sub)]),
      );
    } else salida[clave] = esquemaJson(valor);
  }
  return salida;
}

/**
 * El turno en mensajes de OpenAI.
 *
 * Gemini no pone id a las llamadas a función; OpenAI sí, y cada respuesta tiene
 * que citar el suyo. Se inventan al traducir (`c<vuelta>_<n>`) y cada
 * `functionResponse` toma, por orden y nombre, el de la llamada que contesta:
 * el bucle siempre las devuelve en el mismo orden en que se pidieron.
 */
export function mensajesOpenAI(params: Parameters<GeminiClient['chat']>[0]): MensajeOpenAI[] {
  const mensajes: MensajeOpenAI[] = [{ role: 'system', content: params.system }];
  for (const turno of params.history) {
    mensajes.push(
      turno.role === 'model'
        ? { role: 'assistant', content: turno.text }
        : { role: 'user', content: turno.text },
    );
  }
  mensajes.push({ role: 'user', content: params.message });

  let pendientes: { id: string; name: string }[] = [];
  (params.extra ?? []).forEach((contenido: GeminiContent, vuelta) => {
    const texto = contenido.parts
      .map((parte) => parte.text ?? '')
      .join('')
      .trim();
    if (contenido.role === 'model') {
      const llamadas = contenido.parts.filter((parte) => parte.functionCall);
      pendientes = llamadas.map((parte, n) => ({
        id: `c${vuelta}_${n}`,
        name: parte.functionCall?.name ?? '',
      }));
      mensajes.push({
        role: 'assistant',
        content: texto || null,
        ...(llamadas.length > 0
          ? {
              tool_calls: llamadas.map((parte, n) => ({
                id: `c${vuelta}_${n}`,
                type: 'function' as const,
                function: {
                  name: parte.functionCall?.name ?? '',
                  arguments: JSON.stringify(parte.functionCall?.args ?? {}),
                },
              })),
            }
          : {}),
      });
      return;
    }
    for (const parte of contenido.parts) {
      if (parte.functionResponse) {
        const indice = pendientes.findIndex((p) => p.name === parte.functionResponse?.name);
        const id = indice >= 0 ? pendientes.splice(indice, 1)[0].id : `c${vuelta}_x`;
        mensajes.push({
          role: 'tool',
          tool_call_id: id,
          content: JSON.stringify(parte.functionResponse.response),
        });
      }
    }
    if (texto) mensajes.push({ role: 'user', content: texto });
  });
  return mensajes;
}

@Injectable()
export class OpenRouterClient {
  private readonly log = new Logger(OpenRouterClient.name);
  private readonly clave: string | undefined;
  private readonly modelo: string;
  private readonly esfuerzo: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.clave =
      config.get<string>('PRAX_OPENROUTER_API_KEY')?.trim() ||
      config.get<string>('OPENROUTER_API_KEY')?.trim() ||
      undefined;
    this.modelo = config.get<string>('PRAX_OPENROUTER_MODEL')?.trim() || 'openai/gpt-oss-120b';
    /* `low` por defecto: con `medium` tarda el doble en cada vuelta del bucle y
       las respuestas de PRAX no lo necesitan. */
    this.esfuerzo = config.get<string>('PRAX_OPENROUTER_REASONING')?.trim() || 'low';
    this.baseUrl = (
      config.get<string>('PRAX_OPENROUTER_BASE_URL')?.trim() || 'https://openrouter.ai/api/v1'
    ).replace(/\/$/, '');
  }

  /** Si hay clave. Sin ella, el turno lo responde Gemini. */
  get disponible(): boolean {
    return Boolean(this.clave);
  }

  get nombreDelModelo(): string {
    return this.modelo;
  }

  async chat(
    params: Parameters<GeminiClient['chat']>[0],
    alTexto?: (delta: string) => void,
    alEsperar?: (segundos: number) => void,
  ): Promise<GeminiReply> {
    let emitido = false;
    const alTrozo = alTexto
      ? (delta: string) => {
          emitido = true;
          alTexto(delta);
        }
      : undefined;

    let ultimo: GeminiError | null = null;
    for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
      try {
        return await this.intentar(params, alTrozo);
      } catch (error) {
        const fallo =
          error instanceof GeminiError
            ? error
            : new GeminiError('El proveedor de IA no ha podido responder. Vuelve a intentarlo.');
        ultimo = fallo;
        this.log.warn(
          `openrouter_intento_fallido modelo=${this.modelo} intento=${intento}/${MAX_INTENTOS} ` +
            `status=${fallo.status ?? 'red'} ${fallo.message}`,
        );
        /* Con texto ya en pantalla no se repite: se escribiría otro encima. */
        if (!fallo.reintentable || emitido || intento >= MAX_INTENTOS) throw fallo;
        const espera = fallo.limite?.esperaMs ?? 500 * 2 ** (intento - 1);
        if (fallo.status === 429) alEsperar?.(Math.max(1, Math.ceil(espera / 1000)));
        await new Promise((resolve) => setTimeout(resolve, Math.min(espera, 20_000)));
      }
    }
    throw ultimo ?? new GeminiError('El proveedor de IA no ha podido responder.');
  }

  private async intentar(
    params: Parameters<GeminiClient['chat']>[0],
    alTexto?: (delta: string) => void,
  ): Promise<GeminiReply> {
    const cuerpo: Record<string, unknown> = {
      model: this.modelo,
      messages: mensajesOpenAI(params),
      stream: true,
      usage: { include: true },
      temperature: 0.7,
      max_tokens: (params.maxOutputTokens ?? 2048) + MARGEN_DE_RAZONAMIENTO,
      reasoning: { effort: this.esfuerzo, exclude: true },
      /* Solo proveedores que admitan todo lo que se pide: sin esto, OpenRouter
         puede mandar el turno a uno que ignora las herramientas. */
      provider: { require_parameters: true },
    };
    if (params.tools.length > 0) {
      cuerpo.tools = params.tools.map((herramienta) => ({
        type: 'function',
        function: {
          name: herramienta.name,
          description: herramienta.description,
          parameters: esquemaJson(herramienta.parameters ?? { type: 'OBJECT', properties: {} }),
        },
      }));
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.clave}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://usepraxis.space',
          'X-Title': 'Praxis',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.log.warn(`OpenRouter no respondió: ${(error as Error).message}`);
      throw new GeminiError('El proveedor de IA no responde ahora mismo.', undefined, true);
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      this.log.warn(
        `OpenRouter ${respuesta.status}: ${detalle.replace(/\s+/g, ' ').slice(0, 400)}`,
      );
      throw this.fallo(respuesta.status, respuesta.headers.get('retry-after'));
    }

    return this.leer(respuesta, alTexto);
  }

  private fallo(status: number, retryAfter: string | null): GeminiError {
    if (status === 401 || status === 403) {
      return new GeminiError(
        'El modelo alternativo no está bien configurado en esta instalación. Avisa a quien la administra.',
        status,
      );
    }
    if (status === 402) {
      return new GeminiError(
        'El modelo alternativo se ha quedado sin saldo. Elige Gemini o avisa a quien administra Praxis.',
        status,
      );
    }
    if (status === 429) {
      const segundos = Number(retryAfter);
      return new GeminiError(
        'El proveedor de IA está saturado ahora mismo. Prueba en un minuto.',
        status,
        true,
        {
          cuota: null,
          esperaMs: Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : null,
          porDia: false,
        },
      );
    }
    return new GeminiError(
      'El proveedor de IA no ha podido responder. Vuelve a intentarlo.',
      status,
      status >= 500,
    );
  }

  /** Lee el flujo SSE: el texto se entrega según llega; las llamadas, al final. */
  private async leer(respuesta: Response, alTexto?: (delta: string) => void): Promise<GeminiReply> {
    const lector = respuesta.body?.getReader();
    if (!lector)
      throw new GeminiError('El proveedor de IA no ha respondido nada.', undefined, true);

    const decodificador = new TextDecoder();
    let pendiente = '';
    let texto = '';
    const llamadas = new Map<number, { name: string; args: string }>();
    let uso: UsoDeGemini | undefined;
    let fin: string | null = null;

    const atender = (datos: string) => {
      if (datos === '[DONE]') return;
      let trozo: TrozoOpenRouter;
      try {
        trozo = JSON.parse(datos) as TrozoOpenRouter;
      } catch {
        return;
      }
      if (trozo.error) {
        const status = Number(trozo.error.code);
        throw this.fallo(Number.isFinite(status) ? status : 502, null);
      }
      const eleccion = trozo.choices?.[0];
      const delta = eleccion?.delta;
      if (delta?.content) {
        texto += delta.content;
        alTexto?.(delta.content);
      }
      for (const llamada of delta?.tool_calls ?? []) {
        const actual = llamadas.get(llamada.index) ?? { name: '', args: '' };
        if (llamada.function?.name) actual.name += llamada.function.name;
        if (llamada.function?.arguments) actual.args += llamada.function.arguments;
        llamadas.set(llamada.index, actual);
      }
      if (eleccion?.finish_reason) fin = eleccion.finish_reason;
      if (trozo.usage) {
        const razonamiento = trozo.usage.completion_tokens_details?.reasoning_tokens ?? 0;
        uso = {
          entrada: trozo.usage.prompt_tokens ?? 0,
          salida: Math.max(0, (trozo.usage.completion_tokens ?? 0) - razonamiento),
          razonamiento,
          cache: trozo.usage.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }
    };

    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += decodificador.decode(value, { stream: true });
        let corte = pendiente.indexOf('\n');
        while (corte !== -1) {
          const linea = pendiente.slice(0, corte).trim();
          pendiente = pendiente.slice(corte + 1);
          /* Los comentarios (`: OPENROUTER PROCESSING`) mantienen viva la conexión. */
          if (linea.startsWith('data:')) atender(linea.slice(5).trim());
          corte = pendiente.indexOf('\n');
        }
      }
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      this.log.warn(`openrouter_stream_cortado ${(error as Error).message}`);
      throw new GeminiError(
        'La respuesta del asistente se cortó. Vuelve a intentarlo.',
        undefined,
        true,
      );
    }

    if (uso) {
      this.log.log(
        `openrouter_uso modelo=${this.modelo} entrada=${uso.entrada} salida=${uso.salida} ` +
          `razonamiento=${uso.razonamiento} cache=${uso.cache} fin=${fin}`,
      );
    }

    const calls = [...llamadas.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, llamada]) => llamada.name)
      .map(([, llamada]) => {
        let args: Record<string, unknown> = {};
        try {
          args = llamada.args ? (JSON.parse(llamada.args) as Record<string, unknown>) : {};
        } catch {
          /* JSON roto: sale sin argumentos y la validación la descarta. */
          this.log.warn(`openrouter_args_invalidos herramienta=${llamada.name}`);
        }
        return { name: llamada.name, args };
      });

    const partes: GeminiPart[] = [
      ...(texto ? [{ text: texto }] : []),
      ...calls.map((call) => ({ functionCall: call })),
    ];
    return { text: texto.trim(), calls, partes, ...(uso ? { uso } : {}) };
  }
}
