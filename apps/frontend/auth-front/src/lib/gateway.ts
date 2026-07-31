import { ApiError, type AuthTokens, isAuthTokens, unwrapEnvelope } from '@praxis/commons/api';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

/**
 * POST a un endpoint del gateway, desenvolviendo el sobre `{success, data, meta}`.
 * Lanza ApiError tanto en errores de red (BAD_GATEWAY) como de negocio.
 */
export async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${GATEWAY_URL}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      503,
      'BAD_GATEWAY',
      'No se pudo conectar con el servidor de autenticación.',
    );
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
