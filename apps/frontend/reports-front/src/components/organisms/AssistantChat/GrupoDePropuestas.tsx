'use client';

import { alpha, colors } from '@praxis/commons';
import { Children, type ReactNode, useCallback, useMemo, useState } from 'react';
import { type Estado, RegistroDeEstado, SenalDeAceptarTodas } from './ProposalCard';

/** A partir de cuántas propuestas deja de compensar apilarlas. */
const MINIMO_PARA_APILAR = 2;

/**
 * Las propuestas de un turno, apiladas como un mazo de cartas.
 *
 * Salían una debajo de otra, y con cinco tareas propuestas el hilo se convertía
 * en una tira interminable: para llegar a la quinta había que pasar por encima
 * de las cuatro anteriores, y no se veía de un vistazo cuántas había ni cuáles
 * quedaban por decidir.
 *
 * Ahora se ve **una cada vez**, con las siguientes asomando por debajo, y se
 * pasa entre ellas con las flechas o pulsando su punto. Ocupa lo que una sola
 * tarjeta.
 *
 * ### Aceptar todas
 *
 * Solo alcanza a las que siguen **pendientes**. Si descartaste la tercera y
 * luego pulsas «Aceptar todas», la tercera se queda descartada: cada tarjeta
 * comprueba su propio estado antes de reaccionar a la señal (ver `Marco`), así
 * que una decisión ya tomada no se pisa nunca.
 *
 * No hay transacción, y no la debe haber: cada tarjeta aplica su acción con sus
 * permisos, y si una falla —columna borrada, permiso retirado— enseña su error
 * mientras las demás siguen.
 */
export interface GrupoDePropuestasProps {
  children: ReactNode;
}

