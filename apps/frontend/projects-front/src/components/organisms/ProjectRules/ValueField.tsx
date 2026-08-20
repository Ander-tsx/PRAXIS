'use client';

import type { ConditionFieldSpec } from '@/lib/automation-catalog';
import { Input, Select, SelectorDeFecha } from '@praxis/commons';

export interface ValueFieldProps {
  fieldSpec: ConditionFieldSpec;
  operator: string;
  /** El texto crudo tal como lo espera `coerceConditionValue` — nunca el valor coaccionado. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * El renderizador por tipo de valor — D3 del plan, y el único punto que hay
 * que tocar para añadir un `kind` nuevo al catálogo.
 *
 * Con `IN` cambia el widget, no el `kind`: una fecha o un entero se escriben
 * como lista separada por comas y se empaquetan en el array JSON que espera
 * `coerceConditionValue`; un enum con catálogo cerrado se marca por
 * casillas, para no dejar escribir un valor que no está en la lista.
 */
export function ValueField({ fieldSpec, operator, value, onChange }: ValueFieldProps) {
  if (operator === 'IN' && fieldSpec.kind === 'enum' && fieldSpec.options) {
    const selected: string[] = safeParseArray(value);
    return (
      <div className="flex flex-wrap gap-2">
        {fieldSpec.options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2 py-1 font-sans text-xs text-text-primary"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value);
                  onChange(JSON.stringify(next));
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (operator === 'IN') {
    const items: string[] = safeParseArray(value);
    return (
      <Input
        label="Valor"
        value={items.join(', ')}
        onChange={(event) => {
          const next = event.target.value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
          onChange(JSON.stringify(next));
        }}
        placeholder="Separados por comas"
        fullWidth
      />
    );
  }

  if (fieldSpec.kind === 'enum' && fieldSpec.options) {
    return (
      <Select
        label="Valor"
        value={value}
        onValueChange={onChange}
        options={[...fieldSpec.options]}
        placeholder="Elige un valor"
        fullWidth
      />
    );
  }

  if (fieldSpec.kind === 'boolean') {
    return (
      <Select
        label="Valor"
        value={value}
        onValueChange={onChange}
        options={[
          { value: 'true', label: 'Sí' },
          { value: 'false', label: 'No' },
        ]}
        placeholder="Elige un valor"
        fullWidth
      />
    );
  }

  if (fieldSpec.kind === 'date') {
    return (
      <SelectorDeFecha
        /* Nombre sin usar a propósito: el `<input>` oculto real de la fila lo
           pone `ConditionsSection`, siempre uno por fila — D4. Si este
           componente pusiera también uno con `name="conditionValue"`,
           `getAll('conditionValue')` traería dos entradas por esta fila y
           desalinearía las tres listas paralelas con las de las demás. */
        name={`_fecha_sin_usar_${fieldSpec.field}`}
        label="Fecha"
        defaultValue={value}
        onValueChange={onChange}
      />
    );
  }

  return (
    <Input
      label="Valor"
      type="number"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      min={fieldSpec.min}
      fullWidth
    />
  );
}

function safeParseArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
