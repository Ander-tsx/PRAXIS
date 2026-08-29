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

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ config?: string }> }) {
  const { config } = await searchParams;
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
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-16">
          <header className="flex flex-col gap-2">
            <h1 className="font-sans text-2xl font-semibold text-white">Equipo</h1>
            <p className="font-sans text-sm text-white/45">No se pudo cargar la organización.</p>
          </header>
        </div>
      </AppHeader>
    );
  }

  const org = organizacion as unknown as OrganizationView;
  const permisos = org.myPermissions;

  return (
    <AppHeader title="Equipo">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 pb-16">
        <header className="flex flex-col gap-2">
          <h1 className="font-sans text-2xl font-semibold text-white">Equipo</h1>
          <p className="max-w-2xl font-sans text-sm text-white/45">
            Gestiona los miembros y las invitaciones de <span className="text-white/80">{org.name}</span>.
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
            titulo="Roles de la organización"
            entradilla="Quién crea proyectos, quién invita, quién toca el plan."
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
      
      {config === 'true' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <Link href="/team" className="fixed inset-0 bg-black/60 backdrop-blur-sm" scroll={false} />
          <div className="relative z-10 w-full max-w-lg bg-[#080807] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-white font-sans">Configuración</h2>
                <span className="text-xs text-white/50">El nombre, icono y color del equipo</span>
              </div>
              <Link href="/team" scroll={false} className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Link>
            </div>
            <div className="p-6">
              <OrgIdentityForm
                organizationId={organizationId}
                initialName={org.name ?? ''}
                initialIconKey={org.iconKey ?? null}
                initialColor={org.color ?? null}
                puedeEditar={permisos.canManageOrganization}
              />
            </div>
          </div>
        </div>
      )}
    </AppHeader>
  );
}

function Seccion({ titulo, entradilla, children }: { titulo: string; entradilla?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-7">
      <div className="flex flex-col gap-1">
        <h2 className="font-sans text-base font-semibold text-white/90">{titulo}</h2>
        {entradilla && <p className="max-w-xl font-sans text-xs text-white/40">{entradilla}</p>}
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
