import { ACCIONES, fechaYHora } from '@/lib/admin';
import { type AdminActivityEntry, Badge } from '@praxis/commons';

/**
 * El registro, una fila por acción.
 *
 * ## Se leen los nombres, no los ids
 *
 * `actorLabel` y `targetLabel` son copias guardadas en el momento de la acción,
 * así que la fila **sigue leyéndose cuando la cuenta o el proyecto ya no
 * existen** — que es justo cuando más falta hace. Si faltara la copia, se cae al
 * id: peor de leer, pero mejor que una fila muda.
 *
 * ## El motivo se enseña entero
 *
 * Sin truncar y sin desplegable. Es el campo por el que existe este registro: la
 * respuesta a «¿por qué está suspendida esta cuenta?» no puede estar detrás de un
 * clic.
 *
 * Es un Server Component: no hay nada que interactuar, así que no se manda al
 * navegador ni un byte de JavaScript por esta tabla.
 */
export function ActivityTable({ entradas }: { entradas: AdminActivityEntry[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="hidden border-b border-border bg-surface px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-text-secondary md:grid md:grid-cols-[1fr_1.2fr_1.2fr_2fr] md:gap-4">
        <span>Cuándo</span>
        <span>Quién</span>
        <span>Qué, y sobre quién</span>
        <span>Por qué</span>
      </div>

      <ul>
        {entradas.map((entrada) => {
          const accion = ACCIONES[entrada.action];
          const rol = typeof entrada.metadata?.role === 'string' ? entrada.metadata.role : null;

          return (
            <li
              key={entrada.id}
              className="flex flex-col gap-2 border-b border-border px-4 py-4 last:border-b-0 md:grid md:grid-cols-[1fr_1.2fr_1.2fr_2fr] md:items-start md:gap-4"
            >
              <p className="font-sans text-xs text-text-secondary">
                {fechaYHora(entrada.createdAt)}
              </p>

              <p className="truncate font-sans text-sm text-text-primary">
                {entrada.actorLabel || entrada.actorId}
              </p>

              <div className="flex flex-col gap-1">
                <Badge variant={accion?.variante ?? 'default'}>
                  {accion?.etiqueta ?? entrada.action}
                </Badge>
                <p className="truncate font-sans text-sm text-text-primary">
                  {entrada.targetLabel || entrada.targetId}
                </p>
                {rol && (
                  <p className="font-sans text-xs text-text-secondary">
                    Rol resultante: <span className="text-text-primary">{rol}</span>
                  </p>
                )}
              </div>

              <p className="font-serif text-sm text-text-secondary">
                {entrada.reason || <span className="text-text-disabled">Sin motivo anotado</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
