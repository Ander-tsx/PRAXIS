import {
  MembersPanel,
  RolesPanel,
  TemplatesPanel,
  OrgIdentityForm
} from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type {
  OrganizationMemberView,
  OrganizationRoleView,
  OrganizationView,
  ProjectRoleTemplateView,
} from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Equipo' };

export default async function TeamPage() {
  const { organizacionActivaId } = await loadPrivateChrome();
  if (!organizacionActivaId) {
    redirect('/organizations/new');
  }

  const organizationId = organizacionActivaId;
  const api = createServerApiClient();

  const [organizacion, miembros, papeles, plantillas] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<OrganizationMemberView[]>(`/organizations/${organizationId}/members`).catch(() => null),
    api.get<OrganizationRoleView[]>(`/organizations/${organizationId}/roles`).catch(() => null),
    api.get<ProjectRoleTemplateView[]>(`/organizations/${organizationId}/role-templates`).catch(() => null),
  ]);

  if (!organizacion) {
    return (
      <AppHeader title="Equipo">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
          <header className="flex items-end justify-between border-b border-white/[0.08] pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-sans text-2xl font-semibold text-white">Equipo</h1>
            <p className="font-sans text-sm text-white/45">No se pudo cargar la organización.</p>
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 pb-16">
        <header className="flex flex-col gap-2">
          <h1 className="font-sans text-3xl font-medium tracking-tight text-white">Equipo</h1>
            <p className="max-w-2xl font-sans text-sm text-white/50">
              Gestiona los miembros y los niveles de acceso para <span className="text-white/90 font-medium">{org.name}</span>.
            </p>
        </header>

        <div className="flex flex-col gap-8">
          <Seccion
            titulo="Miembros e invitaciones"
            entradilla={`${org.seatsUsed} de ${org.seats} asientos ocupados.`}
          >
            {miembros && papeles ? (
              <MembersPanel
                organizationId={organizationId}
                miembros={miembros}
                permisos={permisos}
                papeles={papeles}
                asientos={{ contratados: org.seats, ocupados: org.seatsUsed }}
              />
            ) : (
              <Vacio>No se pudo leer la lista de miembros.</Vacio>
            )}
          </Seccion>

          <Seccion
            titulo="Roles y permisos"
            entradilla="Define qué rol ejerce cada usuario en el sistema. Puedes crear roles personalizados con permisos específicos."
          >
            {papeles ? (
              <RolesPanel
                organizationId={organizationId}
                papeles={papeles}
                mios={permisos}
                puedeEditar={permisos.canManageMembers}
              />
            ) : (
              <Aviso>Tu rol no permite ver este mapa de permisos.</Aviso>
            )}
          </Seccion>

          <Seccion
            titulo="Plantillas de rol de proyecto"
            entradilla="Los roles con los que nace un proyecto."
          >
            {plantillas ? (
              <TemplatesPanel
                organizationId={organizationId}
                plantillas={plantillas}
                puedeEditar={permisos.canManageRoleTemplates}
              />
            ) : (
              <Aviso>No se pudieron leer las plantillas.</Aviso>
            )}
          </Seccion>
        </div>
      </div>
      
      
    </AppHeader>
  );
}

function Seccion({ titulo, entradilla, children }: { titulo: string; entradilla?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-8 pb-14 border-b border-white/[0.08] last:border-0 last:pb-0">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-sans text-xl font-medium tracking-tight text-white/95">{titulo}</h2>
        {entradilla && <p className="max-w-2xl font-sans text-sm text-white/50">{entradilla}</p>}
      </div>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-white/[0.06] bg-black/20 p-5 font-sans text-sm text-white/45">{children}</p>;
}

function Aviso({ children }: { children: ReactNode }) {
  return <p className="max-w-xl border-l-2 border-white/15 py-1 pl-4 font-sans text-sm text-white/50">{children}</p>;
}
