'use client';

import { saveAutomationRuleAction } from '@/app/(private)/[id]/actions';
import { AUTOMATION_RULE_INITIAL_STATE } from '@/lib/action-state';
import { triggerSpecFor } from '@/lib/automation-catalog';
import { type RuleDraft, draftFromRule, emptyDraft } from '@/lib/automation-draft';
import { validateAutomationDraft } from '@/lib/validation';
import {
  type AutomationRule,
  type AutomationTriggerType,
  Button,
  Dialog,
  Input,
  Textarea,
  alpha,
  colors,
  useAccion,
} from '@praxis/commons';
import { useEffect, useId, useState } from 'react';
import { ActionsSection } from './ActionsSection';
import { ConditionsSection } from './ConditionsSection';
import { TriggerSection } from './TriggerSection';

export interface RuleDialogProps {
  projectId: string;
  /** Sin regla, crea una nueva. */
  rule?: AutomationRule;
  triggerLabel: string;
  /** El disparador se declara con props: `ProjectRules`/`RuleCard` son Server Components. */
  triggerVariant?: 'primary' | 'secondary' | 'ghost';
  triggerSize?: 'sm' | 'md';
}

/**
 * El constructor guiado: Cuando / Si / Entonces.
 *
 * Sirve para crear y para editar — con `rule` precarga vía `draftFromRule`.
 * Igual que `RoleDialog`: `useAccion`, borrador en `useState`, cierre al
 * confirmar, `noValidate` y `preventDefault` si hay error de cliente.
 */
export function RuleDialog({
  projectId,
  rule,
  triggerLabel,
  triggerVariant = 'secondary',
  triggerSize = 'md',
}: RuleDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useAccion(
    saveAutomationRuleAction,
    AUTOMATION_RULE_INITIAL_STATE,
  );
  const [draft, setDraft] = useState<RuleDraft>(() =>
    rule ? draftFromRule(rule) : emptyDraft('TASK_DUE_SOON'),
  );
  const [touched, setTouched] = useState(false);

  const nameId = useId();
  const clientError = validateAutomationDraft(draft);
  const spec = triggerSpecFor(draft.triggerType);
  const warnings = (spec?.warnings ?? [])
    .filter((warning) => warning.matches(draft))
    .map((warning) => warning.message);

  useEffect(() => {
    if (state.done) {
      setOpen(false);
      setTouched(false);
    }
  }, [state]);

  function handleTriggerTypeChange(nextType: string) {
    if (draft.conditions.length > 0) {
      const confirmado = window.confirm(
        'Cambiar el trigger descarta las condiciones que ya configuraste: pertenecen al catálogo del trigger anterior y el servidor las rechazaría con este.',
      );
      if (!confirmado) return;
    }
    const fresh = emptyDraft(nextType as AutomationTriggerType);
    setDraft({ ...fresh, name: draft.name, description: draft.description, status: draft.status });
  }

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={rule ? `Editar «${rule.name}»` : 'Nueva regla'}
        description="Cuando ocurre algo, si se cumplen las condiciones, entonces se ejecuta la acción."
      >
        <form
          action={formAction}
          noValidate
          onSubmit={(event) => {
            setTouched(true);
            if (clientError) event.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="projectId" value={projectId} />
          {rule && <input type="hidden" name="ruleId" value={rule.id} />}

          <Input
            id={nameId}
            name="name"
            label="Nombre"
            placeholder="Avisar tareas próximas a vencer"
            value={draft.name}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            maxLength={120}
            variant={touched && clientError ? 'error' : 'default'}
            message={touched && clientError ? clientError : undefined}
            autoComplete="off"
            fullWidth
          />

          <Textarea
            name="description"
            label="Descripción"
            optional
            value={draft.description}
            onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
            maxLength={1000}
            fullWidth
          />

          <TriggerSection
            triggerType={draft.triggerType}
            triggerConfig={draft.triggerConfig}
            onTriggerTypeChange={handleTriggerTypeChange}
            onConfigChange={(key, value) =>
              setDraft((d) => ({ ...d, triggerConfig: { ...d.triggerConfig, [key]: value } }))
            }
          />

          <ConditionsSection
            /* Remonta al cambiar de trigger: las filas de un catálogo
               distinto no se reconcilian, se sustituyen — sus ids internos
               dejan de tener sentido junto a campos que ya no existen. */
            key={draft.triggerType}
            triggerType={draft.triggerType}
            conditions={draft.conditions}
            onChange={(conditions) => setDraft((d) => ({ ...d, conditions }))}
          />

          {warnings.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border px-3 py-2 font-sans text-sm"
              style={{
                background: alpha(colors.warning, 10),
                borderColor: alpha(colors.warning, 30),
                color: colors.warning,
              }}
            >
              {warnings.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          <ActionsSection triggerType={draft.triggerType} />

          <label className="flex items-center gap-2 font-sans text-sm text-text-primary">
            <input
              type="checkbox"
              name="enabled"
              checked={draft.status === 'ENABLED'}
              onChange={(event) =>
                setDraft((d) => ({ ...d, status: event.target.checked ? 'ENABLED' : 'DISABLED' }))
              }
            />
            Activar esta regla
          </label>

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
            <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
              {rule ? 'Guardar cambios' : 'Crear regla'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
