/**
 * `fetch` al gateway que aguanta que el backend esté despertándose.
 *
 * ## Por qué
 *
 * Railway duerme `praxis-api` cuando nadie lo usa (docs/PLAN-MONOLITO.md, M-K)
 * y lo despierta con la primera petición. Su propia documentación avisa de que
 * *«the first request sent to a slept service may return a 502 Bad Gateway»*, y
 * mientras el contenedor arranca la conexión puede directamente rechazarse.
 * Sin esto, la primera persona que abre Praxis por la mañana ve un error.
 *
 * ## Qué se reintenta, y qué no
 *
 * - **Lo que no llegó a salir** (conexión rechazada, nombre sin resolver) se
 *   reintenta con cualquier método: el gateway no lo vio, así que repetirlo no
 *   puede duplicar nada.
 * - **Un 502 o 503 que no es nuestro** —el gateway responde siempre JSON; el
 *   de Railway, no— se reintenta **solo en `GET`/`HEAD`**. Un `POST` que recibe
 *   un 502 puede haberse aplicado ya, y `POST /auth/refresh` rota los tokens:
 *   repetirlo a ciegas cerraría la sesión que intentaba renovar.
 * - Un 502/503 **del gateway** (con su sobre JSON) es una respuesta de verdad y
 *   se devuelve tal cual.
 *
 * Las esperas suman unos 7 s: caben dentro del plazo de 15 s de cada petición
 * (`REQUEST_TIMEOUT_MS`), y si la señal se aborta antes, se deja de esperar.
 */
const ESPERAS_MS = [800, 2000, 4000];

/** Errores de red que garantizan que la petición no salió de aquí. */
const NO_LLEGO_A_SALIR = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function codigoDeRed(error: unknown): string | undefined {
  const causa = (error as { cause?: { code?: string } })?.cause;
  return causa?.code ?? (error as { code?: string })?.code;
}

function esIdempotente(metodo: string): boolean {
  return metodo === 'GET' || metodo === 'HEAD';
}

function esArranqueDeRailway(respuesta: Response): boolean {
  if (respuesta.status !== 502 && respuesta.status !== 503) return false;
  return !(respuesta.headers.get('content-type') ?? '').includes('application/json');
}

function esperar(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const temporizador = setTimeout(() => {
      signal?.removeEventListener('abort', alAbortar);
      resolve();
    }, ms);
    function alAbortar() {
      clearTimeout(temporizador);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', alAbortar, { once: true });
  });
}

export async function fetchAlGateway(
  url: string,
  init: RequestInit = {},
  esperas: readonly number[] = ESPERAS_MS,
): Promise<Response> {
  const metodo = (init.method ?? 'GET').toUpperCase();

  for (let intento = 0; ; intento += 1) {
    const quedan = intento < esperas.length;
    try {
      const respuesta = await fetch(url, init);
      if (quedan && esIdempotente(metodo) && esArranqueDeRailway(respuesta)) {
        await respuesta.body?.cancel();
        await esperar(esperas[intento], init.signal);
        continue;
      }
      return respuesta;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      const reintentable = esIdempotente(metodo) || NO_LLEGO_A_SALIR.has(codigoDeRed(error) ?? '');
      if (!quedan || !reintentable) throw error;
      await esperar(esperas[intento], init.signal);
    }
  }
}
