'use client';

import { conditionFieldSpecFor, triggerSpecFor } from '@/lib/automation-catalog';
import { type ConditionDraft, coerceConditionValue } from '@/lib/automation-draft';
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
 * El valor coaccionado, de vuelta al texto del que salió.
 *
 * ⚠️ **Una lista no vale con `String()`.** `String([3, 5, 8])` da `'3,5,8'`,
 * que no es JSON, y `coerceConditionValue` lo intenta parsear como tal y
 * devuelve una lista vacía: la condición se borraría sola al releerla. Con
 * `IN` el texto **es** el JSON, tanto para pintar el campo como para el
 * `<input>` oculto que viaja en el `FormData`.
 */
function comoTexto(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value ?? '');
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

  /**
   * ⚠️ **El valor se guarda ya coaccionado, no como el texto del campo.**
   *
   * `ConditionDraft.value` está documentado como «ya coaccionado al tipo
   * correcto», y `validateAutomationDraft` lo comprueba así:
   * `Number.isInteger`, `typeof === 'boolean'`, `Array.isArray`. Aquí se
   * guardaba el texto crudo que emite el campo —`'2'`, `'true'`,
   * `'["3","5","8"]'`— y un string no es ninguna de esas tres cosas, así que
   * **enteros, booleanos y listas no se podían guardar**: los frenaba la
   * validación de cliente antes de salir del navegador, con un mensaje que
   * además aparecía sobre el campo «Nombre».
   *
   * Solo pasaban los enum y las fechas, que se validan como texto y colaban
   * por casualidad — y era justo el único tipo que tenía prueba.
   *
   * La coerción es la misma `coerceConditionValue` que usa el servidor al
   * reconstruir el borrador desde el `FormData`, así que las dos orillas
   * entienden lo mismo. El `<input>` oculto sigue llevando texto: es un
   * `FormData`, ahí todo es texto por definición.
   */
  function updateRow(key: string, patch: Partial<ConditionDraft>) {
    commit(
      rows.map((row) => {
        if (row.key !== key) return row;
        const siguiente = { ...row, ...patch };
        const texto = comoTexto(patch.value ?? siguiente.value);
        return {
          ...siguiente,
          /* ⚠️ **Vacío se queda vacío.** `coerceConditionValue` con `''` y un
             campo entero devuelve `Number('') === 0`, así que elegir «Número
             de responsables» rellenaría un cero que nadie escribió — y un
             cero **es válido**, así que la regla se podría guardar con un
             valor inventado. Sin rellenar y «cero» no son lo mismo. */
          value:
            texto === ''
              ? ''
              : coerceConditionValue(triggerType, siguiente.field, siguiente.operator, texto),
        };
      }),
    );
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
              {/* ⚠️ **No son tres columnas iguales.** El nombre del campo es
                  lo más largo que se pinta en la fila —«Número de
                  responsables»— y el operador lo más corto, así que con
                  `grid-cols-3` el `Select` de campo truncaba a «Número de
                  re…» y dejaba la condición sin poder leerse. Los operadores
                  («no es igual a») caben de sobra en su fracción. */}
              <div className="grid flex-1 gap-2 sm:grid-cols-[1.5fr_1fr_1.2fr]">
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
                    value={comoTexto(row.value)}
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
              <input type="hidden" name="conditionValue" value={comoTexto(row.value)} />
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
