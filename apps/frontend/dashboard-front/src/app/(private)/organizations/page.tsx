import { Badge, Button } from '@praxis/commons';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { OrganizationView } from '@praxis/commons/billing/planes';
import { TEXTO_DE_PAPEL } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Organizaciones',
};

/**
 * Las organizaciones a las que perteneces.
 *
 * ⚠️ **La personal no sale, y no es un olvido.** Todo el mundo tiene una —es lo
 * que hace que «¿cuál es tu plan?» tenga una sola forma en todo el sistema—
 * pero no tiene nombre, no admite miembros y no hay nada que gestionar en ella.
 * Enseñarla obligaría a explicar en pantalla una fila que existe solo para el
 * modelo de datos.
 */
export default async function OrganizacionesPage() {
  const organizaciones = await createServerApiClient()
    .get<OrganizationView[]>('/me/organizations')
    .catch(() => null);

  return (
    <AppHeader title="Organizaciones">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl font-sans text-sm text-text-secondary">
            Una organización es quien paga un plan de empresa: tiene asientos, gente dentro y su
            propio registro de facturación. Los proyectos no se mueven — el plan es otra capa.
          </p>
          <Link href="/organizations/new">
            <Button type="button">Crear una</Button>
          </Link>
        </div>

        {organizaciones === null && (
          <p className="font-sans text-sm text-text-secondary">
            No se pudieron cargar tus organizaciones. Vuelve a intentarlo en un momento.
          </p>
        )}

        {organizaciones?.length === 0 && (
          <p className="rounded-2xl border border-border bg-surface-elevated px-5 py-4 font-sans text-sm text-text-secondary">
            Todavía no perteneces a ninguna. Si te han invitado a una, abre el enlace que te
            pasaron; si quieres contratar un plan de empresa, créala aquí.
          </p>
        )}

        <ul className="grid gap-3 md:grid-cols-2">
          {organizaciones?.map((organizacion) => (
            <li key={organizacion.id}>
              <Link
                href={`/organizations/${organizacion.id}`}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-elevated p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-sans text-base font-semibold text-text-primary">
                    {organizacion.name ?? 'Sin nombre'}
                  </h2>
                  <Badge variant="primary">{organizacion.tier}</Badge>
                  <Badge>{TEXTO_DE_PAPEL[organizacion.myRole]}</Badge>
                </div>
                <p className="font-sans text-sm text-text-secondary">
                  {organizacion.seatsUsed} de {organizacion.seats} asientos ocupados
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppHeader>
  );
}
