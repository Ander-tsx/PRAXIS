'use client';

import { saveAutomationRuleAction } from '@/app/(private)/[id]/actions';
import { AUTOMATION_RULE_INITIAL_STATE } from '@/lib/action-state';
import {
  type AutomationCatalog,
  type OpcionesDelProyecto,
  triggerSpecFor,
} from '@/lib/automation-catalog';
import {
  type RuleDraft,
  coerceConditionValue,
  draftFromRule,
  emptyDraft,
} from '@/lib/automation-draft';
import { type AutomationErrorScope, validateAutomationDraft } from '@/lib/validation';
import { type AutomationRule, Button, Checkbox, Input, useAccion } from '@praxis/commons';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { ActionsSection } from './ActionsSection';
import { type ConditionRow, ConditionsSection, rowsFromConditions } from './ConditionsSection';
import { TriggerSection } from './TriggerSection';

export interface RuleBuilderProps {
  projectId: string;
  catalog: AutomationCatalog;
  proyecto: OpcionesDelProyecto;
  /** Sin regla, crea una nueva. */
  rule?: AutomationRule;
  onClose: () => void;
}

/**
 * El constructor de una regla: Cuando / Si / Entonces.
 *
 * ## 🔴 Ya no es un modal, y el motivo no es estético
 *
 * Esto vivía en un `<dialog>`. Un modal tapa la lista de reglas que estás
 * intentando complementar, secuestra el foco y el `Esc`, y obliga a decidir qué
 * pasa al cerrarlo con cambios sin guardar — que era, literalmente, un
 * `confirm()` del navegador encima de otra ventana encima de la página.
 *
 * Ahora se despliega **dentro de la sección**: la lista sigue ahí arriba, el
 * panel crece hasta lo que ocupe, y cerrar con cambios sin guardar se resuelve
 * en el pie del propio formulario, donde está la mano.
 *
 * ## ⚠️ Todo lo que se escribe viaja en el `FormData`, también lo que no es `<input>`
 *
 * El disparador se elige con botones y las condiciones y acciones se editan con
 * estado de React. Cada uno emite además un campo oculto: la Server Function
 * recibe un `FormData` y no ve el estado del cliente. Si un control deja de
 * emitir el suyo, lo que se guarda deja de ser lo que se veía **sin ningún
 * error** — es el fallo más caro posible aquí.
 */
