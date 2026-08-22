import { AppHeader, Badge, Button, alpha, colors } from '@praxis/commons';
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
 * ## Esta pantalla tiene que explicar qué es una organización
 *
 * No es una lista más: para casi todo el mundo es la primera vez que ve la
 * palabra, y la pregunta que trae es «¿esto qué me da?». Si solo enseñara
 * tarjetas, la respuesta sería «no sé» — y quien no sabe qué gana, no contrata.
 * Por eso el vacío es la mitad de la pantalla y dice lo que otorga y lo que no.
 *
 * ⚠️ **La personal no sale, y no es un olvido.** Todo el mundo tiene una —es lo
 * que hace que «¿cuál es tu plan?» tenga una sola forma en todo el sistema—
 * pero no tiene nombre, no admite miembros y no hay nada que gestionar en ella.
 */
export default async function OrganizationsPage() {
  const organizaciones = await createServerApiClient()
    .get<OrganizationView[]>('/me/organizations')
    .catch(() => null);

  const vacio = organizaciones !== null && organizaciones.length === 0;

  return (
    <AppHeader title="Organizaciones">
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-2xl font-sans text-sm text-text-secondary">
            Una organización es <strong className="text-text-primary">quien paga</strong> un plan de
            equipo: tiene asientos, gente dentro y su propio registro de lo cobrado. Mientras
            alguien esté dentro, los topes del plan son los suyos.
          </p>
          {!vacio && (
            <Link href="/organizations/new">
              <Button type="button">Crear una organización</Button>
            </Link>
          )}
        </div>

        {organizaciones === null && (
          <p className="rounded-2xl border border-border bg-surface-elevated px-5 py-4 font-sans text-sm text-text-secondary">
            No se pudieron cargar tus organizaciones. Vuelve a intentarlo en un momento.
          </p>
        )}

        {vacio && <Vacio />}

        {organizaciones && organizaciones.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {organizaciones.map((organizacion) => (
              <li key={organizacion.id}>
                <Tarjeta organizacion={organizacion} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppHeader>
  );
}

/**
 * Lo que se ve sin ninguna organización.
 *
 * ⚠️ **Dice también lo que NO cambia**, y esa frase es la importante: quien lee
 * «organización» piensa que sus proyectos se van a mover de sitio o que alguien
 * va a poder entrar en ellos. No pasa ninguna de las dos cosas —el plan es una
 * capa aparte de los permisos— y callárselo es dejar que lo descubra con miedo.
 */
function Vacio() {
  return (
    <section
      className="flex flex-col gap-6 rounded-3xl border p-7 sm:p-9"
      style={{
        borderColor: alpha(colors.primary, 25),
        background: `linear-gradient(160deg, ${alpha(colors.primary, 6)}, transparent 70%)`,
      }}
    >
      <div className="flex flex-col gap-2">
        <h2 className="font-sans text-xl font-semibold text-text-primary">
          Todavía no perteneces a ninguna
        </h2>
        <p className="max-w-2xl font-sans text-sm text-text-secondary">
          Si te han invitado a una, abre el enlace que te pasaron. Si quieres contratar un plan para
          tu equipo, empieza creándola.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Columna
          titulo="Lo que te da"
          tono={colors.primary}
          puntos={[
            'Un plan que pagas una vez y vale para todo el equipo.',
            'Asientos: decides cuánta gente entra, y se cobra por eso.',
            'Invitas por correo y quitas a quien quieras, cuando quieras.',
            'El registro de todo lo que se ha cobrado, con su fecha.',
          ]}
        />
        <Columna
          titulo="Lo que NO cambia"
          tono={colors.textSecondary}
          puntos={[
            'Tus proyectos siguen siendo tuyos y donde están.',
            'Estar dentro no da acceso a ningún tablero: eso son los permisos de cada proyecto.',
            'Cada persona gasta su propia cuota de PRAX, no una común.',
            'Al salir del equipo no se borra nada de lo que hiciste.',
          ]}
        />
      </div>

      <div>
        <Link href="/organizations/new">
          <Button type="button">Crear una organización</Button>
        </Link>
      </div>
    </section>
  );
}

function Columna({
  titulo,
  puntos,
  tono,
}: {
  titulo: string;
  puntos: string[];
  tono: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-disabled">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-2">
        {puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2.5 font-sans text-sm text-text-primary">
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tono }}
            />
            <span className="min-w-0">{punto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tarjeta({ organizacion }: { organizacion: OrganizationView }) {
  const sinPlan = organizacion.tier === 'FREE';
  const libres = organizacion.seats - organizacion.seatsUsed;
  const proporcion = Math.min(organizacion.seatsUsed / Math.max(organizacion.seats, 1), 1);

  return (
    <Link
      href={`/organizations/${organizacion.id}`}
      className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-sans text-base font-semibold text-text-primary">
          {organizacion.name ?? 'Sin nombre'}
        </h2>
        <Badge variant={organizacion.myRole === 'OWNER' ? 'primary' : 'default'}>
          {TEXTO_DE_PAPEL[organizacion.myRole]}
        </Badge>
        {/* ⚠️ Una organización sin plan pagado no se distingue de una con él si
            solo se enseña el nombre, y la diferencia es que la primera funciona
            con las cuotas del plan gratuito. Se dice en la tarjeta, no dentro. */}
        {sinPlan && <Badge variant="warning">Sin plan</Badge>}
      </div>

      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between font-sans text-sm">
          <span className="text-text-secondary">Asientos</span>
          <span className="tabular-nums text-text-primary">
            {organizacion.seatsUsed} de {organizacion.seats}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: alpha(colors.textSecondary, 12) }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(Math.round(proporcion * 100), 3)}%`,
              background: libres > 0 ? colors.primary : colors.warning,
            }}
          />
        </div>
        <span className="font-sans text-xs text-text-disabled">
          {libres > 0
            ? `Quedan ${libres} libres, contando las invitaciones sin responder.`
            : 'No queda ninguno libre.'}
        </span>
      </div>
    </Link>
  );
}
