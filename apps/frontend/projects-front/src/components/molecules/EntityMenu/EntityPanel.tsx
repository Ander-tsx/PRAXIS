'use client';

import { alpha, colors, useAccion } from '@praxis/commons';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

/** Qué enseña el panel. Una cosa a la vez: es un menú, no un formulario. */
type Vista = 'menu' | 'renombrar' | 'eliminar';

/**
 * Una Server Action ya cableada con `useAccion`, tal cual sale del hook.
 *
 * Se pasa entera en vez de dejar que el panel llame a la acción: los dos sitios
 * que lo usan mandan campos ocultos distintos y validan con reglas distintas, y
 * el hook tiene que vivir en el componente que sabe cuáles son.
 */
export interface EntityAction {
  ejecutar: (formData: FormData) => void;
  error: string | null;
  /** Lo que confirmó el servidor. Es lo que cierra el panel, no el envío. */
  confirmado: string | null;
  pendiente: boolean;
}

export interface EntityPanelProps {
  /** «espacio», «tablero». Va en los textos y en el nombre accesible. */
  entidad: string;
  nombre: string;
  nombreMax: number;
  validarNombre: (nombre: string) => string | null;
  /** Renombrar: `canEditBoard`. Sin permiso, la opción no aparece. */
  canEdit: boolean;
  /** Eliminar: `canDeleteBoard`. Sin permiso, la opción no aparece. */
  canDelete: boolean;
  /**
   * Si hace falta **escribir el nombre** para poder borrar.
   *
   * Lo decide quien monta, porque depende de lo que haya dentro: algo vacío se
   * borra de un clic y algo lleno no. Ver abajo por qué no es un «¿seguro?».
   */
  exigeEscribirNombre: boolean;
  /** Qué se lleva por delante el borrado, en una frase. */
  avisoDeBorrado: ReactNode;
  /** Los `<input type="hidden">` que necesitan las dos acciones. */
  camposOcultos: ReactNode;
  renombrar: EntityAction;
  eliminar: EntityAction;
  /** Cerrar del todo: lo resuelve quien nos monta, que sabe dónde vivimos. */
  alCerrar: () => void;
}

/**
 * Renombrar y eliminar una entidad, en tres vistas.
 *
 * ## Por qué existe
 *
 * «Eliminar espacio» era un botón permanente, del ancho de dos palabras, al
 * lado de «Nuevo tablero»: sitio fijo en pantalla para algo que se usa una vez
 * cada muchas semanas, y con el mismo peso visual que una acción constructiva.
 * «Eliminar tablero» directamente no existía, aunque el endpoint sí — se podían
 * crear tableros y no había forma de quitarlos.
 *
 * Detrás de un menú, la acción sigue estando a dos clics y deja de competir por
 * la atención con lo que se usa a diario. Es el mismo patrón que ya usaba
 * `ColumnMenu` para las columnas, y se parece a propósito: dentro de un
 * proyecto, renombrar y borrar deberían pedirse igual en todas partes.
 *
 * ## La confirmación escrita no es ceremonia
 *
 * Cuando la entidad tiene cosas dentro hay que **teclear su nombre**. Un
 * «¿estás seguro?» se pulsa sin leer; escribir el nombre obliga a mirar qué se
 * está borrando. Se pide solo cuando el borrado arrastra algo: para lo vacío
 * sería un peaje sin motivo. Misma regla que tenía `DeleteWorkspaceButton`, que
 * es de donde sale.
 *
 * ## Por qué el panel va aparte del desplegable
 *
 * `EntityMenu` lo envuelve en un popover para la cabecera del tablero. El
 * selector de espacios **no puede usar ese popover**: su lista es un
 * `overflow-y-auto` dentro de un contenedor `overflow-hidden`, así que un panel
 * absoluto saldría recortado. Allí se monta este panel en el cuerpo del propio
 * desplegable, sustituyendo a la lista. La lógica es la misma en los dos.
 */
