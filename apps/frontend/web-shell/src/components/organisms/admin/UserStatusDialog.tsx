'use client';

import { setUserStatusAction } from '@/app/(privado)/admin/actions';
import { ADMIN_USER_INITIAL_STATE } from '@/lib/admin/action-state';
import { ESTADOS, nombreDe } from '@/lib/admin/admin';
import { type AdminUser, Button, Dialog, Textarea, useAccion } from '@praxis/commons';
import { useEffect } from 'react';

export interface UserStatusDialogProps {
  usuario: AdminUser;
  open: boolean;
  onClose: () => void;
}

/**
 * Suspender o reactivar una cuenta.
 *
 * ## El motivo, y por qué solo al suspender
 *
 * Suspender sin decir por qué produce una cuenta bloqueada que nadie sabe
 * explicar: ni la persona afectada, que solo ve «credenciales inválidas», ni el
 * siguiente administrador que mire el registro. Reactivar deshace, y deshacer no
 * necesita justificarse.
 *
 * ## Lo que el diálogo advierte
 *
 * Que **no es inmediato**: su sesión abierta aguanta hasta 15 minutos, lo que le
 * quede al access token. Decirlo aquí evita el diagnóstico equivocado —«no ha
 * funcionado, lo suspendo otra vez»— cuando lo que pasa es que aún no ha
 * caducado. Ver ESTADO-ACTUAL: el refresh ya se corta al instante, y ese es el
 * que mantenía la sesión viva indefinidamente.
 *
 * `noValidate` y validación propia: la nativa del navegador corta el `onSubmit`
 * de React y el formulario se queda mudo (ESTADO-ACTUAL §17.6).
 */
export function UserStatusDialog({ usuario, open, onClose }: UserStatusDialogProps) {
  const [state, formAction, pending] = useAccion(setUserStatusAction, ADMIN_USER_INITIAL_STATE);

  const activa = usuario.status === 'ACTIVE';
  const nuevoEstado = activa ? 'SUSPENDED' : 'ACTIVE';

  /* Se cierra cuando el servidor confirma, no al pulsar: si el cambio falla, el
     diálogo sigue abierto con el mensaje y con lo escrito. */
  useEffect(() => {
    if (state.done) onClose();
  }, [state, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={activa ? 'Suspender la cuenta' : 'Reactivar la cuenta'}
      description={
        activa ? (
          <>
            <strong className="text-text-primary">{nombreDe(usuario)}</strong> dejará de poder
            entrar. Sus proyectos, tareas y comentarios se quedan como están, y esto se deshace
            cuando quieras.
          </>
        ) : (
          <>
            <strong className="text-text-primary">{nombreDe(usuario)}</strong> volverá a poder
            entrar con normalidad.
          </>
        )
      }
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="userId" value={usuario.id} />
        <input type="hidden" name="status" value={nuevoEstado} />

        {activa && (
          <>
            <Textarea
              name="reason"
              label="Motivo"
              placeholder="Qué ha pasado. Lo verá quien consulte el registro."
              rows={3}
              maxLength={500}
              showCount
              fullWidth
              variant={state.error ? 'error' : 'default'}
              message={state.error ?? undefined}
            />

            <p className="rounded-lg bg-surface-elevated px-3 py-2 font-sans text-xs text-white">
              Su sesión abierta puede aguantar hasta <strong>15 minutos</strong>, lo que le quede a
              su token. No podrá volver a entrar ni renovarla.
            </p>
          </>
        )}

        {!activa && state.error && <p className="font-sans text-sm text-error">{state.error}</p>}

        <footer className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant={activa ? 'danger' : 'primary'} isLoading={pending}>
            {activa ? 'Suspender' : 'Reactivar'}
          </Button>
        </footer>
      </form>

      <p className="mt-3 font-sans text-xs text-white">
        Estado actual: {ESTADOS[usuario.status].etiqueta}. {ESTADOS[usuario.status].descripcion}
      </p>
    </Dialog>
  );
}
