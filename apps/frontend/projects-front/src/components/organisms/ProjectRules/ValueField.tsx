'use client';

import type { ConditionFieldSpec } from '@/lib/automation-catalog';
import { Input, Select, SelectorDeFecha } from '@praxis/commons';
import { useState } from 'react';

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
    /* `key` por campo: si algún día se puede cambiar de campo sin perder el
       operador `IN`, el texto de la lista anterior no debe sobrevivir. */
    return <ListaSeparadaPorComas key={fieldSpec.field} value={value} onChange={onChange} />;
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

/**
 * Una lista escrita a mano, separada por comas.
 *
 * ⚠️ **El texto que se ve es estado propio, no el JSON reformateado.** Antes
 * el `<Input>` se controlaba desde el valor ya parseado: cada pulsación se
 * partía por comas, se limpiaba y se volvía a serializar, así que al teclear
 * una coma la lista se recomponía sin ella —«3, 5, 8» acababa siendo «358»—
 * y no había forma de escribir más de un elemento.
 *
 * Aquí el texto crudo manda mientras se escribe y hacia fuera sale siempre
 * el JSON que espera `coerceConditionValue`, con los huecos descartados. Que
 * el texto tenga una coma suelta al final es normal a media escritura y no
 * ensucia lo que se envía.
 *
 * Se monta con el valor que reciba y no vuelve a mirarlo: cambiar de campo o
 * de operador desmonta este componente, así que no hay que sincronizar nada.
 */
function ListaSeparadaPorComas({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [texto, setTexto] = useState(() => safeParseArray(value).join(', '));

  return (
    <Input
      label="Valor"
      value={texto}
      onChange={(event) => {
        const crudo = event.target.value;
        setTexto(crudo);
        onChange(
          JSON.stringify(
            crudo
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        );
      }}
      placeholder="Separados por comas"
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
