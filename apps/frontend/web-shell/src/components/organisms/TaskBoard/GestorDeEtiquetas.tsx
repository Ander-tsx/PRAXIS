'use client';

import { deleteLabelAction, saveLabelAction } from '@/app/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  Input,
  LABEL_COLORS,
  LABEL_COLOR_LABELS,
  type Label,
  type LabelColor,
  Select,
  alpha,
  colors,
  useAccion,
} from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface GestorDeEtiquetasProps {
  projectId: string;
  /** Las del proyecto entero: son las mismas en todos sus tableros. */
  labels: Label[];
}

/** El token de color de una etiqueta, resuelto a su variable CSS. */
export function labelColor(color: LabelColor): string {
  return colors[color];
}

/**
 * Crear, renombrar y borrar etiquetas **sin salir de la tarea**.
 *
 * ## Por qué está aquí y ya no en una pestaña
 *
 * Tenían pestaña propia, y el argumento de entonces era que son configuración
 * del proyecto —se definen una vez y se usan muchas—. En la práctica el momento
 * en que hace falta una etiqueta nueva es **siempre el mismo**: estás
 * clasificando una tarea y la que necesitas no está. Eso obligaba a cerrar el
 * diálogo, cambiar de pestaña, crearla, volver al tablero, reabrir la tarea y
 * buscar dónde te habías quedado. Se define donde se usa.
 *
 * ## No hay ningún `<form>`, y no es un descuido
 *
 * Este panel vive **dentro** del formulario del diálogo de tarea, y un `<form>`
 * anidado es HTML inválido: el navegador cierra el de fuera al abrir el de
 * dentro, y lo que se rompe no es esto, es el autoguardado de la tarea. Era la
 * razón que daba el componente antiguo para no estar aquí.
 *
 * Se resuelve por donde había que resolverlo: la tupla de [`useAccion`] devuelve
 * un despachador que acepta un `FormData` construido a mano, así que las mismas
 * Server Actions de siempre —`saveLabelAction`, `deleteLabelAction`— se llaman
 * desde un `onClick` sin necesidad de un elemento `<form>`.
 *
 * ⚠️ Y por eso **ningún campo de aquí lleva `name`**. Si lo llevara, el
 * formulario de la tarea lo recogería en su propio `FormData` al autoguardar, y
 * un campo de más en el cuerpo es un **400** (CLAUDE.md, reglas del fetch). Los
 * valores viven en estado de React y se leen de ahí. Los botones son todos
 * `type="button"` por lo mismo: uno sin tipo envía el formulario de fuera.
 *
 * ## El permiso
 *
 * Lo comprueba quien lo monta. `canManageLabels` es un permiso **propio** desde
 * `29xxxxx`: antes bastaba `canEditTask`, así que quien tocaba una tarea rehacía
 * el vocabulario del proyecto entero.
 */
export function GestorDeEtiquetas({ projectId, labels }: GestorDeEtiquetasProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setAbierto((estaba) => !estaba)}
        aria-expanded={abierto}
        className="self-start rounded-lg px-2 py-1 font-sans text-xs font-medium text-white transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {abierto ? 'Cerrar la gestión de etiquetas' : 'Gestionar etiquetas'}
      </button>

      {abierto && <Panel projectId={projectId} labels={labels} />}
    </div>
  );
}

/**
 * El panel, montado solo cuando se abre.
 *
 * Se separa para que **el estado de edición nazca y muera con él**: dejar a
 * medias el renombrado de una etiqueta, cerrar y volver a abrir tiene que
 * empezar limpio, y si el estado viviera arriba conservaría lo tecleado.
 */
