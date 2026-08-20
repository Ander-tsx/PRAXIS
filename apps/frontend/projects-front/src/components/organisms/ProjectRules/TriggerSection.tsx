'use client';

import { AUTOMATION_CATALOG } from '@/lib/automation-catalog';
import { Input, Select } from '@praxis/commons';

export interface TriggerSectionProps {
  triggerType: string;
  triggerConfig: Record<string, number>;
  onTriggerTypeChange: (type: string) => void;
  onConfigChange: (key: string, value: number) => void;
}

/**
 * «Cuando …» — el trigger y su configuración.
 *
 * Recorre `AUTOMATION_CATALOG` en vez de ramificar por tipo: un trigger
 * nuevo en el catálogo (Bloque 2) aparece aquí solo con añadir la entrada,
 * sin tocar este componente.
 */
export function TriggerSection({
  triggerType,
  triggerConfig,
  onTriggerTypeChange,
  onConfigChange,
}: TriggerSectionProps) {
  const spec = AUTOMATION_CATALOG.find((candidate) => candidate.type === triggerType);

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <legend className="px-1 font-sans text-sm font-medium text-text-primary">Cuando</legend>

      <Select
        name="triggerType"
        /* «Qué la dispara», no «Tipo de trigger»: `trigger` es la palabra del
           contrato y de los comentarios, no la que ve quien usa la pantalla.
           El `<legend>` de esta sección ya dice «Cuando», y las dos frases
           encajan. */
        label="Qué la dispara"
        value={triggerType}
        onValueChange={onTriggerTypeChange}
        options={AUTOMATION_CATALOG.map((trigger) => ({
          value: trigger.type,
          label: trigger.label,
        }))}
        fullWidth
      />
      {spec && <p className="font-sans text-xs text-text-secondary">{spec.description}</p>}

      {spec?.configFields.map((field) => (
        <Input
          key={field.key}
          name={`triggerConfig.${field.key}`}
          type="number"
          label={field.label}
          message={field.help}
          min={field.min}
          value={triggerConfig[field.key] ?? ''}
          onChange={(event) => onConfigChange(field.key, Number(event.target.value))}
          fullWidth
        />
      ))}
    </fieldset>
  );
}
