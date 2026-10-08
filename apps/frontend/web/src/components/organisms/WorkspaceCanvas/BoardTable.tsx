'use client';

import { reorderCustomFieldsAction } from '@/app/(privado)/projects/[id]/field-actions';
import {
  Avatar,
  type Board,
  type Column,
  type ColumnColor,
  type CustomField,
  DONE_COLUMN_COLOR,
  type Label as LabelType,
  PRIORITY_LABELS,
  type Priority,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  dueState,
  fieldSortKey,
  fieldValueOf,
  personLabel,
  useEsMovil,
} from '@praxis/commons';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { TaskDialog } from '../TaskBoard/TaskDialog';
import { AnchoredPanel, FieldEditor, useFieldValue } from '../TaskBoard/custom-fields/FieldEditor';
import { FieldSettings } from '../TaskBoard/custom-fields/FieldSettings';
import { FieldValueView } from '../TaskBoard/custom-fields/FieldValueView';
import { useProjectFields } from '../TaskBoard/custom-fields/ProjectFieldsContext';
import { useTaskDialog } from '../TaskBoard/useTaskDialog';

export interface BoardTableProps {
  board: Board;
  projectId: string;
  tasks: Task[];
  members: UserProfile[];
  labels: LabelType[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  openTaskId?: string | null;
  canMoveTask: boolean;
  canComment: boolean;
  canManageLabels: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
}

/**
 * Por qué se puede ordenar. Un campo personalizado ordena como
 * `` `campo:${id}` ``: su columna existe solo si el proyecto lo tiene.
 */
type Col = 'titulo' | 'columna' | 'vencimiento' | 'prioridad' | `campo:${string}`;

/** Las seis columnas de la tabla, en orden. Las que ordenan llevan `orden`. */
type ColumnaDeTabla =
  | 'titulo'
  | 'columna'
  | 'encargados'
  | 'etiquetas'
  | 'vencimiento'
  | 'prioridad';

const COLUMNAS: { id: ColumnaDeTabla; titulo: string; orden?: Col }[] = [
  { id: 'titulo', titulo: 'Tarea', orden: 'titulo' },
  { id: 'columna', titulo: 'Columna', orden: 'columna' },
  { id: 'encargados', titulo: 'Encargados' },
  { id: 'etiquetas', titulo: 'Etiquetas' },
  { id: 'vencimiento', titulo: 'Vence', orden: 'vencimiento' },
  { id: 'prioridad', titulo: 'Prioridad', orden: 'prioridad' },
];

/**
 * El ancho de cada columna, por clave: las seis fijas por su nombre y los
 * campos personalizados como `` `campo:${id}` ``.
 */
type Anchos = Record<string, number>;

/** Lo que mide de entrada la columna de un campo personalizado. */
const ANCHO_CAMPO = 160;
/** La columna del «+» que añade un campo. */
const ANCHO_AÑADIR = 48;

const ANCHOS_POR_DEFECTO: Record<ColumnaDeTabla, number> = {
  titulo: 380,
  columna: 160,
  encargados: 140,
  etiquetas: 200,
  vencimiento: 120,
  prioridad: 120,
};
const ANCHO_MIN = 72;
const ANCHO_MAX = 960;

/**
 * Los anchos que eligió cada persona, **por persona y en este navegador**.
 *
 * `localStorage` y no el servidor: es cómo prefiere mirar la tabla quien la
 * mira, no un dato del tablero, y no hay ruta donde guardarlo. La clave lleva
 * el id de usuario para que dos cuentas en el mismo navegador no se pisen.
 * Se lee después de montar —el servidor no lo tiene—, así que la primera
 * pintura sale con los anchos por defecto y se corrige al hidratar.
 */
function claveDeAnchos(userId: string) {
  return `praxis:tabla:anchos:${userId}`;
}

function leerAnchos(userId: string): Anchos {
  try {
    const crudo = window.localStorage.getItem(claveDeAnchos(userId));
    if (!crudo) return ANCHOS_POR_DEFECTO;
    const guardado = JSON.parse(crudo) as Partial<Record<string, unknown>>;
    const r: Anchos = { ...ANCHOS_POR_DEFECTO };
    /* Todas las claves guardadas, no solo las fijas: también las de los campos
       personalizados. Una de un campo que ya no existe no estorba. */
    for (const [id, v] of Object.entries(guardado)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        r[id] = Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Math.round(v)));
      }
    }
    return r;
  } catch {
    return ANCHOS_POR_DEFECTO;
  }
}

