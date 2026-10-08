import { SECTION_CLASS, SECTION_TITLE_CLASS } from '../section-panel';

/**
 * Un bloque de propiedades del panel de tarea, con su encabezado.
 *
 * La jerarquía del panel la ponen estos bloques, no rayas entre filas: un
 * encabezado pequeño en versalitas dice qué hay dentro, y un fondo apenas más
 * claro agrupa las filas que van juntas. Con una raya entre cada fila, todas
 * pesaban lo mismo y el panel se leía como una lista sin orden.
 *
 * `action` va a la derecha del encabezado: el «+ Añadir» de los campos.
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
      <div className="flex flex-col rounded-xl bg-white/[0.025] p-1 ring-1 ring-inset ring-white/[0.06]">
        {children}
      </div>
    </section>
  );
}

/**
 * Una fila de propiedad: icono y nombre a la izquierda, el valor a la derecha.
 *
 * Con `htmlFor`, el nombre es un `<label>` de verdad y da nombre accesible al
 * control. Sin él —un control que ya se nombra solo, o un grupo— es texto.
 *
 * `action` aparece al pasar por encima, junto al nombre: el engranaje para
 * configurar un campo personalizado.
 */
export function PropertyRow({
  label,
  icon,
  htmlFor,
  action,
  children,
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  htmlFor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const name = (
    <span className="truncate" title={typeof label === 'string' ? label : undefined}>
      {label}
    </span>
  );
  /**
   * ⚠️ **En el teléfono, apilada**: el nombre arriba y el valor debajo, a todo
   * el ancho. A 390 px, dos columnas dejaban al valor en ~230 px: la fecha se
   * partía en dos líneas, «Reviewer» se cortaba y la lista de personas no cabía.
   */
  return (
    <div className="group/row grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-2 rounded-lg px-2 py-0.5 transition-colors hover:bg-white/[0.03] max-sm:grid-cols-1 max-sm:gap-0 max-sm:py-1.5">
      <span className="flex min-h-9 min-w-0 items-center gap-2 font-sans text-[13px] text-text-secondary max-sm:min-h-6 max-sm:text-xs">
        {icon && <span className="text-text-secondary/80">{icon}</span>}
        {htmlFor ? (
          <label htmlFor={htmlFor} className="min-w-0 truncate">
            {name}
          </label>
        ) : (
          name
        )}
        {action && (
          <span className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
            {action}
          </span>
        )}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
