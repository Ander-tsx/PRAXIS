import { type JWTPayload, jwtVerify } from 'jose';

/**
 * Verificación del access token, sin depender de `next/headers`.
 *
 * Vive aparte de `session.ts` para que la puedan usar los `proxy.ts` de las
 * zonas, que reciben el token de `request.cookies` y no del store de cookies
 * del servidor. Así ninguna zona necesita declarar `jose` por su cuenta ni
 * repetir esta lógica.
 *
 * ⚠️ Verificar el token **no** es autorizar. Sirve para decidir si dejamos
 * entrar a una pantalla; los permisos reales los aplica el gateway en cada
 * petición.
 */

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET no está configurado en esta zona');
    return null;
  }
  return new TextEncoder().encode(secret);
}

/**
 * Verifica firma, `exp` y `nbf`. Devuelve el payload, o `null` si el token
 * falta, caducó o no cuadra la firma.
 */
export async function verifySessionToken(token: string | undefined): Promise<JWTPayload | null> {
  if (!token) return null;

  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    // Caducado, firma inválida o malformado. Quien llama decide qué hacer.
    return null;
  }
}

/** Atajo booleano de `verifySessionToken`. */
export async function hasValidSessionToken(token: string | undefined): Promise<boolean> {
  return (await verifySessionToken(token)) !== null;
}