/** Mientras se arrastra un borde: el cursor de redimensionar en toda la página y sin seleccionar texto. */
function cursorDeRedimension(activo: boolean) {
  document.body.style.cursor = activo ? 'col-resize' : '';
  document.body.style.userSelect = activo ? 'none' : '';
}

function guardarAnchos(userId: string, anchos: Anchos) {
  try {
    window.localStorage.setItem(claveDeAnchos(userId), JSON.stringify(anchos));
  } catch {
    /* Sin almacenamiento (ventana privada, cuota): se pierde al recargar y ya. */
  }
}
const PRIORIDAD_ORDEN: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

/** Mismo reparto de respaldo que `BoardColumns`: solo entra en juego si `color` no se reconoce. */
const COLUMN_TINTS = [colors.primary, colors.accent, colors.info, colors.success, colors.warning];

function tintOf(color: ColumnColor, index: number): string {
  return colors[color] ?? COLUMN_TINTS[index % COLUMN_TINTS.length];
}

/**
 * La vista de **tabla** del tablero: una fila por tarea, con sus columnas
 * relevantes. Ordena por cualquier cabecera; pulsar una fila abre el mismo panel
 * que en Kanban.
 *
 * Es solo lectura de la misma lista de tareas — no arrastra, no mueve. Para eso
 * está Kanban; aquí lo que se busca es ver todo de un vistazo y ordenar.
 */
