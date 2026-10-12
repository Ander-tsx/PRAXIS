'use client';

import { deleteAccountAction } from '@/app/(privado)/main/profile/actions';
import { Button, Input, alpha, colors } from '@praxis/commons';
import { useId, useState } from 'react';

export interface DeleteAccountProps {
  /** El correo que hay que escribir para confirmar. */
  email: string;
  /**
   * `fila`: el aspecto de una entrada de menú, para la barra lateral. Cerrado es
   * una fila discreta y abierto ocupa el ancho disponible en vez de los 420 px de
   * la pantalla de antes.
   */
  variante?: 'boton' | 'fila';
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
export function DeleteAccount({ email, variante = 'boton' }: DeleteAccountProps) {
  const enFila = variante === 'fila';
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

  return (
    <div className={enFila ? 'w-full' : 'flex flex-col sm:flex-row items-start gap-6'}>
      {!abierto ? (
        enFila ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-sans text-[13px] font-medium text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <svg
              className="h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            Eliminar mi cuenta
          </button>
        ) : (
          <Button type="button" variant="danger" size="sm" onClick={() => setAbierto(true)}>
            Eliminar mi cuenta
          </Button>
        )
      ) : (
        <div
          className={`flex flex-col gap-4 bg-white/5 border border-red-500/20 rounded-2xl p-4 shadow-2xl relative ${
            enFila ? 'w-full' : 'sm:p-5 w-full sm:w-[420px]'
          }`}
        >
          <div>
            <p className="font-sans text-[15px] font-bold text-red-400 mb-1">
              Esto no se puede deshacer.
            </p>
            <p className="font-sans text-[13px] text-white leading-relaxed">
              Se borra tu cuenta y pierdes el acceso a los proyectos. Lo que hayas escrito sigue
              ahí, sin tu nombre.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={campoId} className="font-sans text-[13px] text-white">
              Escribe <strong className="text-white font-medium">{email}</strong> para confirmar
            </label>
            <input
              id={campoId}
              value={confirmacion}
              onChange={(evento) => setConfirmacion(evento.target.value)}
              placeholder={email}
              autoComplete="off"
              disabled={borrando}
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-50"
            />
          </div>

          {error && (
            <p role="alert" className="font-sans text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void eliminar()}
              disabled={!coincide || borrando}
              className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:bg-white/5 disabled:text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
            >
              {borrando ? 'Eliminando…' : 'Eliminar cuenta'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setConfirmacion('');
                setError(null);
              }}
              disabled={borrando}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-text-secondary hover:text-white hover:bg-white/5 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
