'use client';

import {
  type AdminProject,
  Button,
  Dialog,
  type ProjectStatusName,
  Textarea,
} from '@praxis/commons';
import { useActionState, useEffect } from 'react';
import { setProjectStatusAction } from '@/app/(private)/proyectos/actions';
import { ADMIN_PROJECT_INITIAL_STATE } from '@/lib/action-state';
import { ESTADOS_PROYECTO } from '@/lib/admin';

export interface ProjectStatusDialogProps {
  proyecto: AdminProject;
  /** A qué estado se va. Lo decide el botón que abrió el diálogo. */
  destino: ProjectStatusName;
  open: boolean;
  onClose: () => void;
}

/**
 * Suspender, archivar, reactivar o recuperar un proyecto.
 *
 * ## Un diálogo con `destino` en vez de cuatro diálogos
 *
 * Los cuatro cambios son la misma petición con otro valor, y el único campo del
 * formulario —el motivo— se comporta igual en todos. Lo que cambia es el texto, y
 * eso es un diccionario, no un componente. Cuatro copias del mismo formulario se
 * habrían separado en la primera corrección.
 *
 * ## Lo que el aviso dice, y por qué es concreto
 *
 * «Pasa a solo lectura» no le dice nada a quien administra si no sabe qué implica.
 * Aquí se enumera: ni tareas, ni comentarios, ni miembros — y **se ve entero**, que
 * es justo la diferencia con archivar y la razón de que existan los dos.
 *
 * `noValidate` y validación propia: la nativa del navegador corta el `onSubmit` de
 * React y el formulario se queda mudo (ESTADO-ACTUAL §17.6).
 */
export function ProjectStatusDialog({
  proyecto,
  destino,
  open,
  onClose,
}: ProjectStatusDialogProps) {
  const [state, formAction, pending] = useActionState(
    setProjectStatusAction,
    ADMIN_PROJECT_INITIAL_STATE,
  );

  /* Se cierra cuando el servidor confirma, no al pulsar: si falla, el diálogo se
     queda abierto con el mensaje y con el motivo escrito. */
  useEffect(() => {
    if (state.done) onClose();
  }, [state, onClose]);

  const copia = COPIA[destino](proyecto);
  const pideMotivo = destino !== 'ACTIVE';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={destino === 'ACTIVE' ? tituloDeVuelta(proyecto.status) : copia.titulo}
      description={copia.descripcion}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="projectId" value={proyecto.id} />
        <input type="hidden" name="status" value={destino} />

        {pideMotivo ? (
          <>
            <Textarea
              name="reason"
              label="Motivo"
              placeholder="Lo leerá el dueño del proyecto en su pantalla."
              rows={3}
              maxLength={500}
              showCount
              fullWidth
              variant={state.error ? 'error' : 'default'}
              message={state.error ?? undefined}
            />

            <p className="rounded-lg bg-surface-elevated px-3 py-2 font-sans text-xs text-text-secondary">
              El cambio es <strong>inmediato</strong>, y el motivo se enseña en la pantalla del
              proyecto: sin él, sus miembros ven que nada funciona y no saben por qué.
            </p>
          </>
        ) : (
          state.error && <p className="font-sans text-sm text-error">{state.error}</p>
        )}

        <footer className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant={pideMotivo ? 'danger' : 'primary'} isLoading={pending}>
            {destino === 'ACTIVE' ? tituloDeVuelta(proyecto.status) : copia.boton}
          </Button>
        </footer>
      </form>

      <p className="mt-3 font-sans text-xs text-text-disabled">
        Estado actual: {ESTADOS_PROYECTO[proyecto.status].etiqueta}.{' '}
        {ESTADOS_PROYECTO[proyecto.status].descripcion}
      </p>
    </Dialog>
  );
}

/**
 * Volver a `ACTIVE` se llama distinto según de dónde se venga.
 *
 * «Reactivar» un suspendido levanta un bloqueo que todos veían; «recuperar» un
 * archivado devuelve a la vista un proyecto que había desaparecido. Son dos gestos
 * distintos para quien administra, y el registro de actividad también los anota por
 * separado (`PROJECT_REACTIVATED` y `PROJECT_RESTORED`).
 */
const tituloDeVuelta = (actual: ProjectStatusName): string =>
  actual === 'DELETED' ? 'Recuperar' : 'Reactivar';

/** El texto de cada destino. Lo único que cambia entre los cuatro casos. */
const COPIA: Record<
  ProjectStatusName,
  (p: AdminProject) => { titulo: string; boton: string; descripcion: React.ReactNode }
> = {
  SUSPENDED: (p) => ({
    titulo: 'Suspender el proyecto',
    boton: 'Suspender',
    descripcion: (
      <>
        <strong className="text-text-primary">{p.name}</strong> pasa a solo lectura. Sus{' '}
        {p._count.members === 1 ? '1 miembro' : `${p._count.members} miembros`} lo seguirán viendo
        entero —tableros, tareas, comentarios— y no podrán modificar nada: ni crear o mover tareas,
        ni comentar, ni cambiar miembros. Se deshace cuando quieras.
      </>
    ),
  }),
  DELETED: (p) => ({
    titulo: 'Archivar el proyecto',
    boton: 'Archivar',
    descripcion: (
      <>
        <strong className="text-text-primary">{p.name}</strong> desaparece de la lista de sus
        miembros y del selector de informes.{' '}
        <strong className="text-text-primary">No se borra nada</strong>: espacios, tableros y tareas
        se quedan como están, y vuelve desde aquí con un clic.
      </>
    ),
  }),
  ACTIVE: (p) => ({
    titulo: 'Reactivar el proyecto',
    boton: 'Reactivar',
    descripcion: (
      <>
        <strong className="text-text-primary">{p.name}</strong> vuelve a funcionar con normalidad
        para todos sus miembros, y el aviso desaparece de su pantalla.
      </>
    ),
  }),
};
