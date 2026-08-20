'use client';

import { deleteAutomationRuleAction } from '@/app/(private)/[id]/actions';
import { AUTOMATION_RULE_INITIAL_STATE } from '@/lib/action-state';
import { Button, Dialog, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface DeleteRuleButtonProps {
  projectId: string;
  ruleId: string;
  ruleName: string;
}

/** Eliminar una regla, con confirmación — calcado de `DeleteRoleButton`. */
export function DeleteRuleButton({ projectId, ruleId, ruleName }: DeleteRuleButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useAccion(
    deleteAutomationRuleAction,
    AUTOMATION_RULE_INITIAL_STATE,
  );

  useEffect(() => {
    if (state.done) setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Eliminar
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Eliminar «${ruleName}»`}
        description="Esta acción no se puede deshacer."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="ruleId" value={ruleId} />

          {state.error && (
            <p
              role="alert"
              className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
              style={{
                background: alpha(colors.error, 10),
                borderColor: alpha(colors.error, 30),
              }}
            >
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" isLoading={pending}>
              Eliminar regla
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
