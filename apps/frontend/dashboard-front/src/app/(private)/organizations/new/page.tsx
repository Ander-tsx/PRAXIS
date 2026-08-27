import { OrganizationForm } from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { CatalogoDePlanes, PlanTier } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nueva organización',
};

const TIERS_DE_EMPRESA: PlanTier[] = ['TEAM', 'BUSINESS'];

/**
 * Crear la organización que contratará un plan de empresa.
 *
 * El catálogo lo trae el servidor: los asientos mínimos de cada plan salen de
 * `PLANS`, que es de donde los lee también quien valida la creación. Escribir
 * «desde 3 asientos» a mano en el formulario sería prometer un número que el
 * backend puede rechazar.
 */
export default async function NuevaOrganizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier } = await searchParams;

  const catalogo = await createServerApiClient()
    .get<CatalogoDePlanes>('/me/billing/planes')
    .catch(() => null);

  const planes = (catalogo?.planes ?? []).filter((plan) => plan.contratacion === 'AUTOSERVICIO');

  if (planes.length === 0) {
    return (
      <AppHeader title="Nueva organización">
        <p className="font-sans text-sm text-text-secondary">
          No se pudo cargar el catálogo de planes de empresa. Vuelve a intentarlo en un momento.
        </p>
      </AppHeader>
    );
  }

  const elegido = TIERS_DE_EMPRESA.includes(tier as PlanTier) ? (tier as PlanTier) : null;

  return (
    <AppHeader title="Nueva organización">
      <OrganizationForm planes={planes} tierInicial={elegido} />
    </AppHeader>
  );
}
