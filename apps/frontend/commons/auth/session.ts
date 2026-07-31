import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './cookies';

/**
 * Sesión del usuario, tal como se puede derivar del access token.
 *
 * Solo trae `userId` porque el JWT que emite credentials-service únicamente
 * lleva `{ sub, iat, exp }`. Para el nombre, el email o el avatar hay que
 * pedir GET /api/users/:id — no existe un /users/me.
 */
export interface Session {
  userId: string;
  /** Momento exacto en que caduca el access token. */
  expiresAt: Date;
  /** Segundos que le quedan de vida. Negativo si ya caducó. */
  expiresInSeconds: number;
}

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error(
      '[auth] JWT_SECRET no está configurado en esta zona; la sesión se tratará como anónima',
    );
    return null;
  }
  return new TextEncoder().encode(secret);
}

/**
 * Lee y **verifica** la cookie de sesión en el servidor.
 *
 * Verifica firma, `exp` y `nbf` con el JWT_SECRET compartido con el gateway;
 * no es un simple decode de claims. Devuelve `null` si no hay cookie, si está
 * expirada o si la firma no cuadra.
 *
 * Es una comprobación local sin salto de red: sirve para decidir qué renderizar,
 * no como autorización. La autorización real la hace el gateway en cada
 * petición.
 *
 * Solo se puede llamar desde Server Components, layouts, páginas server y
 * route handlers.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret);

    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }

    return {
      userId: payload.sub,
      expiresAt: new Date(payload.exp * 1000),
      expiresInSeconds: payload.exp - Math.floor(Date.now() / 1000),
    };
  } catch {
    // Expirado, firma inválida o malformado
    return null;
  }
}

/**
 * Igual que getSession pero lanza si no hay sesión.
 * Útil en páginas que el middleware ya protegió, para no repetir el null-check.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error('No hay sesión activa. ¿Falta proteger esta ruta en el middleware?');
  }
  return session;
}

/** Indica si hay una sesión válida, sin exponer sus datos. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}
