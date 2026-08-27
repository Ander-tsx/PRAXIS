import { CheckoutButton } from '@/components/organisms/Billing';
import { MembersPanel, SeatsPanel } from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import { projectHref } from '@praxis/commons/api/routes';
import { createServerApiClient } from '@praxis/commons/auth';
import type {
  BillingEventView,
  CatalogoDePlanes,
  OrganizationMemberView,
  OrganizationView,
} from '@praxis/commons/billing/planes';
import { fechaCorta } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Organización',
};

/** Lo que la lista de proyectos necesita saber de cada uno. */
interface ProyectoDeLaOrganizacion {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  updatedAt: string;
  _count?: { members: number };
}

/**
 * El portal de una organización.
 *
 * ## Lo primero que se ve son sus proyectos, y ese es el cambio
 *
 * 🔴 Esta pantalla empezaba por los asientos y el plan, y se leía **vacía**:
 * «tres miembros, tres asientos» y nada más. Con razón — eso es una factura,
 * no un sitio de trabajo, y era exactamente lo que se decidió no construir.
 * Desde que un proyecto pertenece a una organización, lo que hay aquí dentro
 * **es el trabajo del equipo**, y por eso va primero. El plan es una línea al
 * final, que es la importancia que tiene el día que no estás pagando.
 *
 * ## Sin tarjetas
 *
 * Filas separadas por una raya fina, número a la izquierda, y los botones como
 * texto subrayado. Es el lenguaje de `kyloo-design/SKILL.md` §4, sobre los
 * tokens `--color-*` de siempre —no los `--l-*` de la landing— porque esta
 * pantalla responde al tema claro y oscuro (§13).
 *
 * ## Qué se apaga y por qué no protege nada
 *
 * Los bloques se piden igual y se apagan según `myPermissions`, que resuelve el
 * servidor. **Quien decide es billing-service**, que comprueba el permiso en
 * cada comando: aquí solo se evita ofrecer lo que se va a negar.
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
  const [organizacion, miembros, proyectos, historial, catalogo] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<OrganizationMemberView[]>(`/organizations/${organizationId}/members`).catch(() => null),
    api
      .get<{ items: ProyectoDeLaOrganizacion[] }>(`/projects?organizationId=${organizationId}`)
      .catch(() => null),
    api.get<BillingEventView[]>(`/organizations/${organizationId}/history`).catch(() => null),
    api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
  ]);

  if (!organizacion) notFound();

  const permisos = organizacion.myPermissions;
  const spec = catalogo?.planes.find((plan) => plan.tier === organizacion.tier) ?? null;
  const lista = proyectos?.items ?? [];

  const contratables = (catalogo?.planes ?? []).filter(
    (plan) => plan.contratacion === 'AUTOSERVICIO' && catalogo?.disponibles.includes(plan.tier),
  );

  return (
    <AppHeader title={organizacion.name ?? 'Organización'}>
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        {/* La cabecera dice qué es esto y bajo qué plan, en una línea. Antes
            eran dos insignias y un bloque de plan arriba del todo, que ponía la
            factura por delante del trabajo. */}
        <p className="pb-8 font-serif text-base italic text-text-secondary">
          {organizacion.kind === 'PERSONAL'
            ? 'Tu espacio: aquí viven los proyectos que llevas por tu cuenta.'
            : 'El espacio del equipo. Todo lo que hay dentro es de la organización, no de quien lo creó.'}{' '}
          Plan {spec?.nombre ?? 'Gratis'}.
        </p>

        {pago === 'ok' && (
          <p
            role="status"
            className="mb-8 border-l-2 border-success py-2 pl-4 font-sans text-sm text-text-secondary"
          >
            Pago recibido. El plan se aplica en cuanto Stripe lo confirma — puede tardar unos
            segundos, y esta página lo dirá al recargarla.
          </p>
        )}

        {/* ─── Lo que hace que esto no esté vacío ──────────────────────── */}
        <Bloque
          titulo="Proyectos"
          entradilla={
            lista.length > 0
              ? `${lista.length} en esta organización.`
              : 'Todavía no hay ninguno aquí dentro.'
          }
          accion={
            permisos.canCreateProject ? (
              <EnlaceDeTexto href="/projects">Crear un proyecto</EnlaceDeTexto>
            ) : null
          }
        >
          {lista.length === 0 ? (
            <Vacio>
              {permisos.canCreateProject
                ? 'Un proyecto creado aquí pertenece a la organización, no a ti: si te vas, el equipo lo conserva.'
                : 'Tu papel en esta organización no permite crear proyectos. Pídeselo a quien la administra.'}
            </Vacio>
          ) : (
            <ol className="flex flex-col">
              {lista.map((proyecto, i) => (
                <li key={proyecto.id}>
                  <Link
                    href={projectHref(proyecto)}
                    className="group flex items-baseline gap-5 border-b border-dotted border-border py-5 transition-colors last:border-b-0 hover:border-border-strong"
                  >
                    <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-text-disabled">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-display text-lg text-text-primary transition-colors group-hover:text-primary">
                        {proyecto.name}
                      </span>
                      {proyecto.description && (
                        <span className="truncate font-sans text-sm text-text-secondary">
                          {proyecto.description}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-sans text-xs text-text-disabled">
                      {proyecto._count?.members ?? 1}{' '}
                      {(proyecto._count?.members ?? 1) === 1 ? 'persona' : 'personas'}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Bloque>

        {/* ─── Quién está dentro ──────────────────────────────────────── */}
        <Bloque
          titulo="Equipo"
          entradilla={`${organizacion.seatsUsed} de ${organizacion.seats} asientos ocupados. Una invitación ocupa el suyo desde que se manda.`}
        >
          {miembros ? (
            <MembersPanel
              organizationId={organizationId}
              miembros={miembros}
              permisos={permisos}
              asientos={{ contratados: organizacion.seats, ocupados: organizacion.seatsUsed }}
            />
          ) : (
            <Vacio>No se pudo leer la lista de miembros. Vuelve a cargar la página.</Vacio>
          )}
        </Bloque>

        {/* ─── El plan, que es una línea y no una portada ─────────────── */}
        {permisos.canManageBilling && (
          <Bloque
            titulo="Plan y asientos"
            entradilla={
              organizacion.tier === 'FREE'
                ? 'Estás en el plan gratuito. Se amplía cuando el equipo o los proyectos no quepan.'
                : `Plan ${spec?.nombre}. Los asientos se cambian aquí y se cobran prorrateados.`
            }
          >
            <div className="flex flex-col gap-6">
              <SeatsPanel
                organizationId={organizationId}
                contratados={organizacion.seats}
                ocupados={organizacion.seatsUsed}
              />

              {organizacion.tier === 'FREE' && contratables.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  {contratables.map((plan) => (
                    <CheckoutButton
                      key={plan.tier}
                      destino="checkout"
                      tier={plan.tier}
                      organizationId={organizationId}
                      seats={Math.max(organizacion.seats, plan.asientosMinimos)}
                    >
                      {`Pasar a ${plan.nombre}`}
                    </CheckoutButton>
                  ))}
                  <EnlaceDeTexto href="/dashboard/billing">Comparar los planes</EnlaceDeTexto>
                </div>
              )}
            </div>
          </Bloque>
        )}

        {/* ─── El registro ────────────────────────────────────────────── */}
        {permisos.canViewAuditLog && (
          <Bloque
            titulo="Registro"
            entradilla="Todo lo que ha movido el plan o los asientos, con su instante."
          >
            {historial && historial.length > 0 ? (
              <ol className="flex flex-col">
                {historial.map((evento) => (
                  <li
                    key={evento.id}
                    className="flex items-baseline justify-between gap-4 border-b border-dotted border-border py-3 last:border-b-0"
                  >
                    <span className="font-sans text-sm text-text-primary">
                      {TEXTO_DE_EVENTO[evento.type] ?? evento.type}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-text-disabled">
                      {fechaCorta(evento.occurredAt)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              /* 🔴 No es decoración: el mes gratis se cobra al segundo, y «no me
                 avisaron» es la queja más cara de este terreno. Que esté vacío
                 se dice, en vez de no pintar nada y parecer que falla. */
              <Vacio>Todavía no ha pasado nada que registrar.</Vacio>
            )}
          </Bloque>
        )}
      </div>
    </AppHeader>
  );
}

/**
 * Un bloque de la página: título, una frase, y su contenido debajo.
 *
 * ⚠️ **Una raya fina arriba y nada más** — ni borde, ni fondo, ni esquinas
 * redondeadas. Es el mismo dispositivo de la pantalla de Configuración y de la
 * landing: el contenido separa el contenido, no una caja alrededor.
 */
function Bloque({
  titulo,
  entradilla,
  accion,
  children,
}: {
  titulo: string;
  entradilla?: string;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-border py-9 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-2xl text-text-primary">{titulo}</h2>
          {entradilla && (
            <p className="max-w-xl font-serif text-sm italic text-text-secondary">{entradilla}</p>
          )}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Un enlace de acción.
 *
 * ⚠️ **Texto subrayado, no una píldora con fondo.** Es la tercera fila de la
 * tabla de §4: un botón dentro de una tarjeta se sustituye por texto con
 * subrayado condicional. Aquí no hay tarjetas, así que tampoco hay píldoras.
 */
function EnlaceDeTexto({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
    >
      {children}
    </Link>
  );
}

/** Un vacío que dice qué hacer, no que no hay nada. */
function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-xl border-l-2 border-border py-1 pl-4 font-sans text-sm text-text-secondary">
      {children}
    </p>
  );
}

/**
 * El vocabulario del registro, en español.
 *
 * ⚠️ Los tipos los escribe `billing-service` y son texto libre: lo que no esté
 * aquí se pinta tal cual en vez de quedarse en blanco. Un registro con huecos
 * es peor que uno con una palabra fea.
 */
const TEXTO_DE_EVENTO: Record<string, string> = {
  organizacion_creada: 'Se creó la organización',
  organizacion_traspasada: 'Cambió de dueño',
  miembro_invitado: 'Se invitó a alguien',
  invitacion_aceptada: 'Alguien aceptó su invitación',
  miembro_retirado: 'Salió alguien del equipo',
  papel_creado: 'Se creó un papel',
  papel_editado: 'Se editó un papel',
  papel_borrado: 'Se borró un papel',
  papel_asignado: 'Se cambió el papel de alguien',
  plantilla_guardada: 'Se guardó una plantilla de rol',
  plantilla_borrada: 'Se borró una plantilla de rol',
  plan_aplicado: 'Se aplicó un plan',
  asientos_cambiados: 'Cambiaron los asientos',
};
