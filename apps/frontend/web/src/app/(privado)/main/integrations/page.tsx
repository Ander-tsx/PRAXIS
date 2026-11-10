import {
  AtribucionDeAgentes,
  ConexionesDeIa,
  IntegrationRow,
  McpIntegration,
} from '@/components/organisms/Integrations';
import type { McpConnectionView, PersonalTokenView } from '@/lib/main/integrations';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type { CatalogoDePlanes, OrganizationView } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Integraciones' };

/**
 * Integraciones: todas en una lista, y cada una se despliega para configurarla
 * (D12 de docs/PLAN-PRO-INTEGRACIONES.md, M13 de docs/PLAN-MCP.md).
 *
 * Son **personales dentro de la organización activa**: cada persona gestiona
 * sus tokens; la organización decide si se permiten. Y empiezan en Pro: con
 * otro plan se enseñan, pero con «Disponible en Pro» en vez del contenido.
 */
export default async function IntegrationsPage() {
  const { organizacionActivaId: organizationId, organizaciones } = await loadPrivateChrome();
  const api = createServerApiClient();

  /* Kyloo Accounts como servidor de autorización: sin él no hay "conectar con tu cuenta". */
  const oauthActivo = Boolean(process.env.KYLOO_ISSUER);

  const [organizacion, catalogo, tokens, conexiones] = organizationId
    ? await Promise.all([
        api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
        api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
        api.get<PersonalTokenView[]>('/me/tokens').catch(() => null),
        oauthActivo
          ? api.get<McpConnectionView[]>('/me/mcp/connections').catch(() => null)
          : Promise.resolve(null),
      ])
    : [null, null, null, null];

  const cabecera = (
    <header className="flex flex-col gap-2 pb-6">
      <h1 className="font-sans text-3xl font-semibold tracking-tight text-text-primary">
        Integraciones
      </h1>
      <p className="max-w-2xl font-sans text-sm text-text-secondary">
        Conecta Praxis con las herramientas que ya usas.
        {organizacion ? ` Valen para ${organizacion.name ?? 'esta organización'}.` : ''}
      </p>
    </header>
  );

  if (!organizationId || !organizacion) {
    return (
      <AppHeader title="Integraciones">
        <div className="flex w-full flex-col pb-16">
          {cabecera}
          <p className="border-t border-border pt-6 font-sans text-sm text-text-secondary">
            No se pudo cargar la organización activa.
          </p>
        </div>
      </AppHeader>
    );
  }

  const spec = catalogo?.planes.find((plan) => plan.tier === organizacion.tier);
  /* Sin catálogo se trata como sin integraciones: ofrecer crear un token que el
     servidor va a negar con un 402 es peor que decir dónde se consigue. */
  const conIntegraciones = spec?.integraciones === true;
  const mcpAllowed = organizacion.mcpAllowed !== false;
  const canManageOrganization = organizacion.myPermissions.canManageOrganization === true;
  const propios = (tokens ?? []).filter((token) => token.organizationId === organizationId);

  /* La dirección pública sale de la propia petición: es la de `web`, que es
     por donde entra el agente (M15). Sin variable de entorno que olvidar. */
  const cabeceras = await headers();
  const host = cabeceras.get('x-forwarded-host') ?? cabeceras.get('host') ?? 'localhost:4100';
  const protocolo =
    cabeceras.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const endpoint = `${protocolo}://${host}/api/mcp`;

  const disponibleEnPro = (
    <p className="max-w-2xl font-sans text-sm text-text-secondary">
      Las integraciones empiezan en el plan Pro.{' '}
      <Link href="/main/billing" className="text-primary hover:underline">
        Ver planes
      </Link>
    </p>
  );

  return (
    <AppHeader title="Integraciones">
      <div className="flex w-full flex-col pb-16">
        {cabecera}

        {conIntegraciones && organizacion.soyDueno && (
          <AtribucionDeAgentes
            organizationId={organizationId}
            agentAttribution={organizacion.agentAttribution === true}
          />
        )}

        <IntegrationRow
          title="Conectar un agente de IA (MCP)"
          description="La forma recomendada. Conecta Claude, ChatGPT u otro cliente compatible entrando con tu cuenta de Kyloo, sin copiar ningún token, y elige qué organizaciones puede ver."
          status={
            !conIntegraciones
              ? 'Disponible en Pro'
              : !oauthActivo
                ? 'Pronto'
                : !mcpAllowed
                  ? 'Desactivado'
                  : (conexiones ?? []).some((c) => !c.revokedAt)
                    ? 'Conectado'
                    : 'Sin conectar'
          }
          defaultOpen={conIntegraciones && oauthActivo}
          disabled={conIntegraciones && !oauthActivo}
        >
          {!conIntegraciones
            ? disponibleEnPro
            : oauthActivo && (
                <ConexionesDeIa
                  conexiones={conexiones ?? []}
                  organizaciones={organizaciones.map((o) => ({
                    id: o.id,
                    name: o.name ?? 'Espacio personal',
                  }))}
                  endpoint={endpoint}
                />
              )}
        </IntegrationRow>

        <IntegrationRow
          title="Token personal (clientes sin OAuth)"
          description="Para agentes que no saben iniciar sesión solos (scripts, clientes antiguos). Un token por organización que pegas a mano; si tu cliente admite OAuth, usa la opción de arriba."
          status={
            !conIntegraciones
              ? 'Disponible en Pro'
              : !mcpAllowed
                ? 'Desactivado'
                : propios.some((t) => !t.revokedAt)
                  ? 'Conectado'
                  : 'Sin conectar'
          }
          defaultOpen={conIntegraciones && !oauthActivo}
        >
          {conIntegraciones ? (
            <McpIntegration
              organizationId={organizationId}
              organizationName={organizacion.name ?? 'Esta organización'}
              mcpAllowed={mcpAllowed}
              canManageOrganization={canManageOrganization}
              tokens={propios}
              endpoint={endpoint}
            />
          ) : (
            disponibleEnPro
          )}
        </IntegrationRow>

        <IntegrationRow
          title="GitHub"
          description="Vincula tareas con pull requests y muévelas solas cuando se abren o se fusionan."
          status="Pronto"
          disabled
        />
      </div>
    </AppHeader>
  );
}
