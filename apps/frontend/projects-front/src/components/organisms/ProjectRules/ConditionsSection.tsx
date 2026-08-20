'use client';

import { conditionFieldSpecFor, triggerSpecFor } from '@/lib/automation-catalog';
import type { ConditionDraft } from '@/lib/automation-draft';
import { Button, Select } from '@praxis/commons';
import { useState } from 'react';
import { ValueField } from './ValueField';

export interface ConditionsSectionProps {
  triggerType: string;
  conditions: ConditionDraft[];
  onChange: (next: ConditionDraft[]) => void;
}

const OPERATOR_LABELS: Record<string, string> = {
  EQUALS: 'es igual a',
  NOT_EQUALS: 'no es igual a',
  IN: 'es alguno de',
};

/** Una fila con una clave estable para React — nunca la posición: quitar la
    fila 2 no puede hacer que la 3 herede su estado. */
interface Row extends ConditionDraft {
  key: string;
}

let contador = 0;
function nuevaClave(): string {
  contador += 1;
  return `condicion-${contador}`;
}

/**
 * «Si …» — las condiciones, combinadas por `AND`.
 *
 * Los campos y operadores que ofrece cada fila salen del catálogo del
 * trigger elegido (`TriggerSection` los pasa vía `triggerType`), así que
 * cambiar de trigger sin vaciar antes las condiciones ofrecería campos que
 * el contrato rechazaría con 400 — por eso `RuleDialog` remonta esta sección
 * (con `key={triggerType}`) al cambiar de trigger, en vez de reconciliar
 * filas que ya no pertenecen a ningún campo válido.
 */
export function ConditionsSection({ triggerType, conditions, onChange }: ConditionsSectionProps) {
  const spec = triggerSpecFor(triggerType);
  const fieldOptions = (spec?.conditionFields ?? []).map((field) => ({
    value: field.field,
    label: field.label,
  }));
  const firstField = spec?.conditionFields[0];

  const [rows, setRows] = useState<Row[]>(() =>
    conditions.map((condition) => ({ ...condition, key: nuevaClave() })),
  );

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map(({ key, ...condition }) => condition));
  }

  function updateRow(key: string, patch: Partial<ConditionDraft>) {
    commit(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (!firstField) return;
    commit([
      ...rows,
      {
        key: nuevaClave(),
        field: firstField.field,
        operator: firstField.operators[0] ?? 'EQUALS',
        value: '',
      },
    ]);
  }

  function removeRow(key: string) {
    commit(rows.filter((row) => row.key !== key));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <legend className="px-1 font-sans text-sm font-medium text-text-primary">Si</legend>
      <p className="font-sans text-xs text-text-secondary">
        {rows.length === 0
          ? 'Sin condiciones, la regla se aplica a toda candidata del trigger.'
          : 'Se tienen que cumplir todas — se combinan con Y, no con O.'}
      </p>

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const fieldSpec = conditionFieldSpecFor(triggerType, row.field);
          const operatorOptions = (fieldSpec?.operators ?? ['EQUALS']).map((operator) => ({
            value: operator,
            label: OPERATOR_LABELS[operator] ?? operator,
          }));

          return (
            <div
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3 sm:flex-row sm:items-start"
            >
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <Select
                  label="Campo"
                  value={row.field}
                  onValueChange={(value) =>
                    updateRow(row.key, { field: value, operator: 'EQUALS', value: '' })
                  }
                  options={fieldOptions}
                  fullWidth
                />
                <Select
                  label="Operador"
                  value={row.operator}
                  onValueChange={(value) => updateRow(row.key, { operator: value, value: '' })}
                  options={operatorOptions}
                  fullWidth
                />
                {fieldSpec && (
                  <ValueField
                    fieldSpec={fieldSpec}
                    operator={row.operator}
                    value={String(row.value ?? '')}
                    onChange={(value) => updateRow(row.key, { value })}
                  />
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
                Quitar
              </Button>
              {/* Cada fila emite sus tres campos aquí, siempre los tres, en
                  el mismo orden — es lo que mantiene alineadas las listas
                  paralelas de `conditionField`/`conditionOperator`/
                  `conditionValue` entre filas — D4. */}
              <input type="hidden" name="conditionField" value={row.field} />
              <input type="hidden" name="conditionOperator" value={row.operator} />
              <input type="hidden" name="conditionValue" value={String(row.value ?? '')} />
            </div>
          );
        })}
      </div>

      <Button type="button" variant="secondary" size="sm" onClick={addRow} className="w-fit">
        Añadir condición
      </Button>
    </fieldset>
  );
}
