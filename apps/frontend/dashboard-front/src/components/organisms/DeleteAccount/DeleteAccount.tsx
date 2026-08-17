'use client';

import { deleteAccountAction } from '@/app/(private)/profile/actions';
import { Button, Input, alpha, colors } from '@praxis/commons';
import { useId, useState } from 'react';

export interface DeleteAccountProps {
  /** El correo que hay que escribir para confirmar. */
  email: string;
}

/**
 * Eliminar la cuenta.
 *
 * ## Por qué hay que escribir el correo
 *
 * `DELETE /users/:id` **no pide confirmación**: comprueba que seas el dueño y
 * borra. No hay papelera, no hay deshacer y no hay un correo de aviso, así que
 * toda la defensa vive aquí. Escribir el correo exacto es el mismo trato que
 * ya recibe borrar un proyecto, y por el mismo motivo: lo que no tiene vuelta
 * atrás no puede irse en un clic de más.
 *
 * ## Y por qué está aquí abajo, en rojo y plegada
 *
 * Es lo único destructivo de la pantalla. Va la última, detrás de todo lo que
 * se usa a diario, y **cerrada**: hay que pedirla para verla.
 *
 * El marco rojo lo pone `PanelCard` con `tone="danger"`, así que aquí dentro
 * no se repite: dos recuadros rojos concéntricos no avisan el doble.
 */
export function DeleteAccount({ email }: DeleteAccountProps) {
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const campoId = useId();

  const coincide = confirmacion.trim().toLowerCase() === email.toLowerCase();

  async function eliminar() {
    setError(null);
    setBorrando(true);

    const resultado = await deleteAccountAction(confirmacion);
    if (resultado.error) {
      setError(resultado.error);
      setBorrando(false);
      return;
    }

    /**
     * La cuenta ya no está: toca cerrar la sesión de verdad.
     *
     * Por `/auth/api/logout`, igual que el botón de siempre: borra el refresh
     * de Redis además de las cookies. Y después navegación **dura** a la
     * portada, para que no quede en memoria nada de la sesión anterior.
     */
    try {
      await fetch('/auth/api/logout', { method: 'POST' });
    } catch {
      /* Aunque falle, se sale igual: las cookies caducan solas y quedarse
         dentro con una cuenta que ya no existe es peor. */
    }
    window.location.assign('/');
  }

  if (!abierto) {
    return (
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setAbierto(true)}
      >
        Eliminar mi cuenta
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-sans text-sm font-semibold" style={{ color: colors.error }}>
        Esto no se puede deshacer.
      </p>
      <p className="font-sans text-xs text-text-secondary">
        Se borra tu cuenta y dejas de tener acceso a los proyectos donde estás. Lo que hayas escrito
        en un chat o comentado en una tarea sigue ahí, sin tu nombre. Los proyectos que sean tuyos
        no se borran con la cuenta: pásalos a otra persona antes si quieres que sigan.
      </p>

      <label htmlFor={campoId} className="font-sans text-xs text-text-secondary">
        Escribe <strong className="text-text-primary">{email}</strong> para confirmar
      </label>
      <Input
        id={campoId}
        value={confirmacion}
        onChange={(evento) => setConfirmacion(evento.target.value)}
        placeholder={email}
        autoComplete="off"
        disabled={borrando}
      />

      {error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="danger"
          onClick={() => void eliminar()}
          /* Sin el correo exacto el botón no se puede pulsar: la comprobación
             se repite en el servidor, pero aquí evita el intento. */
          disabled={!coincide || borrando}
        >
          {borrando ? 'Eliminando…' : 'Eliminar mi cuenta para siempre'}
        </Button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setConfirmacion('');
            setError(null);
          }}
          disabled={borrando}
          className="cursor-pointer rounded-lg px-3 py-2 font-sans text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