export function RuleBuilder({ projectId, catalog, proyecto, rule, onClose }: RuleBuilderProps) {
  const [state, formAction, pending] = useAccion(
    saveAutomationRuleAction,
    AUTOMATION_RULE_INITIAL_STATE,
  );

  const inicial = (): RuleDraft =>
    rule ? draftFromRule(rule) : emptyDraft(catalog, catalog.triggers[0]?.type ?? '');

  const [draft, setDraft] = useState<RuleDraft>(inicial);
  const [rows, setRows] = useState<ConditionRow[]>(() =>
    rule ? rowsFromConditions(rule.conditions) : [],
  );
  /**
   * Con qué se abrió, para saber si hay algo que perder al cerrar.
   *
   * 🔴 **Se congela el estado inicial, no se vuelve a construir.** Esto llamaba
   * otra vez a `inicial()` y a `rowsFromConditions()`, y esa segunda llamada no
   * devuelve lo mismo: cada fila de condición nace con un `crypto.randomUUID()`
   * propio. Así que la referencia difería del estado desde el primer render y
   * **toda regla abierta para editar se creía modificada**: pulsar «Cancelar»
   * sin haber tocado nada preguntaba si descartar los cambios, y quien lo veía
   * no tenía forma de saber que no había ninguno.
   */
  const [referencia] = useState(() => JSON.stringify({ draft, rows }));
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  /**
   * Cuántas condiciones se llevó por delante el último cambio de disparador.
   *
   * 🔴 **Descartarlas en silencio es perder lo que alguien acaba de escribir.**
   * Antes había un `confirm()` del navegador, que se retiró con el resto de
   * diálogos del sistema (D4) — y con él se fue el aviso entero, no solo la
   * ventana. Cambiar de disparador vaciaba la sección «Si» sin decir nada, y
   * quien tuviera la sección plegada ni siquiera lo veía.
   *
   * No se pregunta antes, se cuenta después: preguntar obliga a decidir sobre
   * algo que todavía no se ve, y aquí deshacer es elegir el disparador de
   * antes.
   */
  const [condicionesDescartadas, setCondicionesDescartadas] = useState(0);
  const [errorCliente, setErrorCliente] = useState<{
    ambito: AutomationErrorScope;
    mensaje: string;
  } | null>(null);

  const nombreId = useId();
  const descripcionId = useId();
  const habilitadaId = useId();

  /* Al guardar bien, la acción devuelve `done` y el panel se cierra solo: dejar
     abierto un formulario cuyo contenido ya está en la lista de arriba invita a
     guardarlo dos veces. */
  useEffect(() => {
    if (state.done) onClose();
  }, [state.done, onClose]);

  const trigger = triggerSpecFor(catalog, draft.triggerType);

  /**
   * El borrador tal y como lo va a reconstruir el servidor.
   *
   * ⚠️ **Las filas guardan texto crudo y el contrato espera valores tipados**,
   * así que se coaccionan con la misma función que usa `draftFromFormData`. Si
   * se validara el texto, la comprobación del cliente diría que todo está bien
   * sobre unos datos que no son los que se van a enviar — que es peor que no
   * validar.
   */
  const borradorParaValidar: RuleDraft = {
    ...draft,
    conditions: rows.map((fila) => ({
      field: fila.field,
      operator: fila.operator,
      value: coerceConditionValue(
        catalog,
        draft.triggerType,
        fila.field,
        fila.operator,
        fila.value,
      ),
    })),
  };

  const hayCambios = JSON.stringify({ draft, rows }) !== referencia;

  function intentarCerrar() {
    if (!hayCambios) return onClose();
    setConfirmandoCierre(true);
  }

  return (
    /**
     * ⚠️ **El `aria-label` no es decorativo: es lo que convierte esto en una
     * región.** Un `<form>` sin nombre accesible no expone rol de formulario,
     * así que este panel —que dejó de ser un modal en S3 y pasó a desplegarse
     * dentro de la pestaña— no se podía anunciar ni localizar como una unidad:
     * quien navega con lector de pantalla se encontraba los campos sueltos
     * detrás de la lista de reglas, sin nada que dijera dónde empiezan.
     */
    <form
      aria-label={rule ? `Editar «${rule.name}»` : 'Nueva regla'}
      action={formAction}
      noValidate
      onSubmit={(event) => {
        /* Se valida con lo que hay en pantalla, coaccionado igual que lo hará
           el servidor. El mensaje llega antes y dice qué parte falla. */
        const error = validateAutomationDraft(catalog, borradorParaValidar);
        if (error) {
          event.preventDefault();
          setErrorCliente(error);
        }
      }}
      className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <input type="hidden" name="projectId" value={projectId} />
      {rule && <input type="hidden" name="ruleId" value={rule.id} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-sans text-xs font-medium text-text-secondary">Nombre</span>
          <Input
            id={nombreId}
            name="name"
            value={draft.name}
            placeholder="Avisar de lo que vence mañana"
            aria-invalid={errorCliente?.ambito === 'name' || undefined}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
              setErrorCliente(null);
            }}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-sans text-xs font-medium text-text-secondary">
            Descripción <span className="text-text-disabled">(opcional)</span>
          </span>
          <Input
            id={descripcionId}
            name="description"
            value={draft.description}
            placeholder="Para qué sirve"
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
      </div>

      <TriggerSection
        catalog={catalog}
        triggerType={draft.triggerType}
        config={draft.triggerConfig}
        onChangeTrigger={(type) => {
          const nuevo = emptyDraft(catalog, type);
          /* Cambiar de disparador **descarta las condiciones**: los campos que
             ofrece cada uno no son los mismos, y conservarlas dejaría filas
             sobre campos que ese disparador no tiene — que el servidor rechaza
             con un mensaje sobre un campo que ya no está en pantalla. Lo demás
             se conserva: el nombre y las acciones siguen valiendo. */
          setDraft({
            ...nuevo,
            name: draft.name,
            description: draft.description,
            actions: draft.actions,
            status: draft.status,
          });
          setCondicionesDescartadas(rows.length);
          setRows([]);
        }}
        onChangeConfig={(key, value) =>
          setDraft({ ...draft, triggerConfig: { ...draft.triggerConfig, [key]: value } })
        }
      />

      {condicionesDescartadas > 0 && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-warning-muted px-3.5 py-2.5 font-sans text-sm text-text-primary"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          {condicionesDescartadas === 1
            ? 'Se descartó la condición que tenías: los campos de este disparador son otros.'
            : `Se descartaron las ${condicionesDescartadas} condiciones que tenías: los campos de este disparador son otros.`}
        </p>
      )}

      {trigger && (
        <ConditionsSection
          catalog={catalog}
          trigger={trigger}
          rows={rows}
          onChange={(nuevas) => {
            setRows(nuevas);
            /* Tocar las condiciones es haber leído el aviso. */
            setCondicionesDescartadas(0);
          }}
          proyecto={proyecto}
        />
      )}

      <ActionsSection
        catalog={catalog}
        actions={draft.actions}
        onChange={(actions) => {
          setDraft({ ...draft, actions });
          setErrorCliente(null);
        }}
        proyecto={proyecto}
      />

      {/* El mismo átomo que los permisos de un rol, y no un `<input>` a pelo:
          aquel salía como la casilla del sistema, con su tamaño y su color, al
          lado de controles que sí tienen el aspecto de la casa. */}
      <Checkbox
        id={habilitadaId}
        name="enabled"
        label="Activar la regla al guardar"
        hint="Sin esto se guarda parada y no hace nada hasta que la actives."
        checked={draft.status === 'ENABLED'}
        onChange={(event) =>
          setDraft({ ...draft, status: event.target.checked ? 'ENABLED' : 'DISABLED' })
        }
      />

      {(errorCliente || state.error) && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-error-muted px-3.5 py-2.5 font-sans text-sm text-error"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {errorCliente?.mensaje ?? state.error}
        </p>
      )}

      {/* 🔴 **El aviso de cambios sin guardar, dentro del formulario.**

          Esto era un `confirm()` del navegador: una ventana del sistema, con
          los botones del sistema, encima de un modal, encima de la página. No
          se puede leer con el resto del contexto delante, no se puede estilar,
          y en el momento en que salta ya no se ve lo que se iba a perder.

          Aquí el pie cambia de estado: la pregunta aparece donde estaba el
          botón, con el formulario entero todavía a la vista. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {confirmandoCierre ? (
          <>
            <p className="font-sans text-sm text-text-primary">
              Tienes cambios sin guardar. ¿Los descarto?
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmandoCierre(false)}>
                Seguir editando
              </Button>
              <Button type="button" variant="danger" onClick={onClose}>
                Descartar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="font-sans text-xs text-text-disabled">
              {hayCambios ? 'Hay cambios sin guardar.' : 'Nada que guardar todavía.'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={intentarCerrar}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={pending}>
                {rule ? 'Guardar cambios' : 'Crear regla'}
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
