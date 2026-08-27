import { CheckoutButton } from '@/components/organisms/Billing';
import { MembersPanel, SeatsPanel } from '@/components/organisms/Organizations';
import { AppHeader, Badge, alpha, colors } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type {
  BillingEventView,
  CatalogoDePlanes,
  OrganizationMemberView,
  OrganizationView,
  PlanSpec,
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
 * Qué se ofrece según el papel de quien mira: el dueño ve el plan y los
 * asientos, quien administra ve las invitaciones, y un miembro ve la lista.
 * **Nada de eso protege nada** —quien decide es billing-service, que comprueba
 * el papel en cada comando— y por eso los bloques se piden igual y se apagan
 * aquí solo para no ofrecer lo que se va a negar.
 *
 * ## El registro no es decoración
 *
 * 🔴 Es la trampa 3 del encargo hecha pantalla: el mes gratis se cobra al
 * segundo, y «no me avisaron» es la queja más cara de este terreno. Cada cambio
 * de plan está ahí con su instante y con el evento de Stripe que lo causó.
 */
export default async function OrganizationPage({
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
     no poder invitar a nadie. La organización sí es obligatoria: sin ella no
     hay pantalla que pintar. */
  const [organizacion, miembros, historial, catalogo] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<OrganizationMemberView[]>(`/organizations/${organizationId}/members`).catch(() => null),
    api.get<BillingEventView[]>(`/organizations/${organizationId}/history`).catch(() => null),
    api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
  ]);

  if (!organizacion) notFound();

  const spec = catalogo?.planes.find((plan) => plan.tier === organizacion.tier) ?? null;
  const esDueño = organizacion.soyDueno;
  /* Sin plan pagado: la organización nace en gratuito y el pago viene después.
     Es el estado normal justo tras crearla, y hay que decirlo. */
  const sinPlan = organizacion.tier === 'FREE';

  const contratables = (catalogo?.planes ?? []).filter(
    (plan) => plan.contratacion === 'AUTOSERVICIO' && catalogo?.disponibles.includes(plan.tier),
  );

  return (
    <AppHeader title={organizacion.name ?? 'Organización'}>
      <div className="flex flex-col gap-8">
        {pago === 'ok' && (
          <p
            role="status"
            className="rounded-2xl border px-5 py-4 font-sans text-sm text-text-secondary"
            style={{ borderColor: alpha(colors.success, 32), background: alpha(colors.success, 8) }}
          >
            El pago se ha hecho. El plan se activa en cuanto Stripe lo confirma — unos segundos. Si
            al recargar sigue diciendo lo de antes, es que el aviso de Stripe todavía no ha llegado;
            no hace falta volver a pagar.
          </p>
        )}

        <Cabecera organizacion={organizacion} spec={spec} sinPlan={sinPlan} />

        {sinPlan && esDueño && (
          <ActivarPlan organizacion={organizacion} contratables={contratables} />
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-8">
            {miembros === null ? (
              <p className="rounded-2xl border border-border bg-surface-elevated px-5 py-4 font-sans text-sm text-text-secondary">
                No se pudo cargar la lista de miembros.
              </p>
            ) : (
              <MembersPanel
                organizationId={organizacion.id}
                miembros={miembros}
                permisos={organizacion.myPermissions}
                asientos={{ contratados: organizacion.seats, ocupados: organizacion.seatsUsed }}
              />
            )}
          </div>

          <div className="flex flex-col gap-6 lg:col-span-4">
            {esDueño && (
              <SeatsPanel
                organizationId={organizacion.id}
                contratados={organizacion.seats}
                ocupados={organizacion.seatsUsed}
              />
            )}
            <Historial eventos={historial} />
          </div>
        </div>
      </div>
    </AppHeader>
  );
}

/** El plan, los asientos y qué da — en una banda, antes que nada. */
function Cabecera({
  organizacion,
  spec,
  sinPlan,
}: {
  organizacion: OrganizationView;
  spec: PlanSpec | null;
  sinPlan: boolean;
}) {
  return (
    <section
      className="flex flex-wrap items-start justify-between gap-6 rounded-3xl border p-6 sm:p-7"
      style={{
        borderColor: sinPlan ? alpha(colors.warning, 28) : alpha(colors.primary, 28),
        background: `linear-gradient(160deg, ${alpha(
          sinPlan ? colors.warning : colors.primary,
          6,
        )}, transparent 70%)`,
      }}
      aria-label="El plan de la organización"
    >
      <div className="flex flex-col gap-2">
        <span className="font-sans text-xs font-semibold uppercase tracking-widest text-text-secondary">
          Plan de la organización
        </span>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-sans text-2xl font-semibold text-text-primary">
            {spec?.nombre ?? organizacion.tier}
          </h2>
          {sinPlan && <Badge variant="warning">Sin contratar</Badge>}
        </div>
        {spec && !sinPlan && (
          /* Lo que otorga, en concreto y no en abstracto: es la pregunta que trae
             quien acaba de pagar por su equipo.

             ⚠️ La frase se arma en una función y no a trozos dentro del JSX: cada
             `{' '}` entre expresiones dejaba **un espacio antes de la coma y antes
             del punto** —«sin límite , 750 mensajes»— que se ve en el navegador y
             no da ningún error. */
          <p className="max-w-lg font-sans text-sm text-text-secondary">{loQueDa(spec)}</p>
        )}
      </div>

      <dl className="flex gap-8">
        <Dato titulo="Asientos" valor={`${organizacion.seatsUsed} / ${organizacion.seats}`} />
        <Dato titulo="Creada" valor={fechaCorta(organizacion.createdAt) ?? '—'} />
      </dl>
    </section>
  );
}

/** «Mientras estén dentro, sus miembros tienen X, Y y Z.» */
function loQueDa(spec: PlanSpec): string {
  const proyectos =
    spec.quotas.proyectos === null ? 'proyectos sin límite' : `${spec.quotas.proyectos} proyectos`;
  const mensajes =
    spec.quotas.iaMensualPorPersona === null
      ? 'mensajes a PRAX sin límite'
      : `${spec.quotas.iaMensualPorPersona} mensajes a PRAX al mes cada uno`;
  const miembros =
    spec.quotas.asientos === null
      ? 'sitio para toda la gente que haga falta'
      : `hasta ${spec.quotas.asientos} personas en la organización`;

  return `Mientras estén dentro, sus miembros tienen ${proyectos}, ${mensajes} y ${miembros}.`;
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-sans text-xs uppercase tracking-widest text-text-disabled">{titulo}</dt>
      <dd className="font-sans text-lg font-semibold tabular-nums text-text-primary">{valor}</dd>
    </div>
  );
}

/**
 * El bloque de pago, solo mientras no haya plan y solo para quien paga.
 *
 * ⚠️ El texto dice **«activar»** y lleva los asientos dentro. Decía «contratar
 * Empresa», que además de sonar raro no dice por cuántos asientos se va a
 * cobrar — que es justo el número que importa en un plan por asiento.
 */
function ActivarPlan({
  organizacion,
  contratables,
}: {
  organizacion: OrganizationView;
  contratables: PlanSpec[];
}) {
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-6"
      aria-label="Contratar un plan"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="font-sans text-base font-semibold text-text-primary">
          Esta organización todavía no tiene plan
        </h2>
        <p className="max-w-2xl font-sans text-sm text-text-secondary">
          Funciona con los topes del plan gratuito hasta que se active uno. Ya puedes invitar a la
          gente: los <strong className="text-text-primary">{organizacion.seats} asientos</strong>{' '}
          que elegiste están guardados y son los que se cobrarán.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {contratables.map((plan, indice) => (
          <CheckoutButton
            key={plan.tier}
            destino="checkout"
            tier={plan.tier}
            seats={Math.max(organizacion.seats, plan.asientosMinimos)}
            organizationId={organizacion.id}
            variante={indice === 0 ? 'primary' : 'secondary'}
          >
            Activar {plan.nombre} · {Math.max(organizacion.seats, plan.asientosMinimos)} asientos
          </CheckoutButton>
        ))}
        {contratables.length === 0 && (
          <p className="font-sans text-sm text-text-disabled">
            Los planes de equipo todavía no se pueden contratar en esta instalación.
          </p>
        )}
      </div>
    </section>
  );
}

