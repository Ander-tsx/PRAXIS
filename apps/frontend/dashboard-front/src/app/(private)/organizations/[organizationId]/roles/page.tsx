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
  title: 'Roles y permisos',
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
 * desde una pantalla que habla de otra cosa. La pantalla lo dice, porque si no
 * se dice, nadie lo supone.
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
    <AppHeader title="Roles y permisos">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <p className="pb-8 font-serif text-base italic text-text-secondary">
          En <strong className="not-italic text-text-primary">{organizacion.name}</strong>. Son dos
          listas distintas y no la misma a dos escalas: una decide qué se puede hacer <em>a</em> la
          organización, y la otra con qué roles nacen sus proyectos.
        </p>

        <Bloque
          titulo="Papeles de la organización"
          entradilla="Quién crea proyectos, quién invita, quién toca el plan. Ser dueño no es un papel: lo puede todo y no se le quita."
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
              Tu papel en esta organización no permite ver quién puede qué. Es un mapa del poder
              interno del equipo, y por eso no lo lee cualquiera con asiento.
            </Aviso>
          )}
        </Bloque>

        <Bloque
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
        </Bloque>

        <div className="border-t border-border pt-8">
          <Link
            href={`/organizations/${organizationId}`}
            className="font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
          >
            Volver a {organizacion.name}
          </Link>
        </div>
      </div>
    </AppHeader>
  );
}

function Bloque({
  titulo,
  entradilla,
  children,
}: {
  titulo: string;
  entradilla: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-border py-9 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl text-text-primary">{titulo}</h2>
        <p className="max-w-xl font-serif text-sm italic text-text-secondary">{entradilla}</p>
      </div>
      {children}
    </section>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-xl border-l-2 border-border py-1 pl-4 font-sans text-sm text-text-secondary">
      {children}
    </p>
  );
}
