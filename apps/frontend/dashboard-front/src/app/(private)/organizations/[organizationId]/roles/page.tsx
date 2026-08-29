import { RolesPanel, TemplatesPanel } from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type {
  OrganizationRoleView,
  OrganizationView,
  ProjectRoleTemplateView,
} from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Roles',
};

/**
 * Los dos planos de permisos de una organización, en una pantalla.
 *
 * ## Por qué caben los dos aquí y no en dos rutas
 *
 * Porque el segundo **existe por el primero**: las plantillas son el puente
 * entre lo que se decide arriba —quién crea proyectos, quién invita— y lo que
 * se encuentra dentro de un tablero. Separarlas obligaría a explicar el puente
 * dos veces, una en cada lado.
 *
 * Lo que **no** cabe aquí son los roles de un proyecto concreto: esos viven
 * dentro del proyecto, y son otro vocabulario. Ver `OrganizationPermission`
 * frente a `ProjectPermission`.
 *
 * ⚠️ **El puente va en una sola dirección.** Cambiar una plantilla no reescribe
 * los proyectos que ya existen — sería borrar el trabajo de quien los ajustó,
 * desde una pantalla que habla de otra cosa. La pantalla lo dice.
 *
 * ## Paleta
 *
 * La del rebrand near-black, igual que el portal de la organización: paneles con
 * `bg-white/[0.02]` y raya `border-white/[0.06]`.
 */
export default async function RolesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const api = createServerApiClient();

  const [organizacion, papeles, plantillas] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<OrganizationRoleView[]>(`/organizations/${organizationId}/roles`).catch(() => null),
    api
      .get<ProjectRoleTemplateView[]>(`/organizations/${organizationId}/role-templates`)
      .catch(() => null),
  ]);

  if (!organizacion) notFound();

  const permisos = organizacion.myPermissions;

  return (
    <AppHeader title="Roles">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-16">
        <header className="flex flex-col gap-2">
          <h1 className="font-sans text-2xl font-semibold text-white">Roles y permisos</h1>
          <p className="max-w-2xl font-sans text-sm text-white/45">
            En <span className="text-white/80">{organizacion.name}</span>. Dos listas distintas, no
            la misma a dos escalas: una decide qué se puede hacer <em>a</em> la organización, y la
            otra con qué roles nacen sus proyectos.
          </p>
        </header>

        <Seccion
          titulo="Roles de la organización"
          entradilla="Quién crea proyectos, quién invita, quién toca el plan. Ser dueño no es un rol: lo puede todo y no se le quita."
        >
          {papeles ? (
            <RolesPanel
              organizationId={organizationId}
              papeles={papeles}
              mios={permisos}
              puedeEditar={permisos.canManageMembers}
            />
          ) : (
            <Aviso>
              Tu rol en esta organización no permite ver quién puede qué. Es un mapa del poder
              interno del equipo, y por eso no lo lee cualquiera con asiento.
            </Aviso>
          )}
        </Seccion>

        <Seccion
          titulo="Plantillas de rol de proyecto"
          entradilla="Los roles con los que nace un proyecto de esta organización. Se definen una vez y no hay que configurarlos quince veces."
        >
          {plantillas ? (
            <TemplatesPanel
              organizationId={organizationId}
              plantillas={plantillas}
              puedeEditar={permisos.canManageRoleTemplates}
            />
          ) : (
            <Aviso>No se pudieron leer las plantillas. Vuelve a cargar la página.</Aviso>
          )}
        </Seccion>

        <div>
          <Link
            href={`/organizations/${organizationId}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.04] px-4 py-1.5 font-sans text-xs font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
          >
            ← Volver a {organizacion.name}
          </Link>
        </div>
      </div>
    </AppHeader>
  );
}

function Seccion({
  titulo,
  entradilla,
  children,
}: {
  titulo: string;
  entradilla: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-7">
      <div className="flex flex-col gap-1">
        <h2 className="font-sans text-base font-semibold text-white/90">{titulo}</h2>
        <p className="max-w-xl font-sans text-xs text-white/40">{entradilla}</p>
      </div>
      {children}
    </section>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-xl border-l-2 border-white/15 py-1 pl-4 font-sans text-sm text-white/50">
      {children}
    </p>
  );
}
