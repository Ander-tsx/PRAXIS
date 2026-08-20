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

/** Un trozo de un turno: texto, una llamada a función, o un archivo. */
type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  /**
   * Un archivo incrustado en la propia petición.
   *
   * ⚠️ **`inlineData` y no la File API a propósito.** Subir a la File API de
   * Gemini da un identificador reutilizable y ahorraría reenviar el archivo en
   * cada turno, pero también crea un objeto **que vive en la infraestructura de
   * Google** y que habría que borrar, con su política de retención y su forma de
   * fallar. Aquí los archivos no se guardan en ninguna parte: viajan con el turno
   * y se olvidan, y `inlineData` es lo que sostiene esa promesa.
   */
  inlineData?: { mimeType: string; data: string };
};

/** Un turno tal y como lo entiende la API. */
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Un archivo que acompaña a la pregunta, ya validado por quien llama. */
export interface GeminiArchivo {
  mimeType: string;
  /** base64, sin el prefijo `data:`. */
  data: string;
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
   * ## ⚠️ `temperature` sube de 0.2 a 0.6, y conviene saber por qué
   *
   * Estaba en 0.2 con un argumento razonable: aquí se explican números y se
   * rellenan ids de columnas, y la creatividad no aporta nada. Pero una
   * temperatura tan baja no solo quita variedad — **quita iniciativa**. El modelo
   * se pegaba a la ruta más segura, que con un prompt lleno de prohibiciones era
   * callarse o emitir una llamada a función y ni una palabra. El resultado era un
   * asistente que no se podía usar para conversar.
   *
   * Los ids no se protegen con la temperatura: los protege que **se validan**
   * contra el proyecto real en `validarPropuesta`, y que las herramientas
   * declaran conjuntos cerrados. Bajarla era pagar en conversación una seguridad
   * que ya estaba puesta en otro sitio.
   *
   * `maxOutputTokens` va explícito porque el defecto de la API es corto para una
   * respuesta que además lleva llamadas a función: al agotarse, `finishReason`
   * queda en `MAX_TOKENS` y **el texto llega recortado o vacío**, que es otra de
   * las formas en que salía «no he sabido responder».
   */
  async chat(params: {
    system: string;
    history: { role: string; text: string }[];
    message: string;
    tools: FunctionDeclaration[];
    /** Archivos del turno actual. Los anteriores no se reenvían: ver abajo. */
    archivos?: GeminiArchivo[];
    /**
     * Cuánto puede escribir, cuando 2048 no basta.
     *
     * 🔴 **Lo pide la plantilla de proyecto, y era un fallo silencioso
     * esperando.** Un plan de 4 espacios × 4 tableros × 8 columnas, más 6 roles
     * con su diccionario de permisos y 12 etiquetas, se pasa del techo por
     * defecto — y cuando eso ocurre `finishReason` queda en `MAX_TOKENS` y **la
     * llamada a función llega cortada**: JSON inválido, propuesta descartada al
     * validarla, y por fuera un asistente que «no ha sabido responder».
     *
     * No se sube para todos: el techo también protege de una respuesta que se
     * va por las ramas, y las conversaciones normales no lo rozan.
     */
    maxOutputTokens?: number;
  }): Promise<GeminiReply> {
    /**
     * ⚠️ **Los archivos solo van en el turno actual, nunca en el historial.**
     *
     * El hilo se lee de la base y allí solo hay **texto**. La alternativa
     * —reenviar todos los archivos de la conversación en cada turno— multiplica
     * el coste por la longitud del hilo y acaba comiéndose la ventana entera.
     *
     * ⚠️ Eso **no** quiere decir que un documento se pierda: desde
     * `Attachment.extract`, el texto de un `.md` o de un PDF se guarda al
     * subirlo y `historial()` lo vuelve a poner en cada turno, con presupuesto.
     * Lo que de verdad no vuelve es una **imagen**, que no tiene texto que
     * guardar — y por eso el prompt (regla 17) le pide a PRAX contar qué ve en
     * ella mientras la tiene delante.
     */
    const partesDelTurno: GeminiPart[] = [
      { text: params.message },
      ...(params.archivos ?? []).map((archivo) => ({
        inlineData: { mimeType: archivo.mimeType, data: archivo.data },
      })),
    ];

    const contents: GeminiContent[] = [
      ...params.history.map((turno) => ({
        role: turno.role === 'model' ? ('model' as const) : ('user' as const),
        parts: [{ text: turno.text }],
      })),
      { role: 'user', parts: partesDelTurno },
    ];

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: params.system }] },
      contents,
      generationConfig: {
        temperature: 0.6,
        topP: 0.95,
        maxOutputTokens: params.maxOutputTokens ?? 2048,
      },
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
      throw new GeminiError(this.mensajeDelFallo(response.status, detalle), response.status);
    }

    const json = (await response.json()) as {
      candidates?: { content?: { parts?: GeminiContent['parts'] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    if (json.promptFeedback?.blockReason) {
      throw new GeminiError('El asistente ha rechazado la peticion.');
    }

    const candidato = json.candidates?.[0];
    const parts = candidato?.content?.parts ?? [];

    /* ⚠️ Un corte por longitud **no es una respuesta vacía**, y confundirlos
       manda a la persona a reintentar algo que va a volver a cortarse. Se
       registra para poder verlo en los logs; el texto que haya llegado se
       devuelve igual, porque medio párrafo útil vale más que nada. */
    if (candidato?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidato.finishReason)) {
      this.log.warn(`Gemini corto la respuesta por ${candidato.finishReason}`);
    }

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

  /**
   * Qué se le dice a quien preguntó, según por qué falló Gemini.
   *
   * ## ⚠️ Dos 429 que no se arreglan igual
   *
   * Esto decía «llegado a su limite de uso, prueba en unos minutos» para
   * **cualquier** 429, y con uno de los dos casos eso es sencillamente falso:
   *
   * - **Límite por minuto**: sí, se pasa solo. Reintentar funciona.
   * - **Tope de gasto del proyecto** (`monthly spending cap`, el de AI Studio):
   *   no se pasa en unos minutos ni en unas horas. Hasta que alguien lo suba,
   *   ninguna respuesta va a salir — y mandar a la gente a reintentar cada cinco
   *   minutos contra un muro es peor que decirle que hoy no.
   *
   * Se distingue por el cuerpo del error porque la API devuelve **429 en los
   * dos**: no hay código que los separe.
   *
   * El mensaje del segundo no le pide nada a quien lo lee, y es a propósito:
   * quien usa PRAXIS no puede arreglar el presupuesto de la plataforma. Lo que
   * necesita saber es que no es culpa suya y que no gane tiempo reintentando.
   */
  private mensajeDelFallo(status: number, detalle: string): string {
    if (status !== 429) return 'El asistente no ha podido responder. Vuelve a intentarlo.';

    const texto = detalle.toLowerCase();
    if (texto.includes('spending cap') || texto.includes('spend cap')) {
      return 'El asistente esta fuera de servicio: la plataforma ha agotado su presupuesto de este mes.';
    }
    return 'El asistente ha llegado a su limite de uso. Prueba en unos minutos.';
  }
}