export function BoardTable({
  board,
  projectId,
  tasks,
  members,
  labels,
  usersById,
  currentUserId,
  openTaskId,
  canMoveTask,
  canComment,
  canManageLabels,
  canEditTask,
  canDeleteTask,
}: BoardTableProps) {
  const nombreDeColumna = useMemo(
    () => new Map(board.columns.map((c) => [c.id, c.name])),
    [board.columns],
  );
  const columnasById = useMemo(() => new Map(board.columns.map((c) => [c.id, c])), [board.columns]);
  const ordenDeColumna = useMemo(
    () => new Map([...board.columns].sort((a, b) => a.order - b.order).map((c, i) => [c.id, i])),
    [board.columns],
  );
  /** Columnas de cierre: lo que hay dentro está entregado. Ver `DONE_COLUMN_COLOR`. */
  const columnasDeCierre = useMemo(
    () => new Set(board.columns.filter((c) => c.color === DONE_COLUMN_COLOR).map((c) => c.id)),
    [board.columns],
  );

  const [orden, setOrden] = useState<{ col: Col; asc: boolean }>({ col: 'columna', asc: true });
  const esMovil = useEsMovil();
  const dialog = useTaskDialog(tasks, openTaskId);

  const { fields, canEdit: puedeGestionarCampos, usersById: personas } = useProjectFields();

  const [anchos, setAnchos] = useState<Anchos>(ANCHOS_POR_DEFECTO);
  useEffect(() => {
    setAnchos(leerAnchos(currentUserId));
  }, [currentUserId]);
  const anchoDe = (id: string) => anchos[id] ?? ANCHO_CAMPO;
  const anchoTotal =
    COLUMNAS.reduce((suma, c) => suma + anchoDe(c.id), 0) +
    fields.reduce((suma, f) => suma + anchoDe(`campo:${f.id}`), 0) +
    (puedeGestionarCampos ? ANCHO_AÑADIR : 0);
  const totalDeColumnas = COLUMNAS.length + fields.length + (puedeGestionarCampos ? 1 : 0);

  /**
   * Arrastrar el borde derecho de una cabecera. El ancho se calcula desde el
   * del principio del gesto más lo que se ha movido el puntero, no sumando
   * deltas, para que no derive. Se guarda al soltar, no en cada píxel.
   */
  function empezarRedimension(id: string, evento: ReactPointerEvent<HTMLSpanElement>) {
    if (evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();
    const asa = evento.currentTarget;
    asa.setPointerCapture(evento.pointerId);
    const x0 = evento.clientX;
    const ancho0 = anchoDe(id);
    let ultimo = anchos;
    cursorDeRedimension(true);

    const mover = (e: PointerEvent) => {
      const ancho = Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Math.round(ancho0 + e.clientX - x0)));
      setAnchos((actual) => {
        ultimo = { ...actual, [id]: ancho };
        return ultimo;
      });
    };
    const soltar = () => {
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      cursorDeRedimension(false);
      guardarAnchos(currentUserId, ultimo);
    };
    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  }

  function restaurarAncho(id: string) {
    setAnchos((actual) => {
      const siguiente = {
        ...actual,
        [id]: ANCHOS_POR_DEFECTO[id as ColumnaDeTabla] ?? ANCHO_CAMPO,
      };
      guardarAnchos(currentUserId, siguiente);
      return siguiente;
    });
  }

  const filas = useMemo(() => {
    const arr = [...tasks];
    const dir = orden.asc ? 1 : -1;

    /* Por un campo personalizado: los vacíos siempre al final, en los dos
       sentidos —ordenar por «Reviewer» es querer ver primero a quién se le
       asignó, no las filas sin nadie—. */
    if (orden.col.startsWith('campo:')) {
      const campo = fields.find((f) => `campo:${f.id}` === orden.col);
      if (campo) {
        const nombre = (id: string) => {
          const u = personas.get(id);
          return u ? personLabel(u) : '';
        };
        const clave = new Map(
          arr.map((t) => [t.id, fieldSortKey(campo, fieldValueOf(t, campo.id), nombre)]),
        );
        arr.sort((a, b) => {
          const av = clave.get(a.id) ?? null;
          const bv = clave.get(b.id) ?? null;
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          if (typeof av === 'number' && typeof bv === 'number') return dir * (av - bv);
          return dir * String(av).localeCompare(String(bv), 'es');
        });
      }
      return arr;
    }

    arr.sort((a, b) => {
      switch (orden.col) {
        case 'titulo':
          return dir * a.title.localeCompare(b.title, 'es');
        case 'columna': {
          const d = (ordenDeColumna.get(a.columnId) ?? 99) - (ordenDeColumna.get(b.columnId) ?? 99);
          return dir * (d !== 0 ? d : a.order - b.order);
        }
        case 'vencimiento': {
          const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return dir * (av - bv);
        }
        case 'prioridad':
          return dir * (PRIORIDAD_ORDEN[a.priority] - PRIORIDAD_ORDEN[b.priority]);
        default:
          return 0;
      }
    });
    return arr;
  }, [tasks, orden, ordenDeColumna, fields, personas]);

  /**
   * Completadas aparte, igual que en Calendario: mezcladas con lo pendiente,
   * una tabla larga se lee como si quedara más trabajo del que en realidad
   * queda.
   */
  const pendientes = useMemo(
    () => filas.filter((t) => !columnasDeCierre.has(t.columnId)),
    [filas, columnasDeCierre],
  );
  const completadas = useMemo(
    () => filas.filter((t) => columnasDeCierre.has(t.columnId)),
    [filas, columnasDeCierre],
  );

  function alOrdenar(col: Col) {
    setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: true }));
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-fit max-h-full w-full items-center justify-center rounded-xl border border-white/10 bg-[#202020] p-10 text-center">
        <p className="font-sans text-sm text-white">Este tablero todavía no tiene tareas.</p>
      </div>
    );
  }

  const panel = dialog.renderedTask && (
    <TaskDialog
      open={dialog.isOpen}
      onClose={dialog.close}
      projectId={projectId}
      boardId={board.id}
      task={dialog.renderedTask}
      columnId={dialog.renderedTask.columnId}
      columnName={nombreDeColumna.get(dialog.renderedTask.columnId) ?? ''}
      members={members}
      labels={labels}
      usersById={usersById}
      currentUserId={currentUserId}
      canToggleChecklist={canMoveTask}
      canComment={canComment}
      canManageLabels={canManageLabels}
      canEdit={canEditTask}
      canDelete={canDeleteTask}
    />
  );

  /**
   * Móvil: una lista de tarjetas en vez de la tabla (M3 de
   * `docs/PLAN-MOVIL.md`). Seis columnas en 390 px se reducían a la primera
   * con el resto fuera de pantalla; aquí cada tarea enseña lo mismo apilado.
   * El orden se elige con un desplegable, que es lo que sustituye a pulsar
   * las cabeceras.
   */
  if (esMovil) {
    return (
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pb-2">
        <label className="flex shrink-0 items-center gap-2 self-end font-sans text-xs text-text-secondary">
          Ordenar por
          <select
            value={orden.col}
            onChange={(e) => setOrden({ col: e.target.value as Col, asc: true })}
            className="min-h-9 rounded-lg border border-white/10 bg-[#191919] px-2 font-sans text-sm text-text-primary"
          >
            <option value="columna">Columna</option>
            <option value="titulo">Tarea</option>
            <option value="vencimiento">Vence</option>
            <option value="prioridad">Prioridad</option>
          </select>
        </label>
        {pendientes.map((t, i) => (
          <TarjetaDeTarea
            key={t.id}
            task={t}
            columna={columnasById.get(t.columnId)}
            indiceDeColumna={ordenDeColumna.get(t.columnId) ?? i}
            nombreDeColumna={nombreDeColumna.get(t.columnId) ?? '—'}
            usersById={usersById}
            onOpen={() => dialog.open(t.id)}
          />
        ))}
        {completadas.length > 0 && (
          <p className="px-1 pt-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Completadas ({completadas.length})
          </p>
        )}
        {completadas.map((t, i) => (
          <TarjetaDeTarea
            key={t.id}
            task={t}
            columna={columnasById.get(t.columnId)}
            indiceDeColumna={ordenDeColumna.get(t.columnId) ?? i}
            nombreDeColumna={nombreDeColumna.get(t.columnId) ?? '—'}
            usersById={usersById}
            onOpen={() => dialog.open(t.id)}
            atenuada
          />
        ))}
        {panel}
      </div>
    );
  }

  return (
    <div className="h-fit max-h-full overflow-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 w-fit max-w-full rounded-xl border border-white/10 bg-[#202020]">
      {/**
       * ⚠️ **`table-layout: fixed` y anchos en `<colgroup>`.** Con el reparto
       * automático, un título de doscientos caracteres estiraba su columna
       * hasta sacar la tabla de la pantalla —el `truncate` no tiene nada que
       * recortar si la celda crece con el texto—. Fijos, el ancho lo decide
       * la persona y el texto se recorta con puntos suspensivos.
       *
       * La tabla mide exactamente la suma de sus columnas, y el contenedor la
       * abraza (`w-fit`). Hubo una columna de relleno para llenar la pantalla
       * —sin ella, `fixed` reparte el sobrante entre todas y el ancho elegido
       * no se respeta—, pero se leía como una columna rota sin cabecera.
       */}
      <table className="table-fixed border-collapse text-left" style={{ width: anchoTotal }}>
        <colgroup>
          {COLUMNAS.map((c) => (
            <col key={c.id} style={{ width: anchoDe(c.id) }} />
          ))}
          {fields.map((f) => (
            <col key={f.id} style={{ width: anchoDe(`campo:${f.id}`) }} />
          ))}
          {puedeGestionarCampos && <col style={{ width: ANCHO_AÑADIR }} />}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[#202020]">
          <tr className="border-b border-white/10 font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
            {COLUMNAS.map((c) => (
              <Th
                key={c.id}
                col={c.orden}
                orden={orden}
                onSort={alOrdenar}
                onResizeStart={(e) => empezarRedimension(c.id, e)}
                onResizeReset={() => restaurarAncho(c.id)}
              >
                {c.titulo}
              </Th>
            ))}
            {fields.map((f, i) => (
              <Th
                key={f.id}
                col={`campo:${f.id}`}
                orden={orden}
                onSort={alOrdenar}
                onResizeStart={(e) => empezarRedimension(`campo:${f.id}`, e)}
                onResizeReset={() => restaurarAncho(`campo:${f.id}`)}
                menu={
                  puedeGestionarCampos && (
                    <MenuDeCampo
                      field={f}
                      antes={fields[i - 1]?.id}
                      despues={fields[i + 1]?.id}
                      orden={fields.map((x) => x.id)}
                    />
                  )
                }
              >
                {f.name}
              </Th>
            ))}
            {puedeGestionarCampos && (
              <th className="border border-white/5 px-1 py-1.5">
                <AñadirCampo />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {pendientes.map((t, i) => (
            <FilaTarea
              key={t.id}
              task={t}
              columna={columnasById.get(t.columnId)}
              indiceDeColumna={ordenDeColumna.get(t.columnId) ?? i}
              nombreDeColumna={nombreDeColumna.get(t.columnId) ?? '—'}
              usersById={usersById}
              onOpen={() => dialog.open(t.id)}
            />
          ))}
        </tbody>

        {/* Completadas aparte: mezcladas con lo pendiente, la tabla se lee
            como si quedara más trabajo del que en realidad queda. */}
        {completadas.length > 0 && (
          <tbody>
            <tr aria-hidden="true">
              <td
                colSpan={totalDeColumnas}
                className="border border-white/5 bg-black/20 px-3 py-1.5"
              >
                <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Completadas ({completadas.length})
                </span>
              </td>
            </tr>
            {completadas.map((t, i) => (
              <FilaTarea
                key={t.id}
                task={t}
                columna={columnasById.get(t.columnId)}
                indiceDeColumna={ordenDeColumna.get(t.columnId) ?? i}
                nombreDeColumna={nombreDeColumna.get(t.columnId) ?? '—'}
                usersById={usersById}
                onOpen={() => dialog.open(t.id)}
                atenuada
              />
            ))}
          </tbody>
        )}
      </table>

      {panel}
    </div>
  );
}

/** Toda celda recorta: con `table-fixed` el texto ya no puede ensanchar la columna. */
const CELDA = 'overflow-hidden whitespace-nowrap border border-white/5 px-3 py-2.5';

/**
 * Una fila de tarea. Separada de `BoardTable` para pintarse igual en las dos
 * secciones —pendientes y completadas— sin duplicar el JSX.
 */
function FilaTarea({
  task,
  columna,
  indiceDeColumna,
  nombreDeColumna,
  usersById,
  onOpen,
  atenuada = false,
}: {
  task: Task;
  columna: Column | undefined;
  indiceDeColumna: number;
  nombreDeColumna: string;
  usersById: Map<string, UserProfile>;
  onOpen: () => void;
  /** Ya se cuenta como completada: se atenúa para no competir con lo pendiente. */
  atenuada?: boolean;
}) {
  const t = task;
  const due = dueState(t.dueDate);
  const tonoColumna = columna ? tintOf(columna.color, indiceDeColumna) : colors.textSecondary;
  const { fields, canEdit } = useProjectFields();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es el <button> del título, cuyo click burbujea hasta aquí; el click en la fila es solo comodidad de ratón
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-white/[0.06] transition-colors last:border-0 hover:bg-[#282828] ${atenuada ? 'opacity-60' : ''}`}
    >
      <td className={CELDA}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          title={t.title}
          className="block max-w-full truncate text-left font-sans text-[13px] font-medium text-white outline-none focus-visible:underline"
        >
          {t.title}
        </button>
      </td>
      <td className={CELDA}>
        <span
          title={nombreDeColumna}
          className="inline-block max-w-full truncate rounded-md px-2 py-0.5 align-middle font-sans text-[11px] font-medium"
          style={{ background: alpha(tonoColumna, 15), color: tonoColumna }}
        >
          {nombreDeColumna}
        </span>
      </td>
      <td className={CELDA}>
        {t.assignees.length === 0 ? (
          <span className="font-sans text-[11px] text-white">—</span>
        ) : (
          <span className="flex -space-x-1.5">
            {t.assignees.slice(0, 4).map((a) => {
              const u = usersById.get(a.userId);
              return (
                <Avatar
                  key={a.id}
                  size="sm"
                  label={u ? personLabel(u) : '?'}
                  src={avatarHref(u?.avatarUrl, '/api/gateway')}
                />
              );
            })}
            {t.assignees.length > 4 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 font-sans text-[9px] text-white ring-2 ring-[#202020]">
                +{t.assignees.length - 4}
              </span>
            )}
          </span>
        )}
      </td>
      <td className={CELDA}>
        <span
          className="flex min-w-0 gap-1 overflow-hidden"
          title={t.labels.map(({ label }) => label.name).join(', ') || undefined}
        >
          {t.labels.slice(0, 3).map(({ label }) => (
            <span
              key={label.id}
              className="min-w-0 shrink truncate rounded px-1.5 py-0.5 font-sans text-[10px] font-medium"
              style={{
                background: alpha(colors[label.color], 18),
                color: colors[label.color],
              }}
            >
              {label.name}
            </span>
          ))}
          {t.labels.length > 3 && (
            <span className="shrink-0 font-sans text-[10px] text-white">
              +{t.labels.length - 3}
            </span>
          )}
        </span>
      </td>
      <td className={CELDA}>
        {t.dueDate ? (
          <span
            className={`font-sans text-[12px] ${
              due === 'overdue'
                ? 'font-semibold text-error'
                : due === 'soon'
                  ? 'text-warning'
                  : 'text-white'
            }`}
          >
            {fechaCorta.format(new Date(t.dueDate))}
          </span>
        ) : (
          <span className="font-sans text-[11px] text-white">Sin fecha</span>
        )}
      </td>
      <td className={CELDA}>
        <PrioridadChip priority={t.priority} />
      </td>
      {fields.map((f) => (
        <CeldaDeCampo key={f.id} task={t} field={f} />
      ))}
      {canEdit && <td className={CELDA} />}
    </tr>
  );
}

/**
 * Una celda de campo personalizado. Con permiso, pulsarla edita el valor ahí
 * mismo —sin abrir la tarea— en un flotante; sin él, la fila se comporta como
 * siempre y abre el panel.
 *
 * La casilla no abre nada: se marca y desmarca al pulsar.
 */
function CeldaDeCampo({ task, field }: { task: Task; field: CustomField }) {
  const { canEdit, usersById } = useProjectFields();
  const { input, save, saving, error } = useFieldValue(task, field);
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const cerrar = useCallback(() => setAncla(null), []);

  const valor = <FieldValueView field={field} input={input} usersById={usersById} />;

  if (!canEdit) {
    return (
      <td className={`${CELDA} font-sans text-[12px] text-text-primary`}>
        <span className="flex min-w-0 items-center">{valor}</span>
      </td>
    );
  }

  return (
    <td
      className={`${CELDA} p-0 font-sans text-[12px] text-text-primary`}
      /* Que el clic edite la celda y no abra la tarea de la fila. El teclado
         entra por el botón de dentro, que ya no burbujea hasta la fila. */
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`${field.name} de «${task.title}»: cambiar`}
        title={error ?? undefined}
        onClick={(e) => {
          if (field.type === 'CHECKBOX') return void save(input !== true);
          setAncla(ancla ? null : e.currentTarget);
        }}
        className={`flex h-full min-h-10 w-full min-w-0 cursor-pointer items-center px-3 py-2 text-left transition-colors hover:bg-white/[0.04] ${
          saving ? 'opacity-60' : ''
        } ${error ? 'outline outline-1 -outline-offset-1 outline-error' : ''}`}
      >
        {valor}
      </button>
      {ancla && (
        <AnchoredPanel anchor={ancla} onClose={cerrar}>
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              {field.name}
            </span>
            <FieldEditor
              field={field}
              input={input}
              variant="panel"
              autoFocus
              onCommit={(value) => {
                void save(value);
                /* Elegir una sola cosa termina la edición; en las listas
                   múltiples se siguen marcando hasta salir. */
                if (field.type !== 'MULTI_SELECT' && field.type !== 'PERSON') cerrar();
              }}
            />
          </div>
        </AnchoredPanel>
      )}
    </td>
  );
}

/**
 * El «+» al final de la cabecera: crea un campo, que aparece como columna nueva
 * a la derecha. Es el equivalente de «añadir una columna» de una hoja de
 * cálculo, y el campo nace para todo el proyecto, no solo para esta tabla.
 */
function AñadirCampo() {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const cerrar = useCallback(() => setAncla(null), []);
  return (
    <>
      <button
        type="button"
        aria-label="Añadir un campo"
        title="Añadir un campo"
        onClick={(e) => setAncla(ancla ? null : e.currentTarget)}
        className="flex h-7 w-full cursor-pointer items-center justify-center rounded-md text-base text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
      >
        +
      </button>
      {ancla && (
        <AnchoredPanel anchor={ancla} onClose={cerrar} width={320}>
          <FieldSettings onDone={cerrar} />
        </AnchoredPanel>
      )}
    </>
  );
}

/**
 * El menú de la cabecera de un campo: configurarlo y moverlo de sitio. Moverlo
 * mueve el campo **para todo el proyecto** —también en el panel de la tarea—,
 * no solo en la tabla de quien lo mueve.
 */
function MenuDeCampo({
  field,
  antes,
  despues,
  orden,
}: {
  field: CustomField;
  antes?: string;
  despues?: string;
  orden: string[];
}) {
  const { projectId } = useProjectFields();
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cerrar = useCallback(() => setAncla(null), []);

  async function mover(con: string) {
    const ids = [...orden];
    const a = ids.indexOf(field.id);
    const b = ids.indexOf(con);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    const resultado = await reorderCustomFieldsAction({ projectId, orderedIds: ids });
    if (resultado.error) setError(resultado.error);
    else cerrar();
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Opciones del campo ${field.name}`}
        title="Opciones del campo"
        onClick={(e) => {
          e.stopPropagation();
          setError(null);
          setAncla(ancla ? null : e.currentTarget);
        }}
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-text-secondary opacity-0 transition-opacity hover:bg-white/10 hover:text-text-primary focus-visible:opacity-100 group-hover/th:opacity-100"
      >
        ⋯
      </button>
      {ancla && (
        <AnchoredPanel anchor={ancla} onClose={cerrar} width={320}>
          <div className="flex flex-col gap-3 normal-case tracking-normal">
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={!antes}
                onClick={() => antes && void mover(antes)}
                className="flex-1 cursor-pointer rounded-md border border-border px-2 py-1 font-sans text-xs font-normal text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Mover a la izquierda
              </button>
              <button
                type="button"
                disabled={!despues}
                onClick={() => despues && void mover(despues)}
                className="flex-1 cursor-pointer rounded-md border border-border px-2 py-1 font-sans text-xs font-normal text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Mover a la derecha →
              </button>
            </div>
            {error && (
              <p role="alert" className="font-sans text-xs font-normal text-error">
                {error}
              </p>
            )}
            <FieldSettings field={field} onDone={cerrar} />
          </div>
        </AnchoredPanel>
      )}
    </>
  );
}

function Th({
  col,
  orden,
  onSort,
  onResizeStart,
  onResizeReset,
  menu,
  children,
}: {
  /** Sin `col`, la cabecera no ordena. */
  col?: Col;
  orden: { col: Col; asc: boolean };
  onSort: (c: Col) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onResizeReset: () => void;
  /** El «⋯» de un campo personalizado, a la derecha del nombre. */
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  const activo = col !== undefined && orden.col === col;
  return (
    <th className="group/th relative overflow-hidden border border-white/5 px-3 py-2.5 font-semibold">
      <span className="flex min-w-0 items-center gap-1">
        {col ? (
          <button
            type="button"
            onClick={() => onSort(col)}
            className={`flex max-w-full items-center gap-1 font-semibold uppercase transition-colors hover:text-white ${
              activo ? 'text-white' : ''
            }`}
          >
            <span className="truncate">{children}</span>
            {activo && (
              <svg
                className={`h-3 w-3 shrink-0 transition-transform ${orden.asc ? '' : 'rotate-180'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 15l6-6 6 6" />
              </svg>
            )}
          </button>
        ) : (
          <span className="block truncate">{children}</span>
        )}
        {menu && <span className="ml-auto flex shrink-0">{menu}</span>}
      </span>
      {/* El asa: el borde derecho de la cabecera. Doble clic, ancho de siempre.
          Oculta a lectores de pantalla: es un ajuste de ratón sobre cómo se ve
          la tabla, y la tabla se lee entera con cualquier ancho. */}
      <span
        aria-hidden="true"
        title="Arrastra para cambiar el ancho · doble clic para restaurarlo"
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeReset}
        className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize transition-colors hover:bg-primary/50 active:bg-primary/70"
      />
    </th>
  );
}

