'use client';

import { saveAutomationRuleAction } from '@/app/(private)/[id]/actions';
import { AUTOMATION_RULE_INITIAL_STATE } from '@/lib/action-state';
import { triggerSpecFor } from '@/lib/automation-catalog';
import { type RuleDraft, bodyFromDraft, draftFromRule, emptyDraft } from '@/lib/automation-draft';
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

  /** Lo que tiene que haber dentro cada vez que el diálogo se abre. */
  function borradorInicial(): RuleDraft {
    return rule ? draftFromRule(rule) : emptyDraft('TASK_DUE_SOON');
  }

  const [draft, setDraft] = useState<RuleDraft>(borradorInicial);
  /** Con qué se abrió, para saber si hay algo que perder al cerrar. */
  const [referencia, setReferencia] = useState<RuleDraft>(borradorInicial);
  const [touched, setTouched] = useState(false);
  /**
   * Cuenta las veces que se ha abierto el diálogo. Solo sirve para la `key` de
   * `ConditionsSection`, que guarda sus propias filas y tiene el mismo
   * problema que el borrador: las siembra con un *initializer* de `useState`
   * que no vuelve a correr. Vaciar `draft.conditions` no le llega — hay que
   * remontarla, que es el mecanismo que ya usaba para cambiar de trigger.
   */
  const [sesion, setSesion] = useState(0);

  /**
   * ⚠️ **Se siembra el borrador al abrir, no al cerrar.**
   *
   * El *initializer* de `useState` solo corre en el montaje, y este componente
   * **nunca se desmonta**: no lleva `key` y su posición en el árbol no cambia,
   * así que `revalidateProject` re-renderiza el Server Component padre sin
   * tocar el estado de este hijo. El diálogo de creación arrastraba entonces
   * el nombre y las condiciones de la regla anterior — crear dos seguidas
   * partía de lo que quedó de la primera, sin error y sin aviso. Hallazgo §3
   * del informe de revisión del Bloque 7.
   *
   * Al abrir se sabe con certeza qué debe haber; al cerrar hay dos motivos
   * distintos —guardado y cancelación— que no tienen por qué comportarse
   * igual. Y sembrar en el camino de cierre borraría lo escrito cuando el
   * servidor responde con error, que es justo lo que el diálogo tiene que
   * conservar.
   *
   * Tampoco vale un `key` sobre el `<Dialog>`: remontaría también `useAccion`
   * y se llevaría por delante el `state.error` que se acaba de recibir.
   */
  function abrir() {
    const inicial = borradorInicial();
    setDraft(inicial);
    setReferencia(inicial);
    /* Sin esto, un diálogo recién abierto y vacío nace con el nombre en rojo. */
    setTouched(false);
    setSesion((anterior) => anterior + 1);
    setOpen(true);
  }

  /**
   * Cerrar con cambios sin guardar pregunta antes. **Solo desde «Cancelar».**
   *
   * ⚠️ **`Esc`, la `X` y el clic en el fondo no preguntan, y no es un olvido.**
   * Las tres acaban en el `onClose` del `Dialog` de commons, que **no
   * significa «alguien pidió cerrar»** sino «el `<dialog>` nativo se cerró,
   * por lo que sea»: `setOpen(false)` dispara `dialog.close()`, que emite el
   * evento `close`, que vuelve a entrar por `onClose`. Colgar la guarda de
   * ahí hacía que un guardado **correcto** preguntara si se descartan los
   * cambios — reproducido, y el motivo de que esto se quedara en «Cancelar».
   *
   * Con `Esc` hay además un segundo problema: el navegador ya cerró el
   * diálogo cuando `onClose` llega, así que no se puede cancelar, solo
   * reabrir, y el efecto del `Dialog` no vuelve a correr porque su
   * dependencia `[open]` no ha cambiado.
   *
   * Cubrir las tres vías exige que `Dialog` distinga las dos cosas, y ese
   * componente lo usan 15 archivos: es un cambio con su propio alcance y su
   * propia regresión, no un detalle de este diálogo. Queda anotado.
   *
   * La comparación va sobre `bodyFromDraft` y no sobre el borrador crudo: es
   * el módulo que ya sabe cuál es la forma canónica del contrato, tiene un
   * orden de claves fijo y está probado. El borrador crudo no sirve —
   * `handleTriggerTypeChange` reconstruye el objeto y **reordena las
   * claves**, así que dos borradores idénticos podrían dar cadenas distintas
   * y la pregunta saldría siempre; una confirmación que salta siempre se
   * aprende a despachar sin leerla, y deja de proteger nada.
   *
   * Es `window.confirm` y no un segundo `Dialog`, igual que en
   * `handleTriggerTypeChange`: el `Dialog` de commons usa `showModal()`, y
   * dos modales nativos superpuestos traen su propia pila de foco que este
   * apartado no necesita estrenar.
   */
  function intentarCerrar() {
    const hayCambios =
      JSON.stringify(bodyFromDraft(draft)) !== JSON.stringify(bodyFromDraft(referencia));
    if (hayCambios && !window.confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?')) {
      return;
    }
    setOpen(false);
  }

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
      <Button variant={triggerVariant} size={triggerSize} onClick={abrir}>
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        /* Sin guarda a propósito — ver `intentarCerrar`. Aquí llegan tanto
           `Esc` y el clic en el fondo como el cierre programático tras
           guardar, y no se distinguen. */
        onClose={() => setOpen(false)}
        /* `xl` y no `lg`: una fila de condición son tres campos y un botón en
           la misma línea, y con 672 px el nombre del campo no cabía entero. */
        size="xl"
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
               dejan de tener sentido junto a campos que ya no existen.
               Y remonta también al reabrir (`sesion`), porque sus filas son
               estado suyo y no se derivan de `conditions` en cada render. */
            key={`${sesion}-${draft.triggerType}`}
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
            <Button type="button" variant="ghost" onClick={intentarCerrar}>
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