function Historial({ eventos }: { eventos: BillingEventView[] | null }) {
  if (!eventos || eventos.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-sans text-base font-semibold text-text-primary">Registro</h2>
      <ol className="flex flex-col">
        {eventos.map((evento, indice) => (
          <li key={evento.id} className="flex gap-3">
            {/* La línea de tiempo: un punto por evento y una guía entre ellos.
                Una lista de recuadros para siete líneas de texto es marco de
                más, y aquí lo que importa es el orden. */}
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: colors.primary }}
              />
              {indice < eventos.length - 1 && (
                <span
                  aria-hidden="true"
                  className="w-px flex-1"
                  style={{ background: colors.borderSubtle }}
                />
              )}
            </div>
            <div className="flex flex-col pb-4">
              <span className="font-sans text-sm text-text-primary">
                {TEXTO_DE_EVENTO[evento.type] ?? evento.type}
              </span>
              <span className="font-sans text-xs text-text-disabled">
                {fechaCorta(evento.occurredAt) ?? evento.occurredAt}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
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
  plan_aplicado: 'Se activó un plan',
  asientos_cambiados: 'Cambiaron los asientos',
  miembro_invitado: 'Se invitó a alguien',
  invitacion_aceptada: 'Alguien aceptó su invitación',
  miembro_retirado: 'Se sacó a alguien',
  rol_cambiado: 'Cambió el papel de alguien',
};
