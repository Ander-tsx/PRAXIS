import { PRAX_NAME, PraxAvatar, alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';

export interface PraxHeroProps {
  /** El nombre de quien mira, para saludar. Vacío si la cuenta no tiene. */
  nombre?: string;
  /** El proyecto del que se va a hablar, si hay alguno. */
  proyecto?: string;
}

/**
 * La portada del asistente: quién es y qué sabe hacer.
 *
 * ## Por qué hay portada, si debajo hay un chat
 *
 * Porque un cuadro de texto vacío no dice qué se le puede pedir. En Análisis eso
 * no importaba —el asistente estaba rodeado de gráficos, así que se entendía que
 * iba de eso— pero con pantalla propia la primera pregunta de quien llega es
 * literalmente «¿y esto para qué sirve?».
 *
 * ## La forma: una banda, no una lista de tarjetas
 *
 * La primera versión era una cabecera y cuatro tarjetas con borde en fila. Se
 * leía como un panel de estadísticas —cuatro cajas iguales alineadas— y las
 * capacidades de alguien no son estadísticas. Ahora es **una sola banda** con la
 * cara grande dentro, tratada como una presentación: fondo tenue de la marca,
 * las capacidades como frases dentro del mismo bloque, y el aviso de que propone
 * y no ejecuta cerrándolo.
 *
 * Lo que se gana es que la pantalla arranca con **una** cosa y no con cinco, y
 * que el chat de debajo queda como lo siguiente que se lee, no como la sexta
 * caja de una rejilla.
 */
export function PraxHero({ nombre, proyecto }: PraxHeroProps) {
  const saludo = nombre?.trim() ? `Hola, ${nombre.trim().split(' ')[0]}` : `Hola, soy ${PRAX_NAME}`;

  return (
    <header
      className="relative overflow-hidden rounded-3xl border p-6 sm:p-8"
      style={{
        borderColor: alpha(colors.primary, 22),
        /* Un halo en diagonal desde la esquina donde está la cara, no un fondo
           plano: da el color de la marca sin teñir el texto. Mismo recurso que
           `NoticePanel` en el panel, para que las dos pantallas se lean como la
           misma aplicación. */
        background: `radial-gradient(120% 130% at 0% 0%, ${alpha(colors.primary, 12)}, transparent 60%), ${colors.surface}`,
      }}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-5">
          <PraxAvatar mood="idle" size="lg" />

          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="font-display text-3xl text-text-primary sm:text-4xl">{saludo}</h2>
            <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
              {proyecto
                ? `Sé lo que pasa en «${proyecto}». Pregúntame por sus números, o dime qué hay que hacer y te lo preparo.`
                : 'Leo los datos de tus proyectos y te propongo el trabajo. Tú decides qué se hace.'}
            </p>
          </div>
        </div>

        {/**
         * Las cuatro capacidades, en línea y separadas por un punto.
         *
         * No son adorno: son las que **no se descubrían** cuando el asistente
         * vivía en una esquina de Análisis. Que proponga tareas, que reparta
         * trabajo o que escriba al chat del equipo no se le ocurre a nadie
         * mirando un panel de percentiles.
         */}
        <ul className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <Capacidad>Responde con los datos del proyecto</Capacidad>
          <Capacidad>Propone tareas y checklists</Capacidad>
          <Capacidad>Reparte y mueve trabajo</Capacidad>
          <Capacidad>Escribe comentarios y avisos al equipo</Capacidad>
        </ul>

        {/**
         * ⚠️ **La línea más importante de la pantalla.**
         *
         * Que PRAX propone y no ejecuta es la invariante que sostiene todo lo
         * demás (§26.1): decirlo **antes** de la primera pregunta es lo que hace
         * que aceptar una propuesta sea una decisión y no una sorpresa.
         */}
        <p
          className="rounded-xl border px-4 py-3 font-sans text-sm text-text-secondary"
          style={{ borderColor: alpha(colors.primary, 18), background: alpha(colors.primary, 5) }}
        >
          <strong className="text-text-primary">Propone; no ejecuta.</strong> Cada sugerencia llega
          como una tarjeta con su botón, y aceptar hace exactamente lo mismo que harías tú a mano:
          con tu sesión, tus permisos y por los mismos sitios. Lo que tú no puedas hacer,{' '}
          {PRAX_NAME} tampoco lo propone.
        </p>
      </div>
    </header>
  );
}

/** Una capacidad, como píldora. Sin icono: cuatro iconos seguidos son ruido. */
function Capacidad({ children }: { children: ReactNode }) {
  return (
    <li
      className="rounded-full px-3 py-1.5 font-sans text-xs text-text-secondary"
      style={{
        background: alpha(colors.textSecondary, 8),
        boxShadow: `inset 0 0 0 1px ${alpha(colors.border, 90)}`,
      }}
    >
      {children}
    </li>
  );
}
