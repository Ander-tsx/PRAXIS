'use client';

import {
  type AutomationCatalog,
  OPERADORES,
  type OpcionesDelProyecto,
  type TriggerSpec,
} from '@/lib/automation-catalog';
import { Button, Select } from '@praxis/commons';
import { Plus, X } from 'lucide-react';
import { ValueField } from './ValueField';

/** Una fila del editor: el valor vive como **texto crudo**, no coaccionado. */
export interface ConditionRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface ConditionsSectionProps {
  catalog: AutomationCatalog;
  trigger: TriggerSpec;
  rows: ConditionRow[];
  onChange: (rows: ConditionRow[]) => void;
  proyecto: OpcionesDelProyecto;
}

/**
 * El «Si»: qué tiene que cumplirse para que la regla actúe.
 *
 * ## ⚠️ El valor se guarda como texto y se coacciona al enviar
 *
 * Un `<input>` siempre da texto, y el contrato espera número, booleano, fecha o
 * lista según el campo. Coaccionar en cada tecla obliga a volver a pintar el
 * valor coaccionado, y eso se come lo que se está escribiendo: un «3,» en una
 * lista se convertía en `["3"]`, que volvía como «3» y borraba la coma. Aquí
 * vive el texto; `coerceConditionValue` lo traduce una sola vez, al enviar.
 *
 * ## ⚠️ Cada fila emite los tres campos, siempre
 *
 * `conditionField`, `conditionOperator` y `conditionValue` se recomponen por
 * posición en `draftFromFormData`. Un campo que no se emitiera —el valor de un
 * booleano en «No», por ejemplo— desplazaría todas las filas siguientes y la
 * regla se guardaría con condiciones que nadie escribió.
 */
export function ConditionsSection({
  catalog,
  trigger,
  rows,
  onChange,
  proyecto,
}: ConditionsSectionProps) {
  function actualizar(id: string, cambios: Partial<ConditionRow>) {
    onChange(rows.map((fila) => (fila.id === id ? { ...fila, ...cambios } : fila)));
  }

  function anadir() {
    const campo = trigger.fields[0];
    if (!campo) return;
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        field: campo.field,
        operator: campo.operators[0] ?? 'EQUALS',
        value: valorInicial(campo.kind),
      },
    ]);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-sans text-sm font-semibold text-text-primary">
        Si…{' '}
        <span className="font-normal text-white">
          ¿sobre qué tareas? (opcional, y todas tienen que cumplirse)
        </span>
      </legend>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 font-sans text-sm text-white">
          Sin condiciones, la regla actúa sobre toda tarea que encaje con el disparador.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((fila) => {
            const campo = trigger.fields.find((uno) => uno.field === fila.field);
            return (
              <li
                key={fila.id}
                className="flex flex-wrap items-start gap-2 rounded-xl border border-border bg-surface-elevated p-3"
              >
                <input type="hidden" name="conditionField" value={fila.field} />
                <input type="hidden" name="conditionOperator" value={fila.operator} />
                <input type="hidden" name="conditionValue" value={fila.value} />

                {/* ⚠️ **14rem, y sale de medir la etiqueta más larga.** Con
                    `9rem` el `Select` truncaba «Número de encargados» a
                    «Número de enc…» en cuanto la ventana bajaba de 1000 px, y
                    una condición que no se puede leer no se puede comprobar.
                    La fila es `flex-wrap`: si no caben los tres campos, baja a
                    la línea siguiente en vez de estrecharse. */}
                <div className="min-w-[14rem] flex-1">
                  <Select
                    label="Campo"
                    fullWidth
                    options={trigger.fields.map((uno) => ({
                      value: uno.field,
                      label: uno.label,
                    }))}
                    value={fila.field}
                    onValueChange={(valor) => {
                      const nuevo = trigger.fields.find((uno) => uno.field === valor);
                      if (!nuevo) return;
                      /* Al cambiar de campo se reinician operador y valor: el
                         operador anterior puede no existir sobre el campo nuevo
                         —`GT` sobre un booleano— y el valor casi nunca encaja. */
                      actualizar(fila.id, {
                        field: nuevo.field,
                        operator: nuevo.operators[0] ?? 'EQUALS',
                        value: valorInicial(nuevo.kind),
                      });
                    }}
                  />
                </div>

                <div className="min-w-[8rem]">
                  <Select
                    label="Operador"
                    fullWidth
                    options={(campo?.operators ?? []).map((operador) => ({
                      value: operador,
                      label: OPERADORES[operador] ?? operador,
                    }))}
                    value={fila.operator}
                    onValueChange={(operador) => {
                      /* `IN` guarda una lista JSON y el resto un escalar: pasar
                         de uno a otro sin reiniciar deja un valor con la forma
                         del operador anterior. */
                      actualizar(fila.id, {
                        operator: operador,
                        value: operador === 'IN' ? '[]' : valorInicial(campo?.kind ?? 'text'),
                      });
                    }}
                  />
                </div>

                <div className="min-w-[10rem] flex-[2]">
                  {campo && (
                    <ValueField
                      fieldSpec={campo}
                      operator={fila.operator}
                      value={fila.value}
                      onChange={(valor) => actualizar(fila.id, { value: valor })}
                      proyecto={proyecto}
                    />
                  )}
                  {campo?.help && <p className="mt-1 font-sans text-xs text-white">{campo.help}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => onChange(rows.filter((una) => una.id !== fila.id))}
                  aria-label={`Quitar la condición sobre ${campo?.label ?? fila.field}`}
                  className="rounded-lg p-1.5 text-white transition-colors hover:bg-error-muted hover:text-error"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={anadir}>
          <Plus className="size-4" /> Añadir condición
        </Button>
      </div>
    </fieldset>
  );
}

/** El texto de partida de una fila nueva, según lo que sea el campo. */
function valorInicial(kind: string): string {
  if (kind === 'boolean') return 'true';
  if (kind === 'integer') return '0';
  return '';
}

/** Las filas de una regla guardada, listas para editarse. */
export function rowsFromConditions(
  conditions: Array<{ field: string; operator: string; value: unknown; position: number }>,
): ConditionRow[] {
  return [...conditions]
    .sort((a, b) => a.position - b.position)
    .map((condition) => ({
      id: crypto.randomUUID(),
      field: condition.field,
      operator: condition.operator,
      value: Array.isArray(condition.value)
        ? JSON.stringify(condition.value)
        : String(condition.value),
    }));
}
