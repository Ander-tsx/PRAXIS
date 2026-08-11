import { ApiError, unwrapEnvelope } from './envelope';
import { isTimeout, timeoutError, timeoutSignal } from './timeout';

/**
 * Cliente HTTP contra el gateway, a través del proxy autenticado de la zona.
 *
 * No habla con el gateway directamente: el token vive en una cookie httpOnly
 * que el navegador no puede leer, así que toda petición pasa por
 * `/<zona>/api/gateway/...`, que es quien añade el Bearer.
 *
 * Devuelve el `data` ya desenvuelto y lanza `ApiError` con el código y el
 * mensaje reales del backend.
 */

export interface ApiClientOptions {
  /**
   * Ruta del proxy de la zona, con su basePath incluido.
   * Ej: '/projects/api/gateway' para projects-front.
   *
   * Hace falta escribir el basePath porque `fetch` con una URL relativa no lo
   * aplica: eso solo lo hacen `next/link` y el router.
   */
  gatewayPath: string;
}

export interface ApiClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
}

export function createApiClient({ gatewayPath }: ApiClientOptions): ApiClient {
  const base = gatewayPath.replace(/\/$/, '');

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const normalized = path.startsWith('/') ? path : `/${path}`;

    let response: Response;

    try {
      response = await fetch(`${base}${normalized}`, {
        ...init,
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        /* Los spinners que maneja el propio componente —el botón «Buscar», por
           ejemplo— se apagan en un `finally`: sin plazo, ese `finally` puede no
           llegar nunca. Ver `api/timeout.ts`. */
        signal: timeoutSignal(init?.signal),
      });
    } catch (error) {
      if (isTimeout(error)) throw timeoutError();
      throw new ApiError(503, 'BAD_GATEWAY', 'No se pudo conectar con el servidor.');
    }

    return unwrapEnvelope<T>(response);
  }

  return {
    get: (path, init) => request('GET', path, undefined, init),
    post: (path, body, init) => request('POST', path, body, init),
    put: (path, body, init) => request('PUT', path, body, init),
    patch: (path, body, init) => request('PATCH', path, body, init),
    delete: (path, body, init) => request('DELETE', path, body, init),
  };
}
