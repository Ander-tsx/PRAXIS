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

/** Un trozo de un turno: texto, una llamada a función, su respuesta, o un archivo. */
export type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  /** Lo que devolvió una consulta, de vuelta al modelo en la misma vuelta (F3). */
  functionResponse?: { name: string; response: Record<string, unknown> };
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
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Un archivo que acompaña a la pregunta, ya validado por quien llama. */
export interface GeminiArchivo {
  mimeType: string;
  /** base64, sin el prefijo `data:`. */
  data: string;
}

/**
 * Los tokens de una llamada, tal y como los cuenta Google.
 *
 * Hasta F0 de docs/PLAN-PRAX-SEMIAGENTICO.md no se leían: el coste de PRAX solo
 * se podía estimar a 4 caracteres por token, y el script de medida no veía ni
 * el historial ni los adjuntos. `razonamiento` son los tokens que el modelo
 * piensa antes de contestar: se cobran como salida aunque no se vean.
 */
export interface UsoDeGemini {
  entrada: number;
  salida: number;
  razonamiento: number;
  /** La parte de `entrada` que salió de caché, más barata. */
  cache: number;
}

export interface GeminiReply {
  text: string;
  calls: { name: string; args: Record<string, unknown> }[];
  /** Ausente si Google no lo mandó, cosa que no debería pasar pero no se da por hecha. */
  uso?: UsoDeGemini;
  /**
   * Las partes tal cual las devolvió el modelo. El bucle de consultas (F3) las
   * necesita enteras: la API exige que la siguiente vuelta repita la llamada a
   * función del modelo antes de su respuesta.
   */
  partes: GeminiPart[];
}

