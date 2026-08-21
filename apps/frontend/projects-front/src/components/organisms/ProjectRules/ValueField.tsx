'use client';

import {
  type ConditionField,
  type OpcionesDelProyecto,
  opcionesDe,
} from '@/lib/automation-catalog';
import { Input, Select, SelectorDeFecha } from '@praxis/commons';
import { useState } from 'react';

export interface ValueFieldProps {
  fieldSpec: ConditionField;
  operator: string;
  /** El texto crudo tal como lo espera `coerceConditionValue` — nunca el valor coaccionado. */
  value: string;
  onChange: (value: string) => void;
  proyecto: OpcionesDelProyecto;
}

/**
 * El campo de valor de una condición, según lo que ese campo sea.
 *
 * Es el único punto que hay que tocar para añadir una clase de valor nueva al
 * catálogo, y por eso decide **por `kind`, nunca por el nombre del campo**: en
 * cuanto un componente pregunta «¿es `priority`?», añadir un campo parecido
 * obliga a encontrar y editar ese `if`.
 *
 * ⚠️ **Con `IN` cambia el widget, no el `kind`.** Un enum o una lista del
 * proyecto se marcan por casillas —para no dejar escribir un valor que no está
 * en la lista—; un entero o una fecha se escriben separados por comas y se
 * empaquetan en el array JSON que espera `coerceConditionValue`.
 */
export function ValueField({ fieldSpec, operator, value, onChange, proyecto }: ValueFieldProps) {
  const opciones = opcionesDe(fieldSpec, proyecto);

  if (operator === 'IN' && opciones.length > 0) {
    const elegidos: string[] = safeParseArray(value);
    return (
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((opcion) => {
          const marcado = elegidos.includes(opcion.value);
          return (
            <label
              key={opcion.value}
              className={[
                'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-sans text-xs transition-colors',
                marcado
                  ? 'border-primary bg-primary-muted text-primary'
                  : 'border-border text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={marcado}
                onChange={(event) => {
                  const siguiente = event.target.checked
                    ? [...elegidos, opcion.value]
                    : elegidos.filter((item) => item !== opcion.value);
                  onChange(JSON.stringify(siguiente));
                }}
              />
              {opcion.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (operator === 'IN') {
    /* `key` por campo: si se cambia de campo sin perder el operador `IN`, el
       texto de la lista anterior no debe sobrevivir. */
    return <ListaSeparadaPorComas key={fieldSpec.field} value={value} onChange={onChange} />;
  }

  if (opciones.length > 0) {
    return (
      /* `placeholder` y no una opción vacía a mano: sin él, el desplegable
         nace con la primera opción marcada y le pone a la regla un valor que
         nadie decidió. */
      <Select
        label={fieldSpec.label}
        placeholder="Elige…"
        options={opciones.map((opcion) => ({ value: opcion.value, label: opcion.label }))}
        value={value}
        onValueChange={onChange}
        fullWidth
      />
    );
  }

  if (fieldSpec.kind === 'boolean') {
    return (
      <Select
        label={fieldSpec.label}
        options={[
          { value: 'true', label: 'Sí' },
          { value: 'false', label: 'No' },
        ]}
        value={value}
        onValueChange={onChange}
        fullWidth
      />
    );
  }

  if (fieldSpec.kind === 'date') {
    return (
      /* `name=""` a propósito: el valor ya viaja en el campo oculto de la fila
         (`conditionValue`), y un segundo campo con nombre metería una entrada
         suelta en el `FormData` que desalinearía los arrays paralelos. */
      <SelectorDeFecha
        name=""
        label={fieldSpec.label}
        defaultValue={value}
        placeholder="Elige una fecha"
        onValueChange={onChange}
      />
    );
  }

  if (fieldSpec.kind === 'integer') {
    return (
      <Input
        type="number"
        label={fieldSpec.label}
        min={fieldSpec.min ?? 0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      label={fieldSpec.label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/**
 * Una lista escrita a mano, separada por comas.
 *
 * ⚠️ **El texto crudo vive aquí y no en el borrador.** El borrador guarda el
 * array JSON, y reconstruirlo a texto en cada tecla se comía las comas mientras
 * se escribían: escribir «3,» daba `["3"]`, que se volvía a pintar como «3» y
 * borraba la coma recién puesta. Aquí se conserva lo escrito y se publica el
 * array; lo que se ve es lo que se tecleó.
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
      label="Valores separados por comas"
      placeholder="uno, dos, tres"
      value={texto}
      onChange={(event) => {
        setTexto(event.target.value);
        const partes = event.target.value
          .split(',')
          .map((parte) => parte.trim())
          .filter((parte) => parte.length > 0);
        onChange(JSON.stringify(partes));
      }}
    />
  );
}

function safeParseArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
