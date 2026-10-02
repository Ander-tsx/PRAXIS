'use client';

import {
  grantOrganizationPlanAction,
  revokeOrganizationPlanAction,
} from '@/app/(privado)/admin/actions';
import { ADMIN_USER_INITIAL_STATE } from '@/lib/admin/action-state';
import type { AdminOrganization } from '@/lib/admin/admin';
import { Button, useAccion } from '@praxis/commons';
import { type FormEvent, useState } from 'react';

const PLANES = [
  { value: 'ENTERPRISE', label: 'Empresa' },
  { value: 'BUSINESS', label: 'Negocio' },
  { value: 'TEAM', label: 'Equipo' },
  { value: 'PRO', label: 'Pro' },
];

/**
 * Conceder o retirar un plan **sin cobrar**, desde administración.
 *
 * Para las organizaciones del propio equipo, que no deberían pagarse a sí
 * mismas. Queda en el registro de administración, y mientras dura Stripe no
 * toca ese plan: se puede cancelar lo que se pagaba antes sin perderlo.
 *
 * `onSubmit` y no `action`: son formularios de edición (CLAUDE.md).
 */
export function PlanGrantControl({ organizacion }: { organizacion: AdminOrganization }) {
  const [concedido, conceder, concediendo] = useAccion(
    grantOrganizationPlanAction,
    ADMIN_USER_INITIAL_STATE,
  );
  const [retirado, retirar, retirando] = useAccion(
    revokeOrganizationPlanAction,
    ADMIN_USER_INITIAL_STATE,
  );
  const [tier, setTier] = useState('ENTERPRISE');
  const [confirmando, setConfirmando] = useState(false);

  function enviar(evento: FormEvent<HTMLFormElement>, accion: (datos: FormData) => void) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('organizationId', organizacion.id);
    datos.set('tier', tier);
    accion(datos);
    setConfirmando(false);
  }

  const error = concedido.error ?? retirado.error;

  if (organizacion.granted) {
    return (
      <form onSubmit={(e) => enviar(e, retirar)} className="flex flex-col items-start gap-1">
        {confirmando ? (
          <span className="flex items-center gap-1">
            <Button type="submit" variant="danger" size="sm" disabled={retirando}>
              {retirando ? 'Retirando…' : 'Volver a Gratis'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
            Retirar plan
          </Button>
        )}
        {error && <span className="font-sans text-xs text-error">{error}</span>}
      </form>
    );
  }

  return (
    <form onSubmit={(e) => enviar(e, conceder)} className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1">
        <select
          aria-label="Plan a conceder"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1 font-sans text-xs text-text-primary"
        >
          {PLANES.map((plan) => (
            <option key={plan.value} value={plan.value}>
              {plan.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" disabled={concediendo}>
          {concediendo ? 'Concediendo…' : 'Conceder'}
        </Button>
      </span>
      {error && <span className="font-sans text-xs text-error">{error}</span>}
    </form>
  );
}
