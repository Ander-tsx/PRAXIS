import { ACCIONES, fechaYHora } from '@/lib/admin/admin';
import { type AdminActivityEntry, Badge, type DataColumn, DataTable } from '@praxis/commons';

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
 * navegador ni un byte de JavaScript por esta tabla. `DataTable` no tiene estado
 * ni efectos justamente para poder usarse así, y por eso las columnas se
 * construyen aquí sin `useMemo` — un hook lo convertiría en cliente.
 *
 * ## ⚠️ No tenía `auto`, y aun así podía descuadrar
 *
 * Su plantilla era `1fr_1.2fr_1.2fr_2fr`, sin ninguna pista de contenido, y por
 * eso era la menos rota de las tres. Pero un `1fr` de CSS Grid es en realidad
 * `minmax(auto, 1fr)`: basta un correo largo sin espacios en una fila para que la
 * pista crezca **solo en esa rejilla** y la cabecera deje de coincidir. `Track`
 * lo cierra emitiendo siempre `minmax(0, …)`.
 */
export function ActivityTable({ entradas }: { entradas: AdminActivityEntry[] }) {
  const columnas: DataColumn<AdminActivityEntry>[] = [
    {
      key: 'cuando',
      header: 'Cuándo',
      track: { fr: 1 },
      cell: (entrada) => (
        <p className="font-sans text-xs text-white">{fechaYHora(entrada.createdAt)}</p>
      ),
    },
    {
      key: 'quien',
      header: 'Quién',
      track: { fr: 1.2 },
      cell: (entrada) => (
        <p className="truncate font-sans text-sm text-text-primary">
          {entrada.actorLabel || entrada.actorId}
        </p>
      ),
    },
    {
      key: 'que',
      header: 'Qué, y sobre quién',
      mobileLabel: 'Qué',
      track: { fr: 1.4 },
      cell: (entrada) => {
        const accion = ACCIONES[entrada.action];
        const rol = typeof entrada.metadata?.role === 'string' ? entrada.metadata.role : null;

        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Badge variant={accion?.variante ?? 'default'}>
              {accion?.etiqueta ?? entrada.action}
            </Badge>
            <p className="w-full truncate font-sans text-sm text-text-primary">
              {entrada.targetLabel || entrada.targetId}
            </p>
            {rol && (
              <p className="font-sans text-xs text-white">
                Rol resultante: <span className="text-text-primary">{rol}</span>
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'porque',
      header: 'Por qué',
      track: { fr: 2 },
      cell: (entrada) => (
        <p className="font-serif text-sm text-white">
          {entrada.reason || <span className="text-white">Sin motivo anotado</span>}
        </p>
      ),
    },
  ];

  return (
    <DataTable
      columns={columnas}
      rows={entradas}
      rowKey={(entrada) => entrada.id}
      /* `start`: el motivo puede ocupar tres líneas y la fecha una. Centradas,
         las otras tres columnas quedarían flotando a media altura. */
      align="start"
      ariaLabel="Registro de actividad de administración"
    />
  );
}
