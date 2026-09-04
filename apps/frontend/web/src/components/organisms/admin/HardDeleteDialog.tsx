'use client';

import { ADMIN_USER_INITIAL_STATE, type AdminUserState } from '@/lib/admin/action-state';
import { Button, Dialog, Input, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface HardDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  /** Qué se borra: «esta cuenta», «este proyecto». Va en la prosa. */
  queCosa: string;
  /** Lo que hay que escribir para confirmar. Es el nombre de lo que se borra. */
  nombre: string;
  /** Los campos ocultos que necesita la acción, más el de confirmación. */
  campos: Record<string, string>;
  /**
   * La Server Action que borra.
   *
   * Tipada, y no con `Parameters<typeof useAccion>[0]`: aquel es genérico, así
   * que el estado llegaba como `unknown` y `state.error` dejaba de existir para
   * el compilador. Las dos acciones que pasan por aquí comparten forma —cuentas
   * y proyectos usan el mismo `AdminUserState`— así que se declara.
   */
  accion: (estado: AdminUserState, carga: FormData) => Promise<AdminUserState>;
  /** Qué se lleva por delante. Se enumera: sin esto nadie sabe qué está firmando. */
  arrastra: string[];
  /** Qué **no** se borra. Tan importante como lo anterior. */
  conserva?: string[];
}

/**
 * La confirmación de un borrado que no se deshace.
 *
 * ## ⚠️ Por qué se escribe el nombre y no se pulsa «¿Seguro?»
 *
 * Un «¿seguro?» se contesta con la misma mano y la misma atención con la que se
 * pulsó el botón que lo abrió: es un trámite, no una decisión. Escribir el
 * nombre obliga a mirar **qué** se está borrando, que es exactamente el error
 * que este diálogo tiene que evitar — no el de querer borrar, sino el de borrar
 * la fila de al lado.
 *
 * ## Y por qué se enumera lo que se lleva y lo que se queda
 *
 * «Esta acción no se puede deshacer» no dice nada útil: quien administra sabe
 * que un borrado no se deshace, lo que no sabe es **hasta dónde llega**. Si se
 * van también las tareas, si se van los mensajes del equipo, si el trabajo de
 * una persona desaparece de proyectos ajenos. Eso es lo que decide si se pulsa.
 */
export function HardDeleteDialog({
  open,
  onClose,
  queCosa,
  nombre,
  campos,
  accion,
  arrastra,
  conserva,
}: HardDeleteDialogProps) {
  const [state, formAction, pending] = useAccion(accion, ADMIN_USER_INITIAL_STATE);
  const [confirmacion, setConfirmacion] = useState('');

  useEffect(() => {
    if (state.done) onClose();
  }, [state.done, onClose]);

  /* Se vacía al abrir y no al cerrar: cerrar tiene dos motivos —hecho y
     cancelado— y el segundo no tiene por qué comportarse igual. */
  useEffect(() => {
    if (open) setConfirmacion('');
  }, [open]);

  const coincide = confirmacion.trim() === nombre.trim();

  return (
    <Dialog open={open} onClose={onClose} size="sm" title={`Borrar ${queCosa}`}>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {Object.entries(campos).map(([clave, valor]) => (
          <input key={clave} type="hidden" name={clave} value={valor} />
        ))}

        <div className="flex flex-col gap-2">
          <p className="font-sans text-sm text-text-primary">
            Esto <strong>no se deshace</strong>. Se borra:
          </p>
          <ul className="list-disc pl-5 font-sans text-sm text-white">
            {arrastra.map((cosa) => (
              <li key={cosa}>{cosa}</li>
            ))}
          </ul>

          {conserva && conserva.length > 0 && (
            <>
              <p className="mt-1 font-sans text-sm text-text-primary">Se conserva:</p>
              <ul className="list-disc pl-5 font-sans text-sm text-white">
                {conserva.map((cosa) => (
                  <li key={cosa}>{cosa}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-sm text-white">
            Escribe <strong className="text-text-primary">{nombre}</strong> para confirmar.
          </span>
          <Input
            name="confirmacion"
            value={confirmacion}
            autoComplete="off"
            placeholder={nombre}
            onChange={(event) => setConfirmacion(event.target.value)}
          />
        </label>

        {state.error && (
          <p
            role="alert"
            className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
            style={{ background: alpha(colors.error, 10), borderColor: alpha(colors.error, 30) }}
          >
            {state.error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {/* Deshabilitado hasta que el nombre coincide: el servidor lo comprueba
              igual, pero un botón que se puede pulsar promete que va a funcionar. */}
          <Button type="submit" variant="danger" isLoading={pending} disabled={!coincide}>
            Borrar para siempre
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
