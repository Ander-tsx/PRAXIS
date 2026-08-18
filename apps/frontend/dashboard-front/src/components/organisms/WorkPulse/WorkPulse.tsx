import { IconInbox, IconOpenWork, IconOverdue, IconSoon } from '@/components/atoms/icons';
import { StatTile } from '@/components/molecules/StatTile';
import { type WorkSplit, etiquetaDeTotal } from '@/lib/work';
import { DUE_SOON_DAYS, alpha, colors } from '@praxis/commons';

export interface WorkPulseProps {
  work: WorkSplit;
  /** Avisos sin leer. `null` si la bandeja no se pudo leer. */
  sinLeer: number | null;
  /**
   * A dónde lleva la cifra de avisos, y a dónde las de tareas.
   *
   * ⚠️ **Son anclas de esta misma página (`#avisos`, `#trabajo`), así que van
   * con `<a>` y no con `next/link`** —o sea, sin `sameZone`—. Un `Link` a un
   * fragmento le pide al App Router una navegación para acabar en el sitio donde
   * ya estás: monta la transición, dispara el `loading.tsx` y encima mete una
   * entrada en el historial. Un `<a href="#…">` es lo que el navegador ya sabe
   * hacer y no cuesta nada.
   */
  hrefAvisos: string;
  hrefTrabajo: string;
}

/**
 * El pulso: cuatro cifras y el reparto de tu trabajo.
 *
 * ## Qué sustituye
 *
 * A `DashboardMetrics`, que enseñaba proyectos, espacios y miembros. Las tres
 * eran de **inventario**: decían el tamaño de tus cosas, no cambiaban ninguna
 * decisión, y ninguna llevaba a ninguna parte. El tamaño del inventario sigue
 * estando —en la tarjeta de accesos directos y en la propia rejilla de
 * proyectos, que ya lo cuenta— pero deja de ocupar la primera fila de la
 * pantalla.
 *
 * Lo que ocupa la primera fila ahora es lo que responde a «¿qué tengo que hacer
 * hoy?»: lo vencido, lo que vence, lo abierto y lo que no has leído.
 *
 * ## La barra no es un gráfico, es una regla
 *
 * Debajo de las cifras va una tira segmentada con el reparto completo. No lleva
 * ejes ni números dentro: para eso están las cifras de arriba. Lo que aporta es
 * la **proporción** —si tu trabajo es una pared roja o una franja verde de cosas
 * lejanas— que es justo lo que cuatro números en fila no dejan ver.
 *
 * ⚠️ **Vencidas y «vencen pronto» son dos segmentos, dos colores y dos
 * etiquetas** (§20.4). Aquí conviven en la misma tira, que es una decisión de
 * dibujo, pero no se suman en ningún sitio.
 */
export function WorkPulse({ work, sinLeer, hrefAvisos, hrefTrabajo }: WorkPulseProps) {
  const abiertas = etiquetaDeTotal(work.total);

  return (
    <section className="flex flex-col gap-4" aria-label="Tu pulso de trabajo">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          value={work.vencidas.length}
          label="Vencidas"
          hint={work.vencidas.length === 0 ? 'Nada fuera de plazo' : 'La fecha ya pasó'}
          tone={colors.error}
          icon={<IconOverdue />}
          href={hrefTrabajo}
        />
        <StatTile
          value={work.pronto.length}
          label="Vencen pronto"
          hint={`En los próximos ${DUE_SOON_DAYS} días`}
          tone={colors.warning}
          icon={<IconSoon />}
          href={hrefTrabajo}
        />
        <StatTile
          value={work.total}
          display={abiertas}
          label="Abiertas"
          hint="Tareas tuyas sin cerrar"
          tone={colors.primary}
          icon={<IconOpenWork />}
          href={hrefTrabajo}
        />
        <StatTile
          /* `null` es «no se pudo leer la bandeja», y se pinta como cero
             apagado: decir que tienes cero avisos cuando el gateway no
             respondió sería afirmar algo que no se sabe. El bloque de la
             bandeja, más abajo, es el que lo dice con todas las letras. */
          value={sinLeer ?? 0}
          label="Sin leer"
          hint={sinLeer === null ? 'No se pudo consultar' : 'Avisos en tu bandeja'}
          tone={colors.info}
          icon={<IconInbox />}
          href={hrefAvisos}
        />
      </div>

      {work.total > 0 && <RepartoDelTrabajo work={work} />}
    </section>
  );
}

/** Un tramo de la tira, con su color y su cuenta. */
interface Tramo {
  clave: string;
  etiqueta: string;
  cuenta: number;
  color: string;
}

function RepartoDelTrabajo({ work }: { work: WorkSplit }) {
  const tramos: Tramo[] = [
    {
      clave: 'vencidas',
      etiqueta: 'Vencidas',
      cuenta: work.vencidas.length,
      color: colors.error,
    },
    {
      clave: 'pronto',
      etiqueta: 'Esta semana',
      cuenta: work.pronto.length,
      color: colors.warning,
    },
    {
      clave: 'adelante',
      etiqueta: 'Más adelante',
      cuenta: work.masAdelante.length,
      color: colors.primary,
    },
    {
      clave: 'sin-fecha',
      etiqueta: 'Sin fecha',
      cuenta: work.sinFecha.length,
      /* Sin fecha no es un estado bueno ni malo, así que no lleva color de
         estado: gris. Teñirlo de verde diría que está bien, y de ámbar que hay
         que arreglarlo, y ninguna de las dos cosas es cierta en general. */
      color: colors.textDisabled,
    },
  ];

  const conDatos = tramos.filter((tramo) => tramo.cuenta > 0);

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface px-5 py-4">
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={conDatos
          .map((tramo) => `${tramo.cuenta} ${tramo.etiqueta.toLowerCase()}`)
          .join(', ')}
      >
        {conDatos.map((tramo) => (
          <span
            key={tramo.clave}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              /* El ancho en porcentaje del total, con `flexGrow` como reparto:
                 un tramo de una sola tarea sobre cuarenta sería medio píxel, y
                 `minWidth` le da el mínimo para que se vea que existe. */
              flexGrow: tramo.cuenta,
              minWidth: 6,
              background: tramo.color,
            }}
          />
        ))}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {conDatos.map((tramo) => (
          <li
            key={tramo.clave}
            className="flex items-center gap-1.5 font-sans text-xs text-text-secondary"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ background: tramo.color, boxShadow: `0 0 0 3px ${alpha(tramo.color, 12)}` }}
            />
            <span className="font-semibold tabular-nums text-text-primary">{tramo.cuenta}</span>
            {tramo.etiqueta.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}
