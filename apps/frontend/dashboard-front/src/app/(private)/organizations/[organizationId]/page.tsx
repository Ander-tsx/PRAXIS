import { CheckoutButton } from '@/components/organisms/Billing';
import { MembersPanel, OrgIdentityForm, SeatsPanel } from '@/components/organisms/Organizations';
import { AppHeader, Glyph, glyphByKey } from '@praxis/commons';
import { projectHref } from '@praxis/commons/api/routes';
import { createServerApiClient } from '@praxis/commons/auth';
import type {
  BillingEventView,
  CatalogoDePlanes,
  OrganizationMemberView,
  OrganizationRoleView,
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

const NOMBRE_DE_PLAN: Record<string, string> = {
  FREE: 'Gratis',
  TEAM: 'Equipo',
  BUSINESS: 'Negocio',
  ENTERPRISE: 'Empresa',
};

/**
 * El portal de una organización — reescrito para el refrandeo.
 *
 * ## Estructura
 *
 * Ancho de verdad (el `max-w` de `AppHeader`, sin la columna estrecha de antes),
 * y en dos columnas a partir de `lg`: a la izquierda **el trabajo** —proyectos y
 * equipo—, a la derecha **la administración** —plan, asientos, registro—. La
 * configuración de identidad va a lo ancho abajo del todo, con `id` para que el
 * botón «Configuración» del selector de la barra lateral enlace directo.
 *
 * ## Paleta
 *
 * La del rebrand near-black: paneles con `bg-white/[0.02]` y raya
 * `border-white/[0.06]`, texto en blanco translúcido. Los acentos (morado de
 * marca, rojo de error) se quedan.
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
  const [organizacion, miembros, proyectos, historial, catalogo, papeles] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<OrganizationMemberView[]>(`/organizations/${organizationId}/members`).catch(() => null),
    api
      .get<{ items: ProyectoDeLaOrganizacion[] }>(`/projects?organizationId=${organizationId}`)
      .catch(() => null),
    api.get<BillingEventView[]>(`/organizations/${organizationId}/history`).catch(() => null),
    api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
    /* Los papeles, para poder cambiar el de alguien desde la lista de miembros.
       `[]` si quien mira no puede verlos: entonces no se ofrece cambiar, que es
       lo correcto — es un mapa del poder interno del equipo. */
    api
      .get<OrganizationRoleView[]>(`/organizations/${organizationId}/roles`)
      .catch(() => [] as OrganizationRoleView[]),
  ]);

  if (!organizacion) notFound();

  const permisos = organizacion.myPermissions;
  const spec = catalogo?.planes.find((plan) => plan.tier === organizacion.tier) ?? null;
  const lista = proyectos?.items ?? [];
  const esPersonal = organizacion.kind === 'PERSONAL';

  const contratables = (catalogo?.planes ?? []).filter(
    (plan) => plan.contratacion === 'AUTOSERVICIO' && catalogo?.disponibles.includes(plan.tier),
  );

  const inicial = (organizacion.name ?? 'O').charAt(0).toUpperCase();

  return (
    <AppHeader title={organizacion.name ?? 'Organización'}>
      <div className="flex w-full flex-col gap-8 pb-16">
        {/* ─── Cabecera: qué es esto, bajo qué plan ─────────────────────── */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {glyphByKey(organizacion.iconKey) ? (
              <Glyph
                iconKey={organizacion.iconKey}
                color={organizacion.color ?? null}
                size="md"
                shape="square"
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 font-sans text-base font-semibold text-white">
                {inicial}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="truncate font-sans text-2xl font-semibold text-white">
                {organizacion.name ?? 'Sin nombre'}
              </h1>
              <p className="font-sans text-sm text-white/45">
                {esPersonal
                  ? 'Tu espacio personal. Aquí viven los proyectos que llevas por tu cuenta.'
                  : 'El espacio del equipo. Todo lo que hay dentro es de la organización.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-white/60">
              Plan {NOMBRE_DE_PLAN[organizacion.tier] ?? spec?.nombre ?? 'Gratis'}
            </span>
            {permisos.canManageMembers && (
              <EnlaceDeAccion href={`/organizations/${organizationId}/roles`}>
                Papeles y plantillas
              </EnlaceDeAccion>
            )}
          </div>
        </header>

        {pago === 'ok' && (
          <p
            role="status"
            className="rounded-2xl border border-success/30 bg-success/10 px-5 py-4 font-sans text-sm text-white/80"
          >
            Pago recibido. El plan se aplica en cuanto Stripe lo confirma — puede tardar unos
            segundos, y esta página lo dirá al recargarla.
          </p>
        )}

        {/* ─── Dos columnas: el trabajo · la administración ─────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
          {/* ── Columna izquierda: el trabajo ──────────────────────────── */}
          <div className="flex flex-col gap-6">
            <Seccion
              titulo="Proyectos"
              entradilla={
                lista.length > 0
                  ? `${lista.length} en esta organización.`
                  : 'Todavía no hay ninguno aquí dentro.'
              }
              accion={
                permisos.canCreateProject ? (
                  <EnlaceDeAccion href="/projects" cruzaDeZona>
                    Nuevo proyecto
                  </EnlaceDeAccion>
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
                      {/* 🔴 `<a>` y no `next/link`: `projectHref` es una ruta **del
                          shell**, y esta zona monta en `/dashboard`, así que el
                          router la prefijaría y saldría `/dashboard/projects/<slug>`,
                          que es un 404. Ver §16. */}
                      <a
                        href={projectHref(proyecto)}
                        className="group flex items-baseline gap-4 rounded-xl border-b border-white/[0.06] px-2 py-4 transition-colors last:border-b-0 hover:bg-white/[0.03]"
                      >
                        <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-white/30">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="font-sans text-[15px] font-medium text-white/90 transition-colors group-hover:text-primary">
                            {proyecto.name}
                          </span>
                          {proyecto.description && (
                            <span className="truncate font-sans text-sm text-white/45">
                              {proyecto.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-sans text-xs text-white/30">
                          {proyecto._count?.members ?? 1}{' '}
                          {(proyecto._count?.members ?? 1) === 1 ? 'persona' : 'personas'}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </Seccion>

            <Seccion
              titulo="Equipo"
              entradilla={`${organizacion.seatsUsed} de ${organizacion.seats} asientos ocupados. Una invitación ocupa el suyo desde que se manda.`}
            >
              {miembros ? (
                <MembersPanel
                  organizationId={organizationId}
                  miembros={miembros}
                  permisos={permisos}
                  papeles={papeles}
                  asientos={{ contratados: organizacion.seats, ocupados: organizacion.seatsUsed }}
                />
              ) : (
                <Vacio>No se pudo leer la lista de miembros. Vuelve a cargar la página.</Vacio>
              )}
            </Seccion>
          </div>

          {/* ── Columna derecha: la administración ─────────────────────── */}
          <div className="flex flex-col gap-6">
            {permisos.canManageBilling && (
              <Seccion
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
                    <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-5">
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
                      {/* Sin `/dashboard` delante: es una ruta **de esta zona** y
                          `next/link` ya le pone el basePath. */}
                      <EnlaceDeAccion href="/billing">Comparar los planes</EnlaceDeAccion>
                    </div>
                  )}
                </div>
              </Seccion>
            )}

            {permisos.canViewAuditLog && (
              <Seccion
                titulo="Registro"
                entradilla="Todo lo que ha movido el plan o los asientos, con su instante."
              >
                {historial && historial.length > 0 ? (
                  <ol className="flex flex-col">
                    {historial.map((evento) => (
                      <li
                        key={evento.id}
                        className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-3.5 last:border-b-0"
                      >
                        <span className="font-sans text-sm text-white/80">
                          {TEXTO_DE_EVENTO[evento.type] ?? evento.type}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-white/30">
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
              </Seccion>
            )}
          </div>
        </div>

        {/* ─── Configuración: identidad, a lo ancho ─────────────────────── */}
        <div id="configuracion" className="scroll-mt-24">
          <Seccion
            titulo="Configuración"
            entradilla="El nombre, el icono y el color con los que aparece la organización en el selector y en todas partes."
          >
            <OrgIdentityForm
              organizationId={organizationId}
              initialName={organizacion.name ?? ''}
              initialIconKey={organizacion.iconKey ?? null}
              initialColor={organizacion.color ?? null}
              puedeEditar={permisos.canManageOrganization}
            />
          </Seccion>
        </div>
      </div>
    </AppHeader>
  );
}

/**
 * Una sección de la página: un panel con raya fina, título, una frase y su
 * contenido. La paleta near-black del rebrand: fondo casi negro translúcido,
 * borde apenas visible.
 */
function Seccion({
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
    <section className="flex flex-col gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-sans text-base font-semibold text-white/90">{titulo}</h2>
          {entradilla && <p className="max-w-xl font-sans text-xs text-white/40">{entradilla}</p>}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Un enlace de acción, píldora de borde.
 *
 * 🔴 **`cruzaDeZona` no es un adorno: sin él, el enlace da un 404.** Esta
 * pantalla vive en `dashboard-front`, cuyo `basePath` es `/dashboard`, y
 * `next/link` **prefija** la ruta. Un `href="/projects"` sale como
 * `/dashboard/projects`, que no existe. Lo que cruza de zona va en `<a>` duro.
 * Ver ESTADO-ACTUAL §16.
 */
function EnlaceDeAccion({
  href,
  children,
  cruzaDeZona = false,
}: {
  href: string;
  children: ReactNode;
  cruzaDeZona?: boolean;
}) {
  const clase =
    'inline-flex items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04] px-4 py-1.5 font-sans text-xs font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white';

  return cruzaDeZona ? (
    <a href={href} className={clase}>
      {children}
    </a>
  ) : (
    <Link href={href} className={clase}>
      {children}
    </Link>
  );
}

/** Un vacío que dice qué hacer, no que no hay nada. */
function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-white/[0.06] bg-black/20 p-5 font-sans text-sm text-white/45">
      {children}
    </p>
  );
}

/**
 * El vocabulario del registro, en español.
 *
 * ⚠️ Los tipos los escribe `billing-service` y son texto libre: lo que no esté
 * aquí se pinta tal cual en vez de quedarse en blanco.
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
  asiento_dado: 'Se le dio asiento a alguien desde un proyecto',
  proyecto_traspasado: 'Un proyecto cambió de responsable',
  acceso_autoconcedido: 'Administración se dio acceso a un proyecto',
  plan_aplicado: 'Se aplicó un plan',
  asientos_cambiados: 'Cambiaron los asientos',
};
