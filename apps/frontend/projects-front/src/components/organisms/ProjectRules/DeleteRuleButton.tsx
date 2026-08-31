'use client';

import { deleteAutomationRuleAction } from '@/app/(private)/[id]/actions';
import { AUTOMATION_RULE_INITIAL_STATE } from '@/lib/action-state';
import { Button, useAccion } from '@praxis/commons';
import { useState } from 'react';

export interface DeleteRuleButtonProps {
  projectId: string;
  ruleId: string;
  ruleName: string;
}

/**
 * Eliminar una regla, confirmando **dentro de su propia fila**.
 *
 * ## 🔴 Ya no abre un diálogo, y no es una preferencia de estilo
 *
 * Esto sacaba un `<dialog>` a pantalla completa para preguntar por algo que ya
 * estaba señalado con el dedo: la regla que se va a borrar está en la fila donde
 * se pulsó. El modal la tapaba, tenía que repetir su nombre en el título para
 * que se supiera de cuál se hablaba, y devolvía el foco al principio de la
 * lista al cerrarse.
 *
 * Confirmar en la fila conserva el contexto —se sigue viendo la regla, con sus
 * condiciones— y hace la pregunta donde está la mano. Es la misma decisión que
 * el pie del constructor: nada de ventanas encima de ventanas.
 */
export function DeleteRuleButton({ projectId, ruleId, ruleName }: DeleteRuleButtonProps) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, formAction, pending] = useAccion(
    deleteAutomationRuleAction,
    AUTOMATION_RULE_INITIAL_STATE,
  );

  if (!confirmando) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
        Eliminar
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="ruleId" value={ruleId} />

      <div className="flex items-center gap-2">
        <span className="font-sans text-xs text-white">¿Eliminar «{ruleName}»?</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
          No
        </Button>
        <Button type="submit" variant="danger" size="sm" isLoading={pending}>
          Sí, eliminar
        </Button>
      </div>

      {state.error && (
        <p role="alert" className="font-sans text-xs text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
