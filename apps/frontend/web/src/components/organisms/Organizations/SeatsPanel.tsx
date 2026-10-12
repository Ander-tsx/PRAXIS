'use client';

import { cambiarAsientosAction } from '@/app/(privado)/main/team/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/main/action-state';
import { FloatingLabelInput, useAccion } from '@praxis/commons';
import { useId, useState } from 'react';

/**
 * Cambiar los asientos contratados.
 *
 * ⚠️ **Exige `canManageBilling`**, porque es lo único de este portal que cuesta
 * dinero: quien lleva el equipo invita y saca gente, pero no compromete la
 * tarjeta de nadie salvo que el dueño le dé ese permiso a propósito. El gateway
 * lo comprueba también — aquí solo se evita ofrecer lo que se va a negar.
 *
 * ⚠️ Y **no se puede bajar por debajo de la gente que ya está**, contando las
 * invitaciones pendientes. La alternativa —echar a alguien automáticamente— es
 * justo lo que el encargo prohíbe: el sistema no decide a quién se saca. El
 * error del servidor trae el número ocupado dentro, que es lo que hace falta
 * para saber a cuánto sí se puede bajar.
 */
export function SeatsPanel({
  organizationId,
  contratados,
  ocupados,
  tope,
  nombreDelPlan,
}: {
  organizationId: string;
  contratados: number;
  ocupados: number;
  /**
   * Cuántos asientos admite el plan como mucho. `null` si no tiene tope.
   *
   * ⚠️ **Acota el campo de verdad, no solo el texto.** Estaba a `max={500}`
   * fijo, así que se podía escribir 40 en un plan que admite 15: el navegador lo
   * aceptaba, la acción salía y el 402 llegaba del servidor. Pedir un número que
   * no puede existir y enterarse al confirmar es el peor sitio para descubrir el
   * tope de tu plan.
   */
  tope: number | null;
  /** Para nombrarlo en el aviso: «Equipo admite hasta 15». */
  nombreDelPlan: string;
}) {
  const [state, formAction, pending] = useAccion(cambiarAsientosAction, ORGANIZACION_INITIAL_STATE);
  const [seats, setSeats] = useState(contratados);
  const [confirmando, setConfirmando] = useState(false);
  const campoId = useId();

  const isUpgrading = seats > contratados;
  const isDowngrading = seats < contratados;
  const hasChanged = seats !== contratados;
  /** Ya está al máximo del plan: subir más exige cambiar de plan, no de cifra. */
  const enElTope = tope !== null && contratados >= tope;

  function reset() {
    setSeats(contratados);
    setConfirmando(false);
  }

  return (
    <section className="flex flex-col gap-4 max-w-md">
      {!confirmando ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <FloatingLabelInput
                id={campoId}
                type="number"
                label="Asientos contratados"
                min={Math.max(ocupados, 1)}
                /* El tope del plan, y 500 solo cuando no lo hay. Ver `tope`. */
                max={tope ?? 500}
                disabled={enElTope}
                value={String(seats)}
                onChange={(evento) => setSeats(Number(evento.target.value))}
              />
            </div>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={!hasChanged || enElTope}
              className="rounded-lg bg-white/10 px-5 py-2.5 h-[58px] font-sans text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cambiar
            </button>
          </div>
          <p className="font-sans text-xs text-white/50">
            Tienes {ocupados} {ocupados === 1 ? 'asiento ocupado' : 'asientos ocupados'} de{' '}
            {contratados} {contratados === 1 ? 'contratado' : 'contratados'} (las invitaciones sin
            aceptar también ocupan).
            {tope !== null && (
              <>
                {' '}
                {nombreDelPlan} admite hasta {tope}.
              </>
            )}
          </p>

          {/* Estar en el tope no es un error, así que no se pinta como tal: es
              la única situación en la que la salida no es escribir otro número
              sino subir de plan, y hay que decirlo donde se intenta. */}
          {enElTope && (
            <p className="font-sans text-xs text-white/70">
              Estás en el máximo de {nombreDelPlan}. Para más asientos hay que cambiar de plan.
            </p>
          )}
        </div>
      ) : (
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            const datos = new FormData();
            datos.set('organizationId', organizationId);
            datos.set('seats', String(seats));
            formAction(datos);
          }}
          className="flex flex-col gap-4 rounded-r-lg border-l-2 border-primary bg-primary/5 py-4 pl-4 pr-4"
        >
          <div className="flex flex-col gap-2">
            <h4 className="font-sans font-medium text-white">Confirma el cambio de asientos</h4>
            <p className="font-sans text-sm text-white/80">
              Vas a pasar de <strong className="text-white">{contratados}</strong> a{' '}
              <strong className="text-white">{seats}</strong> asientos.
            </p>
            {isUpgrading && (
              <p className="font-sans text-xs text-primary bg-primary/10 p-2 rounded-lg mt-1 border border-primary/20">
                <strong>Autorización de cobro:</strong> el precio del plan es{' '}
                <strong>por asiento</strong>, así que Stripe cargará a tu método de pago principal
                la parte proporcional de lo que queda de mes por{' '}
                {seats - contratados === 1
                  ? 'el asiento adicional'
                  : `los ${seats - contratados} asientos adicionales`}
                . Al confirmar, aceptas este cargo inmediato.
              </p>
            )}
            {isDowngrading && (
              <p className="font-sans text-xs text-white/70 bg-white/5 p-2 rounded-lg mt-1">
                Stripe calculará el tiempo no utilizado de {contratados - seats} asientos y lo
                añadirá como saldo a favor para tu próxima factura.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary text-white px-5 py-2 font-sans text-sm font-semibold transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? 'Procesando...' : 'Confirmar cambio'}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-lg px-5 py-2 font-sans text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}
      {state.done && !pending && (
        <p role="status" className="font-sans text-sm text-primary">
          Listo: la organización pasa a tener {state.done} asientos contratados.
        </p>
      )}
    </section>
  );
}
