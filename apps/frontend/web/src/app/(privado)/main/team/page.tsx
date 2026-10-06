import { MembersPanel, OrgIdentityForm, RolesPanel } from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type {
  OrganizationMemberView,
  OrganizationRoleView,
  OrganizationView,
} from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { TeamTabs } from './TeamTabs';

export const metadata: Metadata = { title: 'Equipo' };

export default async function TeamPage({
  searchParams,
}: {
  /** `?tab=roles` abre la pestaña de papeles. La usa `/main/roles`. */
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const { organizacionActivaId } = await loadPrivateChrome();
  if (!organizacionActivaId) {
    redirect('/main/organizations/new');
  }

  const organizationId = organizacionActivaId;
  const api = createServerApiClient();

  const [organizacion, miembros, roles] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<OrganizationMemberView[]>(`/organizations/${organizationId}/members`).catch(() => null),
    api.get<OrganizationRoleView[]>(`/organizations/${organizationId}/roles`).catch(() => null),
  ]);

  if (!organizacion) {
    return (
      <AppHeader title="Equipo">
        <div className="flex w-full flex-col gap-8 pb-16">
          <header className="flex items-end justify-between border-b border-white/[0.08] pb-6">
            <div className="flex flex-col gap-2">
              <h1 className="font-sans text-2xl font-semibold text-white">Equipo</h1>
              <p className="font-sans text-sm text-white">No se pudo cargar la organización.</p>
            </div>
          </header>
        </div>
      </AppHeader>
    );
  }

  const org = organizacion as unknown as OrganizationView;
  const permisos = org.myPermissions;

  return (
    <AppHeader title="Equipo">
      <div className="flex w-full flex-col gap-8 pb-16">
        <header className="flex flex-col gap-2 border-b border-white/[0.08] pb-6">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-white">
            Gestión de Equipo
          </h1>
          <p className="max-w-2xl font-sans text-sm text-white/70">
            Administra los miembros, sus roles y los niveles de acceso para{' '}
            <strong className="text-white font-medium">{org.name}</strong>.{' '}
            {/* ⚠️ El tope es `seatsCap` —lo que aplica el servidor— y no `seats`,
                que es lo contratado en Stripe. Después de bajar de plan o de
                cancelar no son el mismo número, y el que se enseña tiene que ser
                el que va a negar la invitación. */}
            {org.seatsCap === null
              ? `Ahora mismo hay ${org.seatsUsed} asientos ocupados, y tu plan no tiene tope.`
              : `Ahora mismo hay ${org.seatsUsed} de ${org.seatsCap} asientos ocupados.`}
          </p>
        </header>

        <div>
          <TeamTabs
            inicial={tab === 'roles' ? 'roles' : tab === 'ajustes' ? 'ajustes' : 'members'}
            members={
              <Seccion
                titulo="Directorio de miembros"
                entradilla="Invita o gestiona los miembros de tu organización."
              >
                {miembros && roles ? (
                  <MembersPanel
                    organizationId={organizationId}
                    miembros={miembros}
                    permisos={permisos}
                    roles={roles}
                    asientos={{ tope: org.seatsCap, ocupados: org.seatsUsed }}
                  />
                ) : (
                  <Vacio>No se pudo leer la lista de miembros.</Vacio>
                )}
              </Seccion>
            }
            ajustes={
              <Seccion
                titulo="Identidad de la organización"
                entradilla="El nombre, el icono, el color y la imagen con que se ve en la barra lateral."
              >
                <div className="max-w-xl">
                  <OrgIdentityForm
                    organizationId={organizationId}
                    initialName={org.name ?? ''}
                    initialIconKey={org.iconKey}
                    initialColor={org.color}
                    initialImageUrl={org.imageUrl ?? null}
                    puedeEditar={permisos.canManageOrganization}
                  />
                </div>
              </Seccion>
            }
            roles={
              <Seccion
                titulo="Roles del sistema"
                entradilla="Configura permisos a nivel de organización."
              >
                {roles ? (
                  <RolesPanel
                    organizationId={organizationId}
                    papeles={roles}
                    mios={permisos}
                    puedeEditar={permisos.canManageMembers}
                  />
                ) : (
                  <Aviso>Tu rol no permite ver este mapa de permisos.</Aviso>
                )}
              </Seccion>
            }
          />
        </div>
      </div>
    </AppHeader>
  );
}

function Seccion({
  titulo,
  entradilla,
  children,
}: { titulo: string; entradilla?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6 pt-4 animate-in fade-in duration-300">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-sans text-xl font-medium tracking-tight text-white">{titulo}</h2>
        {entradilla && <p className="max-w-2xl font-sans text-sm text-white/60">{entradilla}</p>}
      </div>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-white/10 bg-[#191919] p-5 font-sans text-sm text-white/80">
      {children}
    </p>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-xl border-l-2 border-primary py-2 pl-4 font-sans text-sm text-white/80 bg-primary/5 rounded-r-xl">
      {children}
    </p>
  );
}
