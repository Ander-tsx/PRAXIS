import { alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';
import { HowToRead } from './HowToRead';

export interface ChartCardProps {
  title: string;
  /** Qué significa el gráfico, en una frase. Va **siempre**: ver abajo. */
  description: string;
  /** Cifra grande a la derecha del título, si la hay. */
  highlight?: ReactNode;
  /**
   * Cómo se lee el gráfico y qué decisiones permite tomar.
   *
   * Va en un desplegable cerrado: quien ya lo entiende no lo abre nunca y quien
   * no, lo tiene a mano sin salir de la pantalla. Es la diferencia entre un
   * gráfico que se mira y uno que se usa.
   */
  howToRead?: ReactNode;
  children: ReactNode;
}

/**
 * La caja de un gráfico.
 *
 * **`description` es obligatoria a propósito.** Un gráfico sin una frase que
 * diga qué mide se interpreta mal con una seguridad enorme: quien lo mira
 * inventa la explicación que le encaja. En una sección cuyo trabajo entero es
 * decir cosas ciertas sobre el equipo, esa es la peor forma de fallar, y hacerla
 * opcional habría bastado para que la mitad se quedara sin ella.
 */
export function ChartCard({ title, description, highlight, howToRead, children }: ChartCardProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-display text-xl text-text-primary">{title}</h3>
          <p className="font-sans text-sm text-white">{description}</p>
        </div>
        {highlight && <div className="shrink-0 text-right">{highlight}</div>}
      </header>

      {children}

      {howToRead && <HowToRead>{howToRead}</HowToRead>}
    </section>
  );
}

/**
 * «Cómo se lee esto», plegado.
 *
 * Es un `<details>` nativo y no un estado de React: el navegador ya da la
 * apertura con teclado, el anuncio correcto al lector de pantalla y la búsqueda
 * dentro de la página aunque esté cerrado. Reimplementarlo sería trabajo para
 * quedarse peor.
 *
 * Cerrado por defecto, y esa es la decisión: la explicación no puede competir
 * con el gráfico ni empujarlo fuera de la pantalla, pero tampoco puede vivir en
 * una documentación que nadie va a abrir en otro sitio.


/** Cifra grande con su etiqueta. Para el hueco de `highlight` y los resúmenes. */
export function Stat({
  value,
  label,
  tone = 'primary',
}: {
  value: ReactNode;
  label: string;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'muted';
}) {
  const color = {
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    muted: colors.textSecondary,
  }[tone];

  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl leading-none tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="font-sans text-xs uppercase tracking-wider text-white">{label}</span>
    </div>
  );
}

/**
 * Lo que se enseña cuando **no hay datos suficientes para predecir**.
 *
 * Es la pieza que más importa de toda la sección. Una predicción sacada de
 * cuatro tareas parece exactamente igual de seria que una sacada de
 * cuatrocientas, así que dibujarla igualmente sería la forma más rápida de que
 * esto pierda la confianza de quien lo lee. En lugar del gráfico se dice qué
 * falta y por qué.
 */
export function NotEnoughData({
  faltanTareas,
  faltanDias,
}: {
  faltanTareas: number;
  faltanDias: number;
}) {
  const piezas = [
    faltanTareas > 0 &&
      `${faltanTareas} ${faltanTareas === 1 ? 'tarea cerrada más' : 'tareas cerradas más'}`,
    faltanDias > 0 && `${faltanDias} ${faltanDias === 1 ? 'día más' : 'días más'} de historial`,
  ].filter(Boolean) as string[];

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center"
      style={{ borderColor: colors.border }}
    >
      <p className="font-display text-lg text-text-primary">Todavía no hay suficiente historial</p>
      <p className="max-w-md font-sans text-sm text-white">
        {piezas.length > 0 ? (
          <>
            Faltan <strong className="text-text-primary">{piezas.join(' y ')}</strong>.
          </>
        ) : (
          'Faltan datos para calcular esto.'
        )}
      </p>
      <p className="max-w-md font-sans text-xs text-white">
        Se prefiere no enseñar nada a enseñar un número que parecería fiable sin serlo. El historial
        empieza a contar desde que se registró la primera tarea, no antes.
      </p>
    </div>
  );
}

/**
 * El aviso de que todo se cuenta en **días de calendario**.
 *
 * ⚠️ **Es la trampa 1 de R9 y estaba sin decir en casi toda la sección.** Ni un
 * solo número de esta pantalla descuenta fines de semana ni festivos, así que
 * una tarea que entra el viernes por la tarde arrastra dos días que nadie
 * trabajó. Mientras la sección solo enseñaba totales y medianas gruesas eso era
 * ruido; desde que hay percentiles, distribuciones y tiempo por columna **mueve
 * la mediana**, y una columna de paso rápido puede aparecer con el doble de
 * espera de la que tiene.
 *
 * Se dice en vez de arreglarse, y es una decisión: contar días laborables exige
 * saber el calendario de cada equipo —festivos, zona horaria, jornada—, que es
 * un dato que PRAXIS no tiene y que no se puede adivinar sin equivocarse. Un
 * número honesto con su límite escrito vale más que uno ajustado con una
 * suposición invisible. Es la misma regla del recorte mudo: si el dato lleva un
 * criterio dentro, el criterio se enseña.
 *
 * Vive aquí y no copiado en cada widget porque son seis sitios y la frase tiene
 * que ser la misma: en cuanto se escribe a mano, la mitad dice otra cosa.
 */
export function NotaDeDiasNaturales({ matiz }: { matiz?: ReactNode }) {
  return (
    <p>
      Se cuentan <strong>días naturales</strong>: no se descuentan fines de semana ni festivos, así
      que una tarea que entra el viernes por la tarde arrastra el fin de semana entero.{' '}
      {matiz ?? 'En tramos de horas eso mueve la mediana; en los de semanas, apenas.'}
    </p>
  );
}