function Panel({ projectId, labels }: GestorDeEtiquetasProps) {
  /** `null` es «estoy creando una nueva»; una etiqueta, «estoy editando esa». */
  const [editando, setEditando] = useState<Label | null>(null);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState<string>('primary');

  const [estado, guardar, guardando] = useAccion(saveLabelAction, TASK_INITIAL_STATE);

  /* Al confirmar el servidor se vuelve al modo «nueva» con los campos vacíos:
     encadenar dos etiquetas seguidas es el caso normal al empezar un proyecto. */
  useEffect(() => {
    if (!estado.done) return;
    setEditando(null);
    setNombre('');
    setColor('primary');
  }, [estado]);

  function enviar() {
    const datos = new FormData();
    datos.set('projectId', projectId);
    if (editando) datos.set('labelId', editando.id);
    datos.set('name', nombre);
    datos.set('color', color);
    guardar(datos);
  }

  function editar(label: Label) {
    setEditando(label);
    setNombre(label.name);
    setColor(label.color);
  }

  const puedeEnviar = nombre.trim().length > 0 && !guardando;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 p-3">
      {labels.length > 0 && (
        <ul className="flex flex-col divide-y divide-white/10">
          {labels.map((label) => (
            <li key={label.id}>
              <Fila
                label={label}
                projectId={projectId}
                editando={editando?.id === label.id}
                onEditar={() => editar(label)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <span className="min-w-40 flex-1">
          <Input
            label={editando ? `Renombrando «${editando.name}»` : 'Nueva etiqueta'}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            placeholder="frontend, bug, diseño…"
            maxLength={40}
            fullWidth
            /* Enter envía, que es lo que espera quien escribe un nombre corto.
               No puede caer al submit del formulario de la tarea: se para aquí. */
            onKeyDown={(evento) => {
              if (evento.key !== 'Enter') return;
              evento.preventDefault();
              if (puedeEnviar) enviar();
            }}
          />
        </span>

        <span className="w-36">
          <Select
            label="Color"
            value={color}
            onValueChange={setColor}
            /* La razón de que este desplegable exista: elegir «el rojo» leyendo
               la palabra «Rojo» era lo que había antes. */
            options={LABEL_COLORS.map((token) => ({
              value: token,
              label: LABEL_COLOR_LABELS[token],
              color: labelColor(token),
            }))}
            fullWidth
          />
        </span>

        <button
          type="button"
          onClick={enviar}
          disabled={!puedeEnviar}
          className="h-10 cursor-pointer rounded-lg px-3 font-sans text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: colors.primary }}
        >
          {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Crear'}
        </button>

        {editando && (
          <button
            type="button"
            onClick={() => {
              setEditando(null);
              setNombre('');
              setColor('primary');
            }}
            className="h-10 cursor-pointer rounded-lg px-3 font-sans text-sm text-white transition-colors hover:text-white"
          >
            Cancelar
          </button>
        )}
      </div>

      {estado.error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {estado.error}
        </p>
      )}
    </div>
  );
}

/**
 * Una etiqueta de la lista, con sus dos acciones.
 *
 * El borrado **se confirma**, y el aviso dice lo que de verdad pasa: la etiqueta
 * desaparece de todas las tareas que la tuvieran. Borrarla en silencio quitaría
 * información del tablero sin decirlo.
 */
function Fila({
  label,
  projectId,
  editando,
  onEditar,
}: {
  label: Label;
  projectId: string;
  editando: boolean;
  onEditar: () => void;
}) {
  const [estado, borrar, borrando] = useAccion(deleteLabelAction, TASK_INITIAL_STATE);
  const [confirmando, setConfirmando] = useState(false);
  const tono = labelColor(label.color);

  function confirmarBorrado() {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('labelId', label.id);
    borrar(datos);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 py-2"
      style={{ background: editando ? alpha(tono, 8) : undefined }}
    >
      <span
        className="rounded-full px-2.5 py-0.5 font-sans text-xs font-medium"
        style={{ background: alpha(tono, 15), color: tono }}
      >
        {label.name}
      </span>

      {confirmando ? (
        <span className="ml-auto flex items-center gap-2">
          <span className="font-sans text-xs text-white">Se quitará de sus tareas.</span>
          <button
            type="button"
            onClick={confirmarBorrado}
            disabled={borrando}
            className="cursor-pointer rounded-lg px-2 py-1 font-sans text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: alpha(colors.error, 20), color: colors.error }}
          >
            {borrando ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="cursor-pointer rounded-lg px-2 py-1 font-sans text-xs text-white transition-colors hover:text-white"
          >
            No
          </button>
        </span>
      ) : (
        <span className="ml-auto flex items-center gap-1">
          <BotonDeIcono
            onClick={onEditar}
            label={`Renombrar la etiqueta ${label.name}`}
            title="Renombrar"
          >
            <IconoDeLapiz />
          </BotonDeIcono>
          <BotonDeIcono
            onClick={() => setConfirmando(true)}
            label={`Eliminar la etiqueta ${label.name}`}
            title="Eliminar"
            peligro
          >
            <IconoDePapelera />
          </BotonDeIcono>
        </span>
      )}

      {estado.error && (
        <p role="alert" className="w-full font-sans text-xs" style={{ color: colors.error }}>
          {estado.error}
        </p>
      )}
    </div>
  );
}

/** Botón cuadrado de 28 px. Más pequeño que el de la pestaña que había: aquí
    compite por sitio con el resto del diálogo de tarea. */
function BotonDeIcono({
  onClick,
  label,
  title,
  peligro,
  children,
}: {
  onClick: () => void;
  label: string;
  title: string;
  /** El borrado se tiñe de rojo al apuntarlo, no antes: en reposo sería alarma constante. */
  peligro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className={[
        'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg',
        'text-white transition-colors hover:bg-white/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        peligro ? 'hover:text-error' : 'hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* Heroicons v2 «pencil-square», trazo 1.5. */
function IconoDeLapiz() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  );
}

/* Heroicons v2 «trash». */
function IconoDePapelera() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}
