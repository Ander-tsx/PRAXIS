import { OrganizationForm } from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nueva organización',
};

/**
 * Crear una organización.
 *
 * ## Solo pide un nombre, y ese es el cambio
 *
 * 🔴 Esta pantalla empezaba preguntando **qué plan quieres y cuántos asientos
 * compras**, antes de que existiera la organización. Es una decisión comercial
 * pedida a alguien que todavía no sabe qué es esto, y por eso se leía como un
 * trámite sin sentido. Ahora se crea con nombre y nada más: nace en gratuito
 * con tres asientos, y el plan se contrata desde su portal el día que el equipo
 * o los proyectos no quepan — que es cuando ampliar significa algo.
 *
 * ## Y explica para qué sirve antes de pedir nada
 *
 * Las tres razones de abajo no son relleno: son literalmente lo que cambia al
 * meter el trabajo en una organización en vez de dejarlo colgando de una
 * persona. Quien no lo lea aquí no lo va a leer en ningún sitio.
 */
export default function NuevaOrganizacionPage() {
  return (
    <AppHeader title="Nueva organización">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <p className="max-w-xl font-serif text-base italic text-text-secondary">
          Una organización es donde vive el trabajo de un equipo. Los proyectos que se creen dentro
          son de ella, no de quien los creó.
        </p>

        {/* El dispositivo de §4: número a la izquierda, texto al centro, raya
            punteada entre filas. Ni una tarjeta. */}
        <ol className="flex flex-col">
          <Razon
            n="01"
            titulo="El trabajo no se va con quien se va"
            texto="Si alguien deja el equipo, sus proyectos siguen siendo de la organización. Se le reasigna responsable y ya."
          />
          <Razon
            n="02"
            titulo="Se entra una vez, no proyecto por proyecto"
            texto="Quien tiene asiento puede estar en cualquier proyecto de dentro. Sin asiento no entra a ninguno."
          />
          <Razon
            n="03"
            titulo="Los papeles se definen una vez"
            texto="Quién crea proyectos, quién invita, quién ve el registro. Y las plantillas con las que nacen los proyectos nuevos, para no configurar los roles quince veces."
          />
        </ol>

        <OrganizationForm />
      </div>
    </AppHeader>
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
