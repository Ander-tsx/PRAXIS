export interface SuspendedProjectNoticeProps {
  /** El motivo tal como lo escribió quien administra. */
  reason?: string | null;
  /** Si quien mira es el dueño, para ajustar a quién se dirige el texto. */
  isOwner: boolean;
}

/**
 * El aviso de un proyecto suspendido por la administración.
 *
 * ## Por qué es obligatorio y no un detalle
 *
 * Un proyecto suspendido se sigue viendo **entero**: los tableros, las tareas, los
 * comentarios. Lo único que cambia es que ninguna acción funciona. Sin este aviso la
 * pantalla es indistinguible de una donde te han quitado los permisos o de una
 * simplemente rota, y la reacción natural es pedirle permisos a quien administra el
 * proyecto — que no puede hacer nada, porque esto no lo decide él.
 *
 * Por eso el motivo se guarda en la tabla del proyecto y no solo en el registro de
 * actividad: ese registro es admin-only, así que el texto tiene que llegar hasta
 * aquí.
 *
 * ## Y por qué no oculta el contenido
 *
 * Se podría reemplazar la pantalla entera por el aviso, y sería peor: lo que hay
 * dentro sigue siendo el trabajo del equipo, consultarlo no rompe nada, y taparlo
 * convertiría una suspensión reversible en una pérdida de acceso.
 *
 * `role="status"` y no `alert`: es una condición del proyecto que ya estaba al
 * entrar, no algo que acaba de ocurrir e interrumpe.
 */
export function SuspendedProjectNotice({ reason, isOwner }: SuspendedProjectNoticeProps) {
  return (
    <section
      role="status"
      className="rounded-2xl border border-error/40 bg-error-muted px-5 py-4"
    >
      <h2 className="font-sans text-sm font-semibold text-text-primary">
        Este proyecto está suspendido por la administración
      </h2>

      <p className="mt-1 font-sans text-sm text-text-secondary">
        Se puede consultar todo, y no se puede modificar nada: ni tareas, ni
        comentarios, ni miembros.{' '}
        {isOwner
          ? 'La suspensión no la levanta el dueño del proyecto, sino quien administra la plataforma.'
          : 'No es una cuestión de permisos: pedírselos a quien administra el proyecto no lo va a resolver.'}
      </p>

      {reason && (
        <p className="mt-3 border-l-2 border-error/40 pl-3 font-sans text-sm italic text-text-secondary">
          «{reason}»
        </p>
      )}
    </section>
  );
}
