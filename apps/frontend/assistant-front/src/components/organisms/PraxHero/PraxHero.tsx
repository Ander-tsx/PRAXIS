import { PRAX_NAME, PraxAvatar, alpha, colors } from '@praxis/commons';

/**
 * La portada de PRAX: quién es y qué sabe hacer.
 *
 * ## Por qué hay portada, si debajo hay un chat
 *
 * Porque un cuadro de texto vacío no dice qué se le puede pedir. En Análisis eso
 * no importaba —el asistente estaba rodeado de gráficos, así que se entendía que
 * iba de eso— pero con pantalla propia la primera pregunta de quien llega es
 * literalmente «¿y esto para qué sirve?».
 *
 * Las cuatro capacidades no son adorno: son las que **no se descubrían** cuando
 * el asistente vivía en una esquina de Análisis. Que proponga tareas, que
 * reparta trabajo o que escriba al chat del equipo no se le ocurre a nadie
 * mirando un panel de percentiles.
 *
 * ⚠️ **Y la última línea es la más importante de la pantalla.** Que PRAX propone
 * y no ejecuta es la invariante que sostiene todo lo demás (§26.1): decirlo
 * antes de la primera pregunta es lo que hace que aceptar una propuesta sea una
 * decisión y no una sorpresa.
 */
export function PraxHero() {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <PraxAvatar mood="idle" size="lg" />

        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
            Hola, soy {PRAX_NAME}
          </h2>
          <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
            Leo los datos de tus proyectos y te propongo el trabajo. Tú decides qué se hace.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Capacidad
          titulo="Responder con datos"
          detalle="Cuánto hay, dónde se atasca, cuánto tarda y qué cabe esperar."
        />
        <Capacidad
          titulo="Proponer trabajo"
          detalle="Tareas, checklists, cambios de prioridad o de fecha."
        />
        <Capacidad
          titulo="Repartir y mover"
          detalle="Quién puede coger qué, según su carga y lo que ya ha hecho."
        />
        <Capacidad
          titulo="Escribir por ti"
          detalle="Un comentario en una tarea o un mensaje al chat del equipo."
        />
      </ul>

      <p
        className="rounded-xl px-4 py-3 font-sans text-sm text-text-secondary"
        style={{ background: alpha(colors.primary, 7) }}
      >
        <strong className="text-text-primary">Propone; no ejecuta.</strong> Cada sugerencia llega
        como una tarjeta con su botón, y aceptar hace exactamente lo mismo que harías tú a mano: con
        tu sesión, tus permisos y por los mismos sitios. Si no puedes hacer algo, {PRAX_NAME}{' '}
        tampoco lo propone.
      </p>
    </header>
  );
}

function Capacidad({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
      <span className="font-sans text-sm font-semibold text-text-primary">{titulo}</span>
      <span className="font-sans text-xs text-text-secondary">{detalle}</span>
    </li>
  );
}
