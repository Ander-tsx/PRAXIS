'use client';

import { cambiarAsientosAction } from '@/app/(private)/team/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
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
}: {
  organizationId: string;
  contratados: number;
  ocupados: number;
}) {
  const [state, formAction, pending] = useAccion(cambiarAsientosAction, ORGANIZACION_INITIAL_STATE);
  const [seats, setSeats] = useState(contratados);
  const campoId = useId();

  return (
    <section className="flex flex-col gap-3">
      {/* ⚠️ `onSubmit` y no `action={…}`: esto **edita** un valor que ya existe,
          y un `<form action>` se resetea solo en React 19 — el campo volvería a
          su `defaultValue`, que es el número viejo. Ver CLAUDE.md. */}
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          const datos = new FormData();
          datos.set('organizationId', organizationId);
          datos.set('seats', String(seats));
          formAction(datos);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="w-40">
          <FloatingLabelInput
            id={campoId}
            type="number"
            label="Contratados"
            min={Math.max(ocupados, 1)}
            max={500}
            value={String(seats)}
            onChange={(evento) => setSeats(Number(evento.target.value))}
          />
        </div>
        <button
          type="submit"
          disabled={pending || seats === contratados}
          className="rounded-full border border-white/[0.14] bg-white/[0.04] px-4 py-2 font-sans text-xs font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Cambiando…' : 'Cambiar'}
        </button>
      </form>

      <p className="font-sans text-xs text-white/45">
        Ahora mismo hay {ocupados} ocupados, contando invitaciones pendientes. Al subir, Stripe
        cobra la parte proporcional de lo que queda de mes.
      </p>

      {state.error && (
        <p role="alert" className="font-sans text-sm text-red-400">
          {state.error}
        </p>
      )}
      {state.done && (
        <p role="status" className="font-sans text-sm text-emerald-400">
          Ahora tienes {state.done} asientos.
        </p>
      )}
    </section>
  );
}
