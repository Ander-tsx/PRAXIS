import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { FunctionDeclaration } from './tools';

/**
 * Cliente de Gemini, a pelo sobre `fetch`.
 *
 * **Sin SDK a propósito.** Se usa un endpoint (`:generateContent`) y se leen
 * tres campos de la respuesta; el SDK oficial arrastra su propia cadena de
 * dependencias, su ciclo de versiones y su forma de fallar, a cambio de
 * ahorrarnos treinta líneas. `fetch` es global en Node 20, que es el mínimo del
 * repo.
 *
 * ⚠️ **Este es el único sitio del sistema donde vive la clave.** Ni el gateway
 * ni el frontend la ven. Eso, además de lo obvio, es lo que mantiene la llamada
 * lenta a un tercero fuera del camino por el que pasa todo lo demás.
 */

/** Un turno tal y como lo entiende la API. */
interface GeminiContent {
  role: 'user' | 'model';
  parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[];
}

export interface GeminiReply {
  text: string;
  calls: { name: string; args: Record<string, unknown> }[];
}

/**
 * Un fallo del lado de Gemini, distinguible de cualquier otro.
 *
 * Existe para una sola cosa, y es importante: **si Gemini falla no se consume
 * cuota**. Cobrarle a alguien por un error que no es suyo es la clase de
 * detalle que hace que la gente deje de fiarse del contador.
 */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

/** Más de esto y la espera deja de parecer una espera. */
const TIMEOUT_MS = 45_000;

@Injectable()
export class GeminiClient {
  private readonly log = new Logger(GeminiClient.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-flash-latest';
  }

  /**
   * Un turno de conversación.
   *
   * `temperature` baja a propósito: aquí se explican números y se rellenan ids
   * de columnas y etiquetas. La creatividad no aporta nada y sí produce
   * variaciones donde no se quieren.
   */
  async chat(params: {
    system: string;
    history: { role: string; text: string }[];
    message: string;
    tools: FunctionDeclaration[];
  }): Promise<GeminiReply> {
    const contents: GeminiContent[] = [
      ...params.history.map((turno) => ({
        role: turno.role === 'model' ? ('model' as const) : ('user' as const),
        parts: [{ text: turno.text }],
      })),
      { role: 'user', parts: [{ text: params.message }] },
    ];

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: params.system }] },
      contents,
      generationConfig: { temperature: 0.2 },
    };

    /* Un `tools: [{ functionDeclarations: [] }]` vacío es un error de la API, no
       un «sin herramientas». Con permisos de solo lectura la clave no va. */
    if (params.tools.length > 0) {
      body.tools = [{ functionDeclarations: params.tools }];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      /* Se registra el motivo real —red caída, timeout— y hacia fuera va un
         mensaje que se pueda leer: el usuario no puede hacer nada con un
         `ETIMEDOUT`, pero sí con «vuelve a intentarlo». */
      this.log.warn(`Gemini no respondio: ${(error as Error).message}`);
      throw new GeminiError('El asistente no responde ahora mismo. Vuelve a intentarlo.');
    }

    if (!response.ok) {
      const detalle = await response.text().catch(() => '');
      this.log.warn(`Gemini ${response.status}: ${detalle.slice(0, 500)}`);
      throw new GeminiError(
        response.status === 429
          ? 'El asistente ha llegado a su limite de uso. Prueba en unos minutos.'
          : 'El asistente no ha podido responder. Vuelve a intentarlo.',
        response.status,
      );
    }

    const json = (await response.json()) as {
      candidates?: { content?: { parts?: GeminiContent['parts'] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    if (json.promptFeedback?.blockReason) {
      throw new GeminiError('El asistente ha rechazado la peticion.');
    }

    const parts = json.candidates?.[0]?.content?.parts ?? [];

    /* La respuesta puede traer texto y llamadas a la vez, o solo llamadas: con
       function calling lo normal es que el texto venga vacío. Se recogen las dos
       cosas y el vacío lo rellena quien pinta, no este cliente. */
    return {
      text: parts
        .map((part) => part.text ?? '')
        .join('')
        .trim(),
      calls: parts
        .filter((part) => part.functionCall)
        .map((part) => ({
          name: part.functionCall!.name,
          args: part.functionCall!.args ?? {},
        })),
    };
  }
}