export function GrupoDePropuestas({ children }: GrupoDePropuestasProps) {
  const tarjetas = Children.toArray(children);
  const total = tarjetas.length;

  const [indice, setIndice] = useState(0);
  const [senal, setSenal] = useState(0);
  const [estados, setEstados] = useState<Record<number, Estado>>({});

  /**
   * Un registrador por posición, estable entre renders.
   *
   * Sin `useMemo` sería una función nueva en cada render, el efecto que la usa
   * dentro de cada tarjeta se dispararía sin parar y el estado se actualizaría
   * en bucle. Depende solo de `total`: mientras no cambie el número de
   * propuestas, son las mismas funciones.
   */
  const registradores = useMemo(
    () =>
      Array.from({ length: total }, (_, posicion) => (estado: Estado) => {
        setEstados((previos) =>
          previos[posicion] === estado ? previos : { ...previos, [posicion]: estado },
        );
      }),
    [total],
  );

  /**
   * Sin decidir: ni aceptadas, ni descartadas, ni en vuelo.
   *
   * `enviando` se cuenta aparte y no aquí. Metida en el saco de las pendientes,
   * el botón seguiría diciendo «aceptar las 3» mientras esas 3 se están
   * aceptando, y volver a pulsarlo no haría nada — un botón que no responde es
   * peor que uno que no está.
   */
  const pendientes = tarjetas.filter(
    (_, posicion) => (estados[posicion] ?? 'pendiente') === 'pendiente',
  ).length;

  const enviando = tarjetas.some((_, posicion) => estados[posicion] === 'enviando');

  const ir = useCallback(
    (destino: number) => setIndice(Math.max(0, Math.min(total - 1, destino))),
    [total],
  );

  /* Con una sola no hay mazo que pasar ni nada que aceptar en bloque: se pinta
     tal cual, sin cabecera ni marco, como estaba antes. */
  if (total < MINIMO_PARA_APILAR) {
    return <div className="flex flex-col gap-3">{children}</div>;
  }

  return (
    <section
      aria-label={`${total} propuestas del asistente`}
      className="flex flex-col gap-3 rounded-2xl border p-3"
      style={{ borderColor: alpha(colors.primary, 22), background: alpha(colors.primary, 4) }}
    >
      <header className="flex flex-wrap items-center gap-2 px-1">
        <span className="font-sans text-sm font-medium text-text-primary">
          {indice + 1} de {total}
        </span>

        <span className="flex items-center gap-1">
          <Flecha direccion={-1} disabled={indice === 0} onClick={() => ir(indice - 1)} />
          <Flecha direccion={1} disabled={indice === total - 1} onClick={() => ir(indice + 1)} />
        </span>

        {/* Los puntos dicen dos cosas a la vez: cuántas hay y cuáles ya se
            decidieron. Con cinco propuestas, saber que te quedan dos sin tocar
            es la mitad de la información que hace falta. */}
        <span className="flex items-center gap-1.5">
          {tarjetas.map((tarjeta, posicion) => {
            const estado = estados[posicion] ?? 'pendiente';
            const clave = typeof tarjeta === 'object' && 'key' in tarjeta ? tarjeta.key : posicion;

            return (
              <button
                key={clave}
                type="button"
                onClick={() => ir(posicion)}
                aria-label={`Ver la propuesta ${posicion + 1} de ${total}`}
                aria-current={posicion === indice}
                className="cursor-pointer rounded-full p-1 transition-transform hover:scale-125"
              >
                <span
                  className="block h-2 w-2 rounded-full transition-colors"
                  style={{
                    background:
                      estado === 'hecho'
                        ? colors.success
                        : estado === 'descartada'
                          ? colors.textDisabled
                          : posicion === indice
                            ? colors.primary
                            : alpha(colors.primary, 35),
                  }}
                />
              </button>
            );
          })}
        </span>

        {enviando ? (
          <span className="ml-auto font-sans text-xs text-text-secondary">Aceptando…</span>
        ) : (
          pendientes > 1 && (
            <button
              type="button"
              onClick={() => setSenal((actual) => actual + 1)}
              className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: colors.primary, color: colors.primaryForeground }}
            >
              Aceptar las {pendientes} pendientes
            </button>
          )
        )}
      </header>

      {/**
       * El mazo.
       *
       * ⚠️ **Todas las tarjetas se mantienen montadas**, solo que las que no
       * tocan van ocultas con `hidden`. Desmontarlas perdería su estado: la
       * tercera aceptada volvería a ofrecer su botón al pasar por ella otra vez,
       * y peor, «Aceptar todas» dejaría de alcanzar a las que no estuvieran a la
       * vista, porque solo reacciona quien está en el árbol.
       *
       * Los dos rectángulos de detrás son adorno: copian el hueco de la tarjeta
       * activa desplazado hacia abajo y algo más estrecho, que es lo que dibuja
       * el mazo. No reciben clics.
       */}
      <div className="relative pb-4">
        {total > 2 && <Capa margenLateral={24} desde={0} opacidad={0.45} />}
        <Capa margenLateral={12} desde={8} opacidad={0.75} />

        <div className="relative">
          {tarjetas.map((tarjeta, posicion) => {
            const clave = typeof tarjeta === 'object' && 'key' in tarjeta ? tarjeta.key : posicion;

            return (
              <div key={clave} className={posicion === indice ? undefined : 'hidden'}>
                <RegistroDeEstado.Provider value={registradores[posicion]}>
                  <SenalDeAceptarTodas.Provider value={senal}>
                    {tarjeta}
                  </SenalDeAceptarTodas.Provider>
                </RegistroDeEstado.Provider>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Una de las cartas de detrás del mazo.
 *
 * ⚠️ **Vive entera en el relleno inferior del contenedor y no toca la tarjeta.**
 *
 * La primera versión era un `inset-0` con `scale()`, que parecía lo natural:
 * copiar el hueco de la tarjeta y encogerlo. Pero `scale()` encoge **desde el
 * centro**, así que la capa se metía por dentro de los cuatro lados, y como el
 * fondo de la tarjeta es translúcido —un 6 % de primario— se veía a través de
 * ella: un rectángulo fantasma flotando encima del contenido.
 *
 * Con geometría explícita no hay solape que transparentar. La capa ocupa una
 * franja de 8 px justo debajo de la tarjeta, más estrecha por los lados, y eso
 * es todo lo que hace falta para que se lea como un mazo. Solo redondea abajo:
 * arriba nace pegada a lo que tiene encima.
 */
function Capa({
  margenLateral,
  desde,
  opacidad,
}: {
  /** Cuánto se estrecha por cada lado. Cuanto más al fondo, más estrecha. */
  margenLateral: number;
  /** Píxeles desde el borde inferior del contenedor. */
  desde: number;
  opacidad: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute h-2 rounded-b-xl border border-t-0"
      style={{
        left: margenLateral,
        right: margenLateral,
        bottom: desde,
        borderColor: alpha(colors.primary, 25),
        background: colors.surface,
        opacity: opacidad,
      }}
    />
  );
}

function Flecha({
  direccion,
  disabled,
  onClick,
}: {
  direccion: -1 | 1;
  disabled: boolean;
  onClick: () => void;
}) {
  const texto = direccion === -1 ? 'Propuesta anterior' : 'Propuesta siguiente';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={texto}
      title={texto}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={direccion === -1 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );
}
