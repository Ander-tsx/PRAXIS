'use client';

import { setAssistantPlanAction } from '@/app/(private)/actions';
import { ADMIN_USER_INITIAL_STATE } from '@/lib/action-state';
import {
  ASSISTANT_PLANS,
  ASSISTANT_PLAN_LIMITS,
  type AdminUser,
  type AssistantPlanName,
  Button,
  Dialog,
  Select,
  Textarea,
  useAccion,
} from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface UserPlanDialogProps {
  usuario: AdminUser;
  open: boolean;
  onClose: () => void;
}

const DESCRIPCION: Record<AssistantPlanName, string> = {
  FREE: `${ASSISTANT_PLAN_LIMITS.FREE} preguntas al asistente al mes. Suficiente para probarlo.`,
  PRO: `${ASSISTANT_PLAN_LIMITS.PRO} preguntas al mes. Para quien lo use a diario.`,
};

/**
 * Cambia el plan del asistente de una cuenta.
 *
 * ⚠️ **Esto es lo que hace las veces de pasarela de pago.** No hay cobro ni lo
 * habrá por ahora: PRO se concede desde aquí, y el registro de actividad guarda
 * quién se lo dio a quién con `ASSISTANT_PLAN_CHANGED`. Sin ese rastro, un plan
 * de pago repartido a mano no tendría forma de auditarse.
 *
 * ⚠️ **Nadie puede cambiarse el plan a sí mismo**, y lo impide el gateway con la
 * misma regla que el resto del panel. Es deliberado: si no, cualquier
 * administrador se sube solo a 250 preguntas y el límite deja de significar
 * nada. Aquí no se repite la comprobación —el diálogo no se abre sobre la propia
 * cuenta— pero el servidor la aplica igualmente.
 */
export function UserPlanDialog({ usuario, open, onClose }: UserPlanDialogProps) {
  const [state, formAction, pending] = useAccion(setAssistantPlanAction, ADMIN_USER_INITIAL_STATE);

  const [elegido, setElegido] = useState<AssistantPlanName>(usuario.assistantPlan);

  useEffect(() => {
    if (state.done) onClose();
  }, [state, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Cambiar el plan del asistente"
      overflowVisible
      description={
        <>
          Cuántas preguntas al mes puede hacerle al asistente{' '}
          <strong className="text-text-primary">{nombreDe(usuario)}</strong>. El contador se pone a
          cero el día 1 de cada mes.
        </>
      }
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="userId" value={usuario.id} />

        <Select
          name="plan"
          label="Plan"
          value={elegido}
          onValueChange={(valor) => setElegido(valor as AssistantPlanName)}
          options={ASSISTANT_PLANS.map((plan) => ({
            value: plan,
            label: `${plan} — ${ASSISTANT_PLAN_LIMITS[plan]} al mes`,
          }))}
          fullWidth
          variant={state.error ? 'error' : 'default'}
          message={state.error ?? DESCRIPCION[elegido]}
        />

        <Textarea
          name="reason"
          label="Motivo"
          optional
          placeholder="Por qué cambia. Queda en el registro."
          rows={2}
          maxLength={500}
          fullWidth
        />

        <footer className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={pending} disabled={elegido === usuario.assistantPlan}>
            Guardar
          </Button>
        </footer>
      </form>

      <p className="mt-3 font-sans text-xs text-text-disabled">
        Plan actual: {usuario.assistantPlan}. No hay cobro: el plan se asigna a mano.
      </p>
    </Dialog>
  );
}

/** El mismo criterio que el resto del panel: nombre si lo hay, si no el correo. */
function nombreDe(usuario: AdminUser): string {
  const nombre = [usuario.firstName, usuario.lastName].filter(Boolean).join(' ').trim();
  return nombre || usuario.credential.email;
}