/** Lo que devuelve la API: una respuesta entera, o un trozo de una en streaming. */
interface TrozoDeGemini {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
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
    /**
     * Si volver a intentarlo tiene alguna posibilidad de salir bien.
     *
     * ⚠️ **No todos los fallos se parecen, y tratarlos igual es el error.** Un
     * 503 de «modelo sobrecargado» se pasa en dos segundos; un tope de gasto
     * agotado no se pasa hoy, y reintentar contra él es gastar la espera de
     * quien pregunta para llegar al mismo sitio. Lo mismo un bloqueo de
     * seguridad: la respuesta a la misma pregunta va a ser la misma.
     */
    readonly reintentable = false,
    /**
     * Solo en los 429: qué cuota se agotó y cuánto pide Google esperar. Ver
     * {@link leerLimite}.
     */
    readonly limite?: LimiteDeGemini,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

/**
 * Lo que dice un 429 de Gemini, leído de su cuerpo.
 *
 * 🔴 **Un 429 no es «vuelve en unos minutos».** En producción (2026-09-30) PRAX
 * contestaba «ha llegado a su límite de uso» a cualquier petición de verdad y
 * un «hola» funcionaba en el mismo instante: el «hola» es una llamada y una
 * pregunta real son tres o cuatro seguidas —el bucle de consultas—, cada una
 * con el contexto entero. Con una clave del nivel gratuito eso agota la cuota
 * **por minuto** del modelo, que se pasa sola en segundos, y el turno se tiraba
 * entero en vez de esperar lo que Google pide en `RetryInfo`.
 *
 * Las cuotas son **por modelo**: la de un día agotada en uno no toca al de
 * respaldo, así que ahí se cambia de modelo en vez de rendirse.
 */
export interface LimiteDeGemini {
  /** El `quotaId` del `QuotaFailure`, para el log. `null` si no vino. */
  cuota: string | null;
  /** El `retryDelay` de `RetryInfo`, en ms. `null` si no vino. */
  esperaMs: number | null;
  /** Una cuota diaria: esperar no sirve hoy, cambiar de modelo sí. */
  porDia: boolean;
}

/** Lo máximo que se espera a que se pase una cuota por minuto, dentro de un turno. */
const ESPERA_MAXIMA_POR_LIMITE_MS = 20_000;

export function leerLimite(detalle: string): LimiteDeGemini {
  let cuota: string | null = null;
  let esperaMs: number | null = null;
  try {
    const cuerpo = JSON.parse(detalle) as {
      error?: {
        details?: { '@type'?: string; violations?: { quotaId?: string }[]; retryDelay?: string }[];
      };
    };
    for (const d of cuerpo.error?.details ?? []) {
      if (d['@type']?.endsWith('QuotaFailure')) cuota = d.violations?.[0]?.quotaId ?? cuota;
      if (d['@type']?.endsWith('RetryInfo') && d.retryDelay) {
        const segundos = Number.parseFloat(d.retryDelay);
        if (Number.isFinite(segundos)) esperaMs = Math.ceil(segundos * 1000);
      }
    }
  } catch {
    /* Un cuerpo que no es JSON: sin datos, se trata como un 429 cualquiera. */
  }
  return { cuota, esperaMs, porDia: /PerDay/i.test(cuota ?? '') };
}

/** Más de esto y la espera deja de parecer una espera. */
const TIMEOUT_MS = 45_000;

/**
 * Cuántas veces se llama a Gemini antes de rendirse, contando la primera.
 *
 * Tres y no más: cada intento se paga en segundos de espera de una persona que
 * está mirando la pantalla, y a partir del tercero lo que falla ya no es
 * transitorio.
 */
const MAX_INTENTOS = 3;

/** Espera entre intentos, creciente y con ruido para no sincronizar reintentos. */
function esperaDelIntento(intento: number): number {
  const base = 400 * 2 ** (intento - 1);
  return base + Math.floor(Math.random() * 250);
}

@Injectable()
export class GeminiClient {
  private readonly log = new Logger(GeminiClient.name);
  private readonly apiKey: string;
  private readonly model: string;
  /**
   * El modelo al que se cae cuando el principal no contesta ni tras los
   * reintentos.
   *
   * ⚠️ **Vacío por defecto, y es a propósito.** Un respaldo mal elegido cambia
   * la voz de PRAX y la calidad de las propuestas sin que nadie se entere de
   * por qué; que haya que ponerlo a mano obliga a decidirlo. Si no está, se
   * agotan los reintentos contra el principal y se falla con el motivo real.
   */
  private readonly modelFallback: string | null;
  /**
   * Dónde está la API. Siempre Google, salvo en desarrollo y pruebas, que pueden
   * apuntar a `e2e/fixtures/gemini-falso.mjs` para ver PRAX funcionar sin una
   * clave (y sin gastar cuota de nadie).
   */
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-flash-latest';
    this.modelFallback = config.get<string>('GEMINI_MODEL_FALLBACK')?.trim() || null;
    this.baseUrl = (
      config.get<string>('GEMINI_BASE_URL')?.trim() || 'https://generativelanguage.googleapis.com'
    ).replace(/\/$/, '');
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
  async chat(
    params: {
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
      /**
       * Lo que va **después** del mensaje de la persona, dentro del mismo turno: las
       * llamadas a consultas del modelo y sus respuestas, vuelta a vuelta (F3).
       */
      extra?: GeminiContent[];
    },
    alTexto?: (delta: string) => void,
    /** Avisa de una espera por límite, para contarla en el pensamiento (D7). */
    alEsperar?: (segundos: number) => void,
  ): Promise<GeminiReply> {
    /**
     * Un turno son varios intentos, y eso es nuevo.
     *
     * 🔴 **Antes era una llamada y punto.** Un 503 de «modelo sobrecargado» —que
     * `gemini-flash-latest` devuelve a ratos y sin avisar— salía como un error
     * rojo en la cara de quien preguntaba, y el mismo mensaje reenviado a mano
     * treinta segundos después funcionaba. Desde fuera eso no se lee como «el
     * proveedor va lento»: se lee como que el asistente está roto.
     *
     * Solo se reintenta lo que puede salir distinto ({@link GeminiError.reintentable}).
     */
    const modelos = this.modelFallback ? [this.model, this.modelFallback] : [this.model];
    let ultimo: GeminiError | null = null;
    /* ⚠️ Con streaming, reintentar solo vale **antes** del primer trozo: después,
       la persona ya ha visto medio párrafo, y repetir la llamada le escribiría
       otro encima. */
    let emitido = false;
    const alTrozo = alTexto
      ? (delta: string) => {
          emitido = true;
          alTexto(delta);
        }
      : undefined;

    for (const modelo of modelos) {
      for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
        try {
          const respuesta = await this.intentar(modelo, params, alTrozo);
          if (ultimo) {
            this.log.log(
              `gemini_recuperado modelo=${modelo} intento=${intento} tras=${ultimo.status ?? 'red'}`,
            );
          }
          return respuesta;
        } catch (error) {
          const fallo =
            error instanceof GeminiError
              ? error
              : new GeminiError('El asistente no ha podido responder. Vuelve a intentarlo.');
          ultimo = fallo;
          this.log.warn(
            `gemini_intento_fallido modelo=${modelo} intento=${intento}/${MAX_INTENTOS} ` +
              `status=${fallo.status ?? 'red'} reintentable=${fallo.reintentable} ${fallo.message}`,
          );
          if (emitido) throw fallo;
          /* Un límite de Gemini (429 que no es el tope de gasto). Las cuotas son
             por modelo: la diaria no se pasa esperando, pero el de respaldo
             tiene la suya. La por minuto sí se pasa, y Google dice cuánto. */
          if (fallo.limite) {
            const espera = fallo.limite.esperaMs;
            const hayOtro = modelo !== modelos[modelos.length - 1];
            if (espera === null || fallo.limite.porDia || (hayOtro && espera > 3_000)) {
              if (hayOtro) break;
              throw fallo;
            }
            if (intento >= MAX_INTENTOS || espera > ESPERA_MAXIMA_POR_LIMITE_MS) {
              if (hayOtro) break;
              throw fallo;
            }
            alEsperar?.(Math.ceil(espera / 1000));
            await this.esperar(espera + 250);
            continue;
          }
          /* Lo que no es transitorio no mejora esperando, ni cambiando de
             modelo: la clave, el tope de gasto y el bloqueo de seguridad son
             del proyecto entero, no de un modelo concreto. */
          if (!fallo.reintentable) throw fallo;
          if (intento < MAX_INTENTOS) await this.esperar(esperaDelIntento(intento));
        }
      }
    }

