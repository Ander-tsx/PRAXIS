import { IntegrationRow, McpIntegration } from '@/components/organisms/Integrations';
import type { PersonalTokenView } from '@/lib/main/integrations';
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
  const { organizacionActivaId: organizationId } = await loadPrivateChrome();
  const api = createServerApiClient();

  const [organizacion, catalogo, tokens] = organizationId
    ? await Promise.all([
        api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
        api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
        api.get<PersonalTokenView[]>('/me/tokens').catch(() => null),
      ])
    : [null, null, null];

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
        <div className="mx-auto flex w-full max-w-4xl flex-col pb-16">
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
      <div className="mx-auto flex w-full max-w-4xl flex-col pb-16">
        {cabecera}

        <IntegrationRow
          title="Tu agente de IA (MCP)"
          description="Deja que Claude, Cursor u otro agente compatible con MCP lea y gestione tus proyectos como si fueras tú."
          status={
            !conIntegraciones
              ? 'Disponible en Pro'
              : !mcpAllowed
                ? 'Desactivado'
                : propios.some((t) => !t.revokedAt)
                  ? 'Conectado'
                  : 'Sin conectar'
          }
          defaultOpen={conIntegraciones}
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
