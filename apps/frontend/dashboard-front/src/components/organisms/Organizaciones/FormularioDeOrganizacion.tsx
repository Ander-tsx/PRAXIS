'use client';

import { crearOrganizacionAction } from '@/app/(private)/organizations/actions';
import { CREAR_ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import { Button, Input, Select, alpha, colors, useAccion } from '@praxis/commons';
import type { PlanSpec, PlanTier } from '@praxis/commons/billing/planes';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

/**
 * Crear la organización que va a pagar un plan de empresa.
 *
 * ## Por qué se crea antes de pagar y no al revés
 *
 * Porque el checkout necesita saber **quién paga**: el `client_reference_id` de
 * la sesión de Stripe lleva el id de la organización, y es lo único que ata el
 * pago a algo de PRAXIS. Sin ella, el webhook llegaría sin saber a quién darle
 * el plan.
 *
 * ⚠️ **La organización nace sin plan**, con las cuotas de FREE, y eso se dice
 * aquí: es lo honesto —todavía no ha pagado nadie— y evita la sorpresa de
 * invitar a diez personas y descubrir que el tope sigue siendo el de siempre.
 */
export function FormularioDeOrganizacion({
  planes,
  tierInicial,
}: {
  /** Solo los de empresa, ya filtrados por la página. */
  planes: PlanSpec[];
  /** El que venía en la URL desde la tabla de precios, si venía alguno. */
  tierInicial: PlanTier | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useAccion(
    crearOrganizacionAction,
    CREAR_ORGANIZACION_INITIAL_STATE,
  );

  const elegidoPorDefecto =
    planes.find((plan) => plan.tier === tierInicial)?.tier ?? planes[0]?.tier ?? 'TEAM';

  const [tier, setTier] = useState<PlanTier>(elegidoPorDefecto);
  const [seats, setSeats] = useState<number>(
    planes.find((plan) => plan.tier === elegidoPorDefecto)?.asientosMinimos ?? 3,
  );

  const nombreId = useId();
  const asientosId = useId();

  const spec = planes.find((plan) => plan.tier === tier);
  const minimo = spec?.asientosMinimos ?? 1;

  /* Al cambiar de plan, los asientos suben al mínimo del nuevo si se quedaron
     por debajo: mandar 3 sobre un plan que empieza en 10 es un 400 que la
     pantalla puede evitar sin quitarle a nadie el número que ya había escrito. */
  useEffect(() => {
    setSeats((actuales) => (actuales < minimo ? minimo : actuales));
  }, [minimo]);

  useEffect(() => {
    if (state.creada) router.push(`/organizations/${state.creada}`);
  }, [state.creada, router]);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5" noValidate>
      <Input
        id={nombreId}
        name="name"
        label="Cómo se llama"
        placeholder="Estudio Nordeste"
        maxLength={80}
        fullWidth
        required
      />

      <Select
        name="tier"
        label="Plan"
        value={tier}
        onValueChange={(elegido) => setTier(elegido as PlanTier)}
        options={planes.map((plan) => ({
          value: plan.tier,
          label: `${plan.nombre} — desde ${plan.asientosMinimos} asientos`,
        }))}
        fullWidth
      />

      <Input
        id={asientosId}
        name="seats"
        type="number"
        label="Asientos"
        min={minimo}
        max={500}
        value={String(seats)}
        onChange={(event) => setSeats(Number(event.target.value))}
        fullWidth
      />

      <p className="font-sans text-sm text-text-secondary">
        {/* ⚠️ Una invitación ocupa asiento desde que se manda, no desde que la
            aceptan. Decirlo aquí evita contratar justo para la gente que hay y
            descubrirlo al invitar a la última persona. */}
        Cada asiento es una persona dentro, contando las invitaciones que estén esperando respuesta.
        Se pueden cambiar después.
      </p>

      <div
        className="rounded-2xl border px-4 py-3 font-sans text-sm text-text-secondary"
        style={{ borderColor: alpha(colors.primary, 30), background: alpha(colors.primary, 6) }}
      >
        La organización se crea ahora y <strong>el plan se paga después</strong>, desde su portal.
        Hasta que llegue el pago, sus cuotas son las del plan gratuito.
      </div>

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" isLoading={pending}>
          Crear organización
        </Button>
      </div>
    </form>
  );
}
