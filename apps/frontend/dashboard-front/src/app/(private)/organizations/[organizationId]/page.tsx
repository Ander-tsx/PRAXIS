import { PanelDeAsientos, PanelDeMiembros } from '@/components/organisms/Organizaciones';
import { BotonDeCompra } from '@/components/organisms/Planes';
import { Badge } from '@praxis/commons';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type {
  BillingEventView,
  CatalogoDePlanes,
  OrganizationMemberView,
  OrganizationView,
} from '@praxis/commons/billing/planes';
import { fechaCorta } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Organización',
};

/**
 * El portal de una organización: su plan, su gente y su registro.
 *
 * ## Qué se decide aquí
 *
 * Qué se ofrece según el papel de quien mira: el dueño ve el pago y los
 * asientos, quien administra ve las invitaciones, y un miembro ve la lista y su
 * consumo. **Nada de eso protege nada** —quien decide es billing-service, que
 * comprueba el papel en cada comando— y por eso los cuatro bloques se piden
 * igual y se apagan aquí solo para no ofrecer lo que se va a negar.
 *
 * ## El registro no es decoración
 *
 * 🔴 Es la trampa 3 del encargo hecha pantalla: el mes gratis se cobra al
 * segundo, y «no me avisaron» es la queja más cara de este terreno. Cada cambio
 * de plan está ahí con su instante y con el evento de Stripe que lo causó.
 */
export default async function OrganizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ pago?: string }>;
}) {
  const { organizationId } = await params;
  const { pago } = await searchParams;

  const api = createServerApiClient();

  /* Cada `catch` degrada su bloque. No poder leer el registro no es motivo para
     no poder invitar a nadie. La organización sí es obligatoria: sin ella no hay
     pantalla que pintar. */
  const [organizacion, miembros, historial, catalogo] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<OrganizationMemberView[]>(`/organizations/${organizationId}/members`).catch(() => null),
    api.get<BillingEventView[]>(`/organizations/${organizationId}/history`).catch(() => null),
    api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
  ]);

  if (!organizacion) notFound();

  const spec = catalogo?.planes.find((plan) => plan.tier === organizacion.tier);
  const esDueño = organizacion.myRole === 'OWNER';
  /* Sin plan pagado todavía: la organización nace en FREE y el pago viene
     después. Es el estado normal justo tras crearla, y hay que decirlo. */
  const sinPlan = organizacion.tier === 'FREE';

  const planesDeEmpresa = (catalogo?.planes ?? []).filter(
    (plan) => plan.audience === 'ENTERPRISE' && catalogo?.disponibles.includes(plan.tier),
  );

  return (
    <AppHeader title={organizacion.name ?? 'Organización'}>
      <div className="flex flex-col gap-8">
        {pago === 'ok' && (
          <p
            role="status"
            className="rounded-2xl border border-border bg-surface-elevated px-5 py-4 font-sans text-sm text-text-secondary"
          >
            El pago se ha hecho. El plan se activa en cuanto Stripe lo confirma — suele tardar unos
            segundos; recarga la página si aún dice lo de antes.
          </p>
        )}

        <section className="flex flex-wrap items-center gap-3">
          <Badge variant={sinPlan ? 'warning' : 'primary'}>
            {spec?.nombre ?? organizacion.tier}
          </Badge>
          <p className="font-sans text-sm text-text-secondary">
            Creada el {fechaCorta(organizacion.createdAt) ?? '—'}
          </p>
        </section>

        {sinPlan && esDueño && (
          <section
            className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-elevated p-5"
            aria-label="Contratar un plan"
          >
            <h2 className="font-sans text-base font-semibold text-text-primary">
              Todavía no hay ningún plan pagado
            </h2>
            <p className="font-sans text-sm text-text-secondary">
              La organización funciona con las cuotas del plan gratuito hasta que se contrate uno.
              Los asientos que elegiste ya están guardados: al pagar se cobran esos.
            </p>
            <div className="flex flex-wrap gap-2">
              {planesDeEmpresa.map((plan) => (
                <BotonDeCompra
                  key={plan.tier}
                  destino="checkout"
                  tier={plan.tier}
                  seats={Math.max(organizacion.seats, plan.asientosMinimos)}
                  organizationId={organizacion.id}
                >
                  Contratar {plan.nombre}
                </BotonDeCompra>
              ))}
              {planesDeEmpresa.length === 0 && (
                <p className="font-sans text-sm text-text-secondary">
                  Los planes de empresa no están disponibles en esta instalación todavía.
                </p>
              )}
            </div>
          </section>
        )}

        {esDueño && (
          <PanelDeAsientos
            organizationId={organizacion.id}
            contratados={organizacion.seats}
            ocupados={organizacion.seatsUsed}
          />
        )}

        {miembros === null ? (
          <p className="font-sans text-sm text-text-secondary">
            No se pudo cargar la lista de miembros.
          </p>
        ) : (
          <PanelDeMiembros
            organizationId={organizacion.id}
            miembros={miembros}
            miPapel={organizacion.myRole}
            asientos={{ contratados: organizacion.seats, ocupados: organizacion.seatsUsed }}
          />
        )}

        {historial && historial.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-lg font-semibold text-text-primary">
              Registro de facturación
            </h2>
            <ul className="flex flex-col gap-2">
              {historial.map((evento) => (
                <li
                  key={evento.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3"
                >
                  <span className="font-sans text-sm text-text-primary">
                    {TEXTO_DE_EVENTO[evento.type] ?? evento.type}
                  </span>
                  <span className="font-sans text-xs text-text-secondary">
                    {fechaCorta(evento.occurredAt) ?? evento.occurredAt}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppHeader>
  );
}

/**
 * Los tipos del registro, en castellano.
 *
 * ⚠️ **Si aparece uno que no está aquí se enseña tal cual, no se esconde.** El
 * registro es la prueba de lo que pasó: un evento que la pantalla no sabe
 * nombrar sigue siendo un evento, y ocultarlo sería quitarle justo lo que le da
 * valor.
 */
const TEXTO_DE_EVENTO: Record<string, string> = {
  organizacion_creada: 'Se creó la organización',
  plan_aplicado: 'Se aplicó un plan',
  asientos_cambiados: 'Cambiaron los asientos',
  miembro_invitado: 'Se invitó a alguien',
  invitacion_aceptada: 'Alguien aceptó su invitación',
  miembro_retirado: 'Se sacó a alguien',
  rol_cambiado: 'Cambió el papel de alguien',
};