export function EntityPanel({
  entidad,
  nombre,
  nombreMax,
  validarNombre,
  canEdit,
  canDelete,
  exigeEscribirNombre,
  avisoDeBorrado,
  camposOcultos,
  renombrar,
  eliminar,
  alCerrar,
}: EntityPanelProps) {
  const [vista, setVista] = useState<Vista>('menu');
  const [nombreNuevo, setNombreNuevo] = useState(nombre);
  const [confirmacion, setConfirmacion] = useState('');
  const campoNombre = useRef<HTMLInputElement>(null);
  const idConfirmacion = useId();
  const idNombre = useId();

  /**
   * Lo que ya estaba confirmado al montar.
   *
   * El estado de `useAccion` vive **fuera** de este panel y sobrevive a
   * cerrarlo. Sin esta referencia, el efecto que cierra al confirmar se
   * dispararía otra vez nada más volver a abrir —el `confirmado` sigue puesto
   * de la vez anterior— y el menú se cerraría solo, sin que se pudiera hacer
   * nada. Solo cierra cuando el valor **cambia** respecto a este.
   */
  const yaConfirmado = useRef({
    renombrar: renombrar.confirmado,
    eliminar: eliminar.confirmado,
  });

  useEffect(() => {
    if (renombrar.confirmado && renombrar.confirmado !== yaConfirmado.current.renombrar) {
      yaConfirmado.current.renombrar = renombrar.confirmado;
      alCerrar();
    }
  }, [renombrar.confirmado, alCerrar]);

  useEffect(() => {
    if (eliminar.confirmado && eliminar.confirmado !== yaConfirmado.current.eliminar) {
      yaConfirmado.current.eliminar = eliminar.confirmado;
      alCerrar();
    }
  }, [eliminar.confirmado, alCerrar]);

  /** El campo llega enfocado y con el nombre seleccionado: se viene a cambiarlo. */
  useEffect(() => {
    if (vista === 'renombrar') {
      campoNombre.current?.focus();
      campoNombre.current?.select();
    }
  }, [vista]);

  const errorDeNombre = nombreNuevo.trim() ? validarNombre(nombreNuevo) : null;
  const puedeGuardar =
    !renombrar.pendiente && !errorDeNombre && !!nombreNuevo.trim() && nombreNuevo.trim() !== nombre;
  const puedeBorrar = !exigeEscribirNombre || confirmacion.trim() === nombre;

  return (
    <div className="flex flex-col">
      {vista === 'menu' && (
        <>
          {canEdit && (
            <ItemDeMenu onClick={() => setVista('renombrar')}>
              <IconoLapiz />
              Renombrar {entidad}
            </ItemDeMenu>
          )}
          {canDelete && (
            <ItemDeMenu tono={colors.error} onClick={() => setVista('eliminar')}>
              <IconoPapelera />
              Eliminar {entidad}
            </ItemDeMenu>
          )}
        </>
      )}

      {vista === 'renombrar' && (
        <form action={renombrar.ejecutar} className="flex flex-col gap-2 p-1.5" noValidate>
          {camposOcultos}

          <label
            htmlFor={idNombre}
            className="font-sans text-[11px] uppercase tracking-wide text-text-disabled"
          >
            Nombre del {entidad}
          </label>
          <input
            ref={campoNombre}
            id={idNombre}
            name="name"
            value={nombreNuevo}
            onChange={(evento) => setNombreNuevo(evento.target.value)}
            maxLength={nombreMax}
            autoComplete="off"
            /* Enter guarda, igual que en el resto de campos cortos del tablero. */
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && puedeGuardar) {
                evento.preventDefault();
                evento.currentTarget.form?.requestSubmit();
              }
            }}
            className="h-9 rounded-lg border border-border bg-surface px-2.5 font-sans text-sm text-text-primary outline-none focus:border-primary"
          />

          {(errorDeNombre ?? renombrar.error) && (
            <p role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
              {errorDeNombre ?? renombrar.error}
            </p>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              disabled={!puedeGuardar}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: colors.primary }}
            >
              {renombrar.pendiente ? 'Guardando…' : 'Guardar'}
            </button>
            <BotonVolver
              onClick={() => {
                setNombreNuevo(nombre);
                setVista('menu');
              }}
            />
          </div>
        </form>
      )}

      {vista === 'eliminar' && (
        <form action={eliminar.ejecutar} className="flex flex-col gap-2 p-1.5" noValidate>
          {camposOcultos}

          <p className="font-sans text-xs text-text-primary">¿Eliminar «{nombre}»?</p>
          <p className="font-sans text-[11px] leading-snug" style={{ color: colors.warning }}>
            {avisoDeBorrado}
          </p>

          {exigeEscribirNombre && (
            <>
              <label
                htmlFor={idConfirmacion}
                className="font-sans text-[11px] leading-snug text-text-secondary"
              >
                Escribe <strong className="text-text-primary">{nombre}</strong> para confirmar
              </label>
              <input
                id={idConfirmacion}
                value={confirmacion}
                onChange={(evento) => setConfirmacion(evento.target.value)}
                autoComplete="off"
                aria-invalid={!puedeBorrar}
                className="h-9 rounded-lg border border-border bg-surface px-2.5 font-sans text-sm text-text-primary outline-none focus:border-primary"
              />
            </>
          )}

          {eliminar.error && (
            <p role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
              {eliminar.error}
            </p>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              disabled={!puedeBorrar || eliminar.pendiente}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: alpha(colors.error, 20), color: colors.error }}
            >
              {eliminar.pendiente ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
            <BotonVolver
              onClick={() => {
                setConfirmacion('');
                setVista('menu');
              }}
            />
          </div>
        </form>
      )}
    </div>
  );
}

function ItemDeMenu({
  children,
  onClick,
  tono,
}: {
  children: ReactNode;
  onClick: () => void;
  tono?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left font-sans text-xs text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
      style={tono ? { color: tono } : undefined}
    >
      {children}
    </button>
  );
}

function BotonVolver({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-lg px-2 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
    >
      Cancelar
    </button>
  );
}

function IconoLapiz() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
      />
    </svg>
  );
}

function IconoPapelera() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
