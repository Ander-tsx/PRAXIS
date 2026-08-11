import { cookies } from 'next/headers';
import { ApiError, unwrapEnvelope } from '../api/envelope';
import { UPLOAD_TIMEOUT_MS, isTimeout, timeoutError, timeoutSignal } from '../api/timeout';
import { SESSION_COOKIE } from './cookies';

/**
 * Cliente HTTP contra el gateway **desde el servidor**.
 *
 * Es la pieza que faltaba: los otros dos clientes no sirven en un Server
 * Component.
 *
 * - `createApiClient` (commons/api) es de navegador: hace `fetch` con una ruta
 *   relativa contra el proxy de la zona, y una ruta relativa no significa nada
 *   en el servidor.
 * - `createGatewayProxy` (commons/auth) es un route handler: se monta en una
 *   ruta, no se llama como función.
 *
 * Este cliente lee la cookie `praxis_session` con `next/headers` y llama al
 * gateway **directamente**, sin dar el rodeo por el proxy de la zona: en el
 * servidor ya tenemos el token, así que ese salto de red no aportaría nada.
 *
 * Desenvuelve con `unwrapEnvelope` y lanza el mismo `ApiError` que el cliente
 * de navegador, para que el manejo de errores sea idéntico en ambos lados.
 *
 * ⚠️ Código de servidor. Solo desde Server Components, layouts, páginas server
 * y route handlers. No se re-exporta desde `@praxis/commons`.
 *
 * Sobre la renovación del token: este cliente **no** renueva. No hace falta,
 * porque `proxy.ts` de la zona corre antes del render y ya reescribe la cookie
 * de la petición con el token fresco (ver `createSessionRefreshProxy`). Cuando
 * llegamos aquí, `cookies()` ya devuelve el token bueno.
 */

export interface ServerApiClientOptions {
  /** Por defecto: `process.env.GATEWAY_URL` o http://localhost:3000 */
  gatewayUrl?: string;
}

export interface ServerApiClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  /**
   * Envía un `FormData` tal cual, para subir archivos.
   *
   * Va aparte de `post` porque ahí el cuerpo se serializa a JSON, y un archivo
   * no sobrevive a eso. Aquí **no se fija `Content-Type` a propósito**: lo pone
   * `fetch` con el `boundary` que genera, y escribirlo a mano rompe el envío de
   * una forma que solo se ve en el servidor, como un multipart sin separador.
   */
  postForm<T>(path: string, form: FormData): Promise<T>;
}

export function createServerApiClient(options: ServerApiClientOptions = {}): ServerApiClient {
  const gatewayUrl = (
    options.gatewayUrl ??
    process.env.GATEWAY_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) {
      throw new ApiError(401, 'UNAUTHORIZED', 'No hay sesión activa.');
    }

    const normalized = path.startsWith('/') ? path : `/${path}`;

    let response: Response;

    try {
      response = await fetch(`${gatewayUrl}/api${normalized}`, {
        ...init,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        // Datos de sesión: nunca se cachean entre peticiones de usuarios distintos.
        cache: 'no-store',
        /* Sin esto, una conexión colgada deja el render de la página sin
           terminar, y con él la respuesta de la Server Action que lo provocó:
           el botón se queda cargando para siempre. Ver `api/timeout.ts`. */
        signal: timeoutSignal(init?.signal),
      });
    } catch (error) {
      if (isTimeout(error)) throw timeoutError();
      throw new ApiError(503, 'BAD_GATEWAY', 'No se pudo conectar con el servidor.');
    }

    return unwrapEnvelope<T>(response);
  }

  async function requestForm<T>(path: string, form: FormData): Promise<T> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) {
      throw new ApiError(401, 'UNAUTHORIZED', 'No hay sesión activa.');
    }

    const normalized = path.startsWith('/') ? path : `/${path}`;

    let response: Response;
    try {
      response = await fetch(`${gatewayUrl}/api${normalized}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        cache: 'no-store',
        /* El plazo largo: aquí el tiempo se va en mover el archivo. */
        signal: timeoutSignal(undefined, UPLOAD_TIMEOUT_MS),
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
    postForm: (path, form) => requestForm(path, form),
  };
}
