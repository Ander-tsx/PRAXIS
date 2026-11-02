import { ApiError, type AuthTokens, isAuthTokens, unwrapEnvelope } from '@praxis/commons/api';
import { fetchAlGateway } from '@praxis/commons/api/despertar';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

/**
 * POST a un endpoint del gateway, desenvolviendo el sobre `{success, data, meta}`.
 * Lanza ApiError tanto en errores de red (BAD_GATEWAY) como de negocio.
 */
export async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetchAlGateway(`${GATEWAY_URL}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(503, 'BAD_GATEWAY', 'No se pudo conectar con el servidor de autenticación.');
  }

  return unwrapEnvelope<T>(response);
}

/**
 * Igual que gatewayPost, pero valida que la respuesta tenga la forma
 * `{ userId, accessToken, refreshToken }` antes de devolverla.
 */
export async function gatewayAuthPost(path: string, body: unknown): Promise<AuthTokens> {
  const data = await gatewayPost<unknown>(path, body);

  if (!isAuthTokens(data)) {
    throw new ApiError(
      502,
      'BAD_GATEWAY',
      'El servidor de autenticación devolvió una respuesta inesperada.',
      data,
    );
  }

  return data;
}

/**
 * Despierta el backend con un `GET` (que `fetchAlGateway` sí reintenta) antes de una operación que
 * no se puede repetir. Nunca falla: si no responde, el intento real dará su propio error.
 *
 * ⚠️ Railway duerme `praxis-api` tras unos minutos sin tráfico, y la primera petición recibe un 502.
 * Un `POST` no se reintenta (ver `despertar.ts`), y el canje del código de Kyloo es un `POST` con
 * un código de **un solo uso**: si ese primer intento caía en el 502, el código se perdía y la
 * persona veía «Kyloo no responde» aunque hubiera puesto bien su código 2FA. Con la API ya despierta,
 * el canje sale a la primera.
 */
export async function despertarGateway(): Promise<void> {
  try {
    const response = await fetchAlGateway(`${GATEWAY_URL}/api`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    await response.body?.cancel();
  } catch {
    /* no hace falta nada: lo que venga después reportará su propio fallo */
  }
}
