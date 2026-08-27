import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { OrganizationView } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Organizaciones',
};

/**
 * Las organizaciones a las que perteneces.
 *
 * ## La personal sale, y antes no
 *
 * ⚠️ Se filtraba por `kind: 'ENTERPRISE'` porque la personal era invisible: no
 * tenía nombre, no admitía a nadie y no había nada que gestionar en ella.
 * Desde 2026-08-26 **es donde viven los proyectos de quien trabaja solo**, así
 * que esconderla dejaba a esa persona sin poder llegar a los suyos. Sale la
 * primera y se distingue por lo que dice, no por una insignia de color.
 *
 * ## Sin tarjetas
 *
 * Era una rejilla de tarjetas con borde, fondo y esquinas redondeadas para
 * enseñar dos datos por organización. Ahora son filas con una raya punteada:
 * el mismo dispositivo de la landing y de Configuración
 * (`kyloo-design/SKILL.md` §4), sobre los tokens `--color-*` porque esta
 * pantalla sí responde al tema (§13).
 */
export default async function OrganizationsPage() {
  const organizaciones = await createServerApiClient()
    .get<OrganizationView[]>('/me/organizations')
    .catch(() => null);

  const lista = organizaciones ?? [];
  /* Quien solo tiene la personal está, a efectos de esta pantalla, empezando:
     no ha creado ninguna con nadie dentro. Se le explica qué gana antes de
     pedirle que cree una. */
  const soloLaPersonal = lista.length > 0 && lista.every((o) => o.kind === 'PERSONAL');

  return (
    <AppHeader title="Organizaciones">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 pb-8">
          <p className="max-w-xl font-serif text-base italic text-text-secondary">
            Una organización es donde vive el trabajo de un equipo. Los proyectos son de ella, no de
            quien los creó.
          </p>
          <Link
            href="/organizations/new"
            className="shrink-0 font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
          >
            Crear una organización
          </Link>
        </div>

        {organizaciones === null && (
          <p className="border-l-2 border-warning py-1 pl-4 font-sans text-sm text-text-secondary">
            No se pudieron cargar tus organizaciones. Vuelve a intentarlo en un momento.
          </p>
        )}

        {lista.length > 0 && (
          <ol className="flex flex-col border-t border-border">
            {lista.map((organizacion, i) => (
              <li key={organizacion.id}>
                <Link
                  href={`/organizations/${organizacion.id}`}
                  className="group flex items-baseline gap-5 border-b border-dotted border-border py-6 transition-colors hover:border-border-strong"
                >
                  <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-text-disabled">
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-display text-xl text-text-primary transition-colors group-hover:text-primary">
                      {organizacion.name ?? 'Sin nombre'}
                    </span>
                    <span className="font-sans text-sm text-text-secondary">
                      {organizacion.kind === 'PERSONAL'
                        ? 'Tu espacio · solo tú'
                        : `${organizacion.seatsUsed} de ${organizacion.seats} asientos`}
                      {' · '}
                      {organizacion.soyDueno
                        ? 'lo llevas tú'
                        : (organizacion.myRoleName ?? 'miembro')}
                    </span>
                  </span>

                  {/* El plan, en gris y al final: es un dato, no un titular.
                      Antes iba en una insignia de color arriba de la tarjeta. */}
                  <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-text-disabled">
                    {organizacion.tier === 'FREE' ? 'Gratis' : organizacion.tier}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {soloLaPersonal && <QueDaUnaOrganizacion />}
      </div>
    </AppHeader>
  );
}

/**
 * Qué se gana creando una.
 *
 * ⚠️ **No es relleno para tapar un hueco.** Para casi todo el mundo es la
 * primera vez que ve la palabra, y la pregunta que trae es «¿esto qué me da?».
 * Sin respuesta, nadie crea ninguna — y las tres de abajo son literalmente lo
 * que cambia al meter el trabajo en una organización.
 */
function QueDaUnaOrganizacion() {
  return (
    <section className="flex flex-col gap-5 border-t border-border pt-9">
      <h2 className="font-display text-2xl text-text-primary">¿Para qué crear una?</h2>
      <ol className="flex flex-col">
        <Razon
          n="01"
          titulo="El trabajo no se va con quien se va"
          texto="Si alguien deja el equipo, los proyectos siguen siendo de la organización."
        />
        <Razon
          n="02"
          titulo="Se entra una vez, no proyecto por proyecto"
          texto="Quien tiene asiento puede estar en cualquier proyecto de dentro."
        />
        <Razon
          n="03"
          titulo="Los papeles se definen una vez"
          texto="Quién crea proyectos, quién invita, quién ve el registro. Y las plantillas con las que nacen los proyectos nuevos."
        />
      </ol>
    </section>
  );
}

function Razon({ n, titulo, texto }: { n: string; titulo: string; texto: string }) {
  return (
    <li className="flex items-baseline gap-5 border-b border-dotted border-border py-5 last:border-b-0">
      <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-text-disabled">{n}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-lg text-text-primary">{titulo}</span>
        <span className="font-sans text-sm text-text-secondary">{texto}</span>
      </span>
    </li>
  );
}