    throw ultimo ?? new GeminiError('El asistente no ha podido responder. Vuelve a intentarlo.');
  }

  private esperar(milisegundos: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milisegundos));
  }

  /** Una sola llamada a la API. Los reintentos los pone {@link chat}. */
  private async intentar(
    modelo: string,
    params: Parameters<GeminiClient['chat']>[0],
    alTexto?: (delta: string) => void,
  ): Promise<GeminiReply> {
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
      ...(params.extra ?? []),
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

    const metodo = alTexto ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = `${this.baseUrl}/v1beta/models/${modelo}:${metodo}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        /* En streaming el plazo cubre la respuesta entera, no el primer byte:
           se le da el doble. */
        signal: AbortSignal.timeout(alTexto ? TIMEOUT_MS * 2 : TIMEOUT_MS),
      });
    } catch (error) {
      /* Se registra el motivo real —red caída, timeout— y hacia fuera va un
         mensaje que se pueda leer: el usuario no puede hacer nada con un
         `ETIMEDOUT`, pero sí con «vuelve a intentarlo». */
      this.log.warn(`Gemini no respondio: ${(error as Error).message}`);
      /* Red caída o timeout: transitorio por definición, así que se reintenta. */
      throw new GeminiError(
        'El asistente no responde ahora mismo. Vuelve a intentarlo.',
        undefined,
        true,
      );
    }

    if (!response.ok) {
      const detalle = await response.text().catch(() => '');
      const topeDeGasto = /spend(ing)? cap/i.test(detalle);
      const limite = response.status === 429 && !topeDeGasto ? leerLimite(detalle) : undefined;
      /* En una línea: el cuerpo entero salía partido en diez y cortado a 500
         caracteres, justo antes de decir **qué** cuota se había agotado. */
      this.log.warn(
        limite
          ? `gemini_limite modelo=${modelo} cuota=${limite.cuota ?? '?'} espera=${limite.esperaMs ?? '?'}ms`
          : `Gemini ${response.status}: ${detalle.replace(/\s+/g, ' ').slice(0, 500)}`,
      );
      throw new GeminiError(
        this.mensajeDelFallo(response.status, detalle),
        response.status,
        this.esTransitorio(response.status, detalle),
        limite,
      );
    }

    const trozos = alTexto
      ? await this.leerEnVivo(response, alTexto)
      : [(await response.json()) as TrozoDeGemini];
    return this.armarRespuesta(modelo, trozos);
  }

  /**
   * Lee un `streamGenerateContent?alt=sse`: cada evento es un trozo con la misma
   * forma que una respuesta completa. El texto se va entregando según llega; las
   * llamadas a función llegan enteras en su trozo.
   */
  private async leerEnVivo(
    response: Response,
    alTexto: (delta: string) => void,
  ): Promise<TrozoDeGemini[]> {
    const trozos: TrozoDeGemini[] = [];
    const lector = response.body?.getReader();
    if (!lector) return trozos;
    const decodificador = new TextDecoder();
    let pendiente = '';
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += decodificador.decode(value, { stream: true });
        const lineas = pendiente.split('\n');
        pendiente = lineas.pop() ?? '';
        for (const linea of lineas) {
          const limpia = linea.trim();
          if (!limpia.startsWith('data:')) continue;
          const trozo = JSON.parse(limpia.slice(5).trim()) as TrozoDeGemini;
          trozos.push(trozo);
          for (const parte of trozo.candidates?.[0]?.content?.parts ?? []) {
            if (parte.text) alTexto(parte.text);
          }
        }
      }
    } catch (error) {
      this.log.warn(`gemini_stream_cortado ${(error as Error).message}`);
      throw new GeminiError(
        'La respuesta del asistente se cortó. Vuelve a intentarlo.',
        undefined,
        true,
      );
    }
    return trozos;
  }

  /** De uno o varios trozos, la respuesta entera: texto, llamadas, uso y partes. */
  private armarRespuesta(modelo: string, trozos: TrozoDeGemini[]): GeminiReply {
    const bloqueo = trozos.find((t) => t.promptFeedback?.blockReason)?.promptFeedback?.blockReason;
    if (bloqueo) {
      /* No se reintenta: la misma pregunta va a dar el mismo bloqueo. */
      this.log.warn(`gemini_bloqueado modelo=${modelo} razon=${bloqueo}`);
      throw new GeminiError('El asistente ha rechazado la peticion.');
    }

    const parts: GeminiPart[] = trozos.flatMap((t) => t.candidates?.[0]?.content?.parts ?? []);
    const finishReason = [...trozos].reverse().find((t) => t.candidates?.[0]?.finishReason)
      ?.candidates?.[0]?.finishReason;
    const usageMetadata = [...trozos].reverse().find((t) => t.usageMetadata)?.usageMetadata;

    const uso: UsoDeGemini | undefined = usageMetadata
      ? {
          entrada: usageMetadata.promptTokenCount ?? 0,
          salida: usageMetadata.candidatesTokenCount ?? 0,
          razonamiento: usageMetadata.thoughtsTokenCount ?? 0,
          cache: usageMetadata.cachedContentTokenCount ?? 0,
        }
      : undefined;
    if (uso) {
      /* Una línea por llamada, con la forma de las demás de este cliente: es lo
         que permite sacar el coste real de un turno de los logs mientras no
         exista el contador por tokens (F4). */
      this.log.log(
        `gemini_uso modelo=${modelo} entrada=${uso.entrada} salida=${uso.salida} ` +
          `razonamiento=${uso.razonamiento} cache=${uso.cache}`,
      );
    }

    /* ⚠️ Un corte por longitud **no es una respuesta vacía**, y confundirlos
       manda a la persona a reintentar algo que va a volver a cortarse. Se
       registra para poder verlo en los logs; el texto que haya llegado se
       devuelve igual, porque medio párrafo útil vale más que nada. */
    if (finishReason && !['STOP', 'MAX_TOKENS'].includes(finishReason)) {
      this.log.warn(
        `gemini_corte modelo=${modelo} finishReason=${finishReason} partes=${parts.length}`,
      );
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
      partes: parts,
      ...(uso ? { uso } : {}),
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
  /**
   * Si este fallo de la API puede salir bien al volver a intentarlo.
   *
   * La familia 5xx es el caso claro: `UNAVAILABLE` cuando el modelo está
   * sobrecargado, `INTERNAL` cuando algo se les cayó a ellos. Las dos se pasan
   * solas en segundos y son, con diferencia, lo que más veces deja a alguien sin
   * respuesta.
   *
   * ⚠️ **El 429 se parte en dos, igual que su mensaje.** El de límite por minuto
   * también se pasa solo, pero no en los dos segundos que dura un backoff — así
   * que reintentarlo solo sirve para que la espera sea más larga antes del mismo
   * error. El del tope de gasto no se pasa hoy. Ninguno se reintenta.
   *
   * Un 4xx cualquiera —clave inválida, clave restringida, modelo que no existe
   * para esta clave— **tampoco**: son configuración, y la configuración no
   * cambia entre dos intentos separados por medio segundo. Ese es justo el caso
   * de la versión desplegada, y reintentarlo solo escondería el diagnóstico
   * detrás de tres veces más de espera.
   */
  private esTransitorio(status: number, _detalle: string): boolean {
    return status >= 500;
  }

  private mensajeDelFallo(status: number, detalle: string): string {
    /**
     * ⚠️ **Un 400 o un 403 de Gemini no es un fallo pasajero: es la
     * configuración de la plataforma.** Clave inválida, clave restringida por
     * IP o por API, o un modelo que esa clave no puede usar. Decirle a quien
     * pregunta «vuelve a intentarlo» lo manda a reintentar para siempre contra
     * algo que solo puede arreglar quien administra el despliegue — que es
     * exactamente lo que pasó con la versión desplegada.
     */
    if (status === 400 || status === 401 || status === 403) {
      return 'El asistente no está bien configurado en esta instalación. Avisa a quien la administra.';
    }
    if (status !== 429) return 'El asistente no ha podido responder. Vuelve a intentarlo.';

    const texto = detalle.toLowerCase();
    if (texto.includes('spending cap') || texto.includes('spend cap')) {
      return 'El asistente esta fuera de servicio: la plataforma ha agotado su presupuesto de este mes.';
    }
    if (leerLimite(detalle).porDia) {
      return 'El proveedor de IA ha agotado su cupo de hoy. Avisa a quien administra Praxis.';
    }
    /* ⚠️ Decía «el asistente ha llegado a su límite de uso», y se leía como la
       cuota de tokens de la persona — que no tenía nada que ver. */
    return 'El proveedor de IA está saturado ahora mismo. Prueba en un minuto.';
  }
}
