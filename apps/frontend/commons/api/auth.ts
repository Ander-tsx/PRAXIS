/**
 * Contrato de autenticación tal como lo devuelve el gateway.
 *
 * ⚠️ El backend usa camelCase (`accessToken`). El DTO `AuthResponseDto` de
 * @praxis/contracts declara `access_token` pero está obsoleto y no coincide
 * con lo que emite credentials-service. Ver docs/frontend/ESTADO-ACTUAL.md §5.1
 */

/** `data` de POST /api/auth/login y POST /api/auth/register */
export interface AuthTokens {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

/** `data` de POST /api/auth/refresh */
export interface RefreshedToken {
  accessToken: string;
}

/** Claims del JWT emitido por credentials-service */
export interface JwtClaims {
  sub: string;
  iat: number;
  exp: number;
}

export function isAuthTokens(value: unknown): value is AuthTokens {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === 'string' &&
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string'
  );
}
