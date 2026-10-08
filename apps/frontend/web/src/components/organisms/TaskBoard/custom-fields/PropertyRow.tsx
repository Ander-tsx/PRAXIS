import { SECTION_CLASS, SECTION_TITLE_CLASS } from '../section-panel';

/**
 * Un bloque de propiedades del panel de tarea, con su encabezado.
 *
 * La jerarquía del panel la ponen estos bloques, no rayas entre filas: un
 * encabezado pequeño en versalitas dice qué hay dentro, y un fondo apenas más
 * claro agrupa lo que va junto.
 *
 * Dentro, una **rejilla de dos columnas** desde `sm`: los campos cortos
 * (prioridad, fecha, un número) van de dos en dos y los largos (encargados,
 * etiquetas, un texto) ocupan la fila entera (`wide`). En el teléfono, una.
 *
 * `action` va a la derecha del encabezado: el «+ Añadir campo».
 */
export function PropertyGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={SECTION_CLASS}>
      <header className="flex min-h-6 items-center justify-between gap-2 px-1">
        <h3 className={SECTION_TITLE_CLASS}>{title}</h3>
        {action}
      </header>
      <div className="grid grid-cols-1 gap-x-3 gap-y-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.06] ring-inset sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

/**
 * Una propiedad: el nombre **encima** y el campo debajo, a todo el ancho.
 *
 * Fue nombre a la izquierda y valor a la derecha, y el dueño del producto lo
 * vio desequilibrado —todo el peso cargado a un lado, los desplegables
 * apretados en la mitad— (2026-10-08). Encima, el nombre se lee igual y el
 * campo aprovecha la anchura.
 *
 * Con `htmlFor`, el nombre es un `<label>` de verdad y da nombre accesible al
 * control. Sin él —un control que ya se nombra solo— es texto.
 *
 * `action` va a la derecha del nombre: el engranaje de un campo personalizado,
 * o «Gestionar» en las etiquetas. Siempre visible: en el teléfono no hay hover
 * que la descubra.
 */
export function PropertyRow({
  label,
  icon,
  htmlFor,
  action,
  wide = false,
  children,
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  htmlFor?: string;
  action?: React.ReactNode;
  /** Ocupa las dos columnas: listas de fichas, textos. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const name = (
    <span className="truncate" title={typeof label === 'string' ? label : undefined}>
      {label}
    </span>
  );
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="flex min-h-5 min-w-0 items-center gap-1.5 font-sans text-xs font-medium text-text-secondary">
        {icon && <span className="text-text-secondary/80 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        {htmlFor ? (
          <label htmlFor={htmlFor} className="min-w-0 truncate">
            {name}
          </label>
        ) : (
          name
        )}
        {action && <span className="ml-auto flex shrink-0 items-center">{action}</span>}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
