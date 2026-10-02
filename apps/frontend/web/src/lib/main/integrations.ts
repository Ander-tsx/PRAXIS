/**
 * Las formas de los tokens del MCP, del lado del navegador. Espejo de
 * `PersonalTokenView` en `@praxis/contracts` (mcp/personal-tokens.ts): ese
 * paquete es de backend y no se importa aquí (ver `commons/billing/planes.ts`).
 */

export type PatScope = 'read' | 'write' | 'delete';

/** Un token tal y como se lista. Nunca trae el token. */
export interface PersonalTokenView {
  id: string;
  name: string;
  organizationId: string;
  /** Lo único legible del token: `prx_` + 8 caracteres. */
  prefix: string;
  scopes: PatScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** ¿Sigue valiendo? Ni revocado ni caducado. */
export function tokenVivo(token: PersonalTokenView, ahora = Date.now()): boolean {
  return !token.revokedAt && (!token.expiresAt || Date.parse(token.expiresAt) > ahora);
}
