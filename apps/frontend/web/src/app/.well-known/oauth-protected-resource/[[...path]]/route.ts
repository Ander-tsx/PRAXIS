import { getPublicOrigin } from '@praxis/commons/auth';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Metadatos del recurso protegido (RFC 9728): `GET /.well-known/oauth-protected-resource/api/mcp`.
 *
 * Es lo primero que lee un cliente MCP (ChatGPT, Claude) tras recibir un 401 del
 * MCP: el `WWW-Authenticate` le apunta aquí, y aquí encuentra **quién emite los
 * tokens** (Kyloo Accounts) y qué permisos existen. Sin esto, «Añadir conector»
 * no sabe a dónde ir.
 *
 * Se sirve para `/` y para la ruta del MCP: unos clientes piden la una y otros
 * la otra. Sin `KYLOO_ISSUER` responde 404: un entorno sin servidor de
 * autorización no debe anunciar uno.
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const emisor = process.env.KYLOO_ISSUER?.replace(/\/$/, '');
  if (!emisor) return new NextResponse(null, { status: 404 });

  const recurso = process.env.MCP_RESOURCE_URL ?? `${getPublicOrigin(request)}/api/mcp`;
  return NextResponse.json(
    {
      resource: recurso,
      authorization_servers: [emisor],
      scopes_supported: ['praxis:read', 'praxis:write', 'praxis:delete'],
      bearer_methods_supported: ['header'],
      resource_name: 'Praxis',
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