/** Una tarea de la tabla, como tarjeta: lo que en escritorio son sus columnas. */
function TarjetaDeTarea({
  task: t,
  columna,
  indiceDeColumna,
  nombreDeColumna,
  usersById,
  onOpen,
  atenuada = false,
}: {
  task: Task;
  columna: Column | undefined;
  indiceDeColumna: number;
  nombreDeColumna: string;
  usersById: Map<string, UserProfile>;
  onOpen: () => void;
  atenuada?: boolean;
}) {
  const due = dueState(t.dueDate);
  const tonoColumna = columna ? tintOf(columna.color, indiceDeColumna) : colors.textSecondary;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full flex-col gap-2 rounded-xl border border-white/[0.06] bg-[#202020] p-3 text-left active:bg-[#282828] ${
        atenuada ? 'opacity-60' : ''
      }`}
    >
      <span className="line-clamp-2 [overflow-wrap:anywhere] font-sans text-[15px] font-medium text-white">
        {t.title}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span
          className="max-w-[10rem] truncate rounded-md px-2 py-0.5 font-sans text-[11px] font-medium"
          style={{ background: alpha(tonoColumna, 15), color: tonoColumna }}
        >
          {nombreDeColumna}
        </span>
        <PrioridadChip priority={t.priority} />
        {t.dueDate && (
          <span
            className={`font-sans text-[12px] ${
              due === 'overdue'
                ? 'font-semibold text-error'
                : due === 'soon'
                  ? 'text-warning'
                  : 'text-white/70'
            }`}
          >
            {fechaCorta.format(new Date(t.dueDate))}
          </span>
        )}
        {t.assignees.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {t.assignees.slice(0, 3).map((a) => {
              const u = usersById.get(a.userId);
              return (
                <Avatar
                  key={a.id}
                  size="sm"
                  label={u ? personLabel(u) : '?'}
                  src={avatarHref(u?.avatarUrl, '/api/gateway')}
                />
              );
            })}
          </span>
        )}
      </span>
    </button>
  );
}

function PrioridadChip({ priority }: { priority: Priority }) {
  const tono =
    priority === 'URGENT'
      ? colors.error
      : priority === 'HIGH'
        ? colors.warning
        : priority === 'MEDIUM'
          ? colors.info
          : colors.textSecondary;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11px] font-medium"
      style={{ background: alpha(tono, 15), color: tono }}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
