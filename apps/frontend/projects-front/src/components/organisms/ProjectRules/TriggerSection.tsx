'use client';

import type { AutomationCatalog, TriggerSpec } from '@/lib/automation-catalog';
import { Input } from '@praxis/commons';
import { Clock, Zap } from 'lucide-react';

export interface TriggerSectionProps {
  catalog: AutomationCatalog;
  triggerType: string;
  config: Record<string, number>;
  onChangeTrigger: (type: string) => void;
  onChangeConfig: (key: string, value: number) => void;
}

/**
 * El «Cuando»: qué hace que la regla se plantee actuar.
 *
 * ## ⚠️ Los disparadores van agrupados por familia, y no es decoración
 *
 * Un disparador **reactivo** ocurre en un instante y la regla salta sola; uno
 * **de barrido** describe un estado y solo se mira cuando alguien revisa. Es la
 * diferencia entre «esto pasa solo» y «esto pasa cuando lo pido», y quien
 * escribe la regla no puede adivinarla del nombre: «se mueve una tarea» y «una
 * tarea lleva parada» se leen igual de inmediatos.
 *
 * Mezclados en un desplegable, la mitad de las reglas nacían esperando algo que
 * no iba a ocurrir. Separados y con la etiqueta puesta, la elección lleva la
 * explicación dentro.
 */
export function TriggerSection({
  catalog,
  triggerType,
  config,
  onChangeTrigger,
  onChangeConfig,
}: TriggerSectionProps) {
  const spec = catalog.triggers.find((uno) => uno.type === triggerType);
  const reactivos = catalog.triggers.filter((uno) => uno.kind === 'reactive');
  const barrido = catalog.triggers.filter((uno) => uno.kind === 'sweep');

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-sans text-sm font-semibold text-text-primary">
        Cuando… <span className="font-normal text-white">¿qué lo dispara?</span>
      </legend>

      {/* El tipo viaja aparte porque los botones no son un `<input>`: la
          selección es visual y el formulario necesita el valor igualmente. */}
      <input type="hidden" name="triggerType" value={triggerType} />

      <Grupo
        titulo="Pasa solo"
        explicacion="La regla actúa en cuanto ocurre, sin que nadie pulse nada."
        icono={<Zap className="size-3.5" />}
        triggers={reactivos}
        elegido={triggerType}
        onElegir={onChangeTrigger}
      />
      <Grupo
        titulo="Al revisar"
        explicacion="Describen un estado, así que se miran cuando pulsas «Revisar ahora»."
        icono={<Clock className="size-3.5" />}
        triggers={barrido}
        elegido={triggerType}
        onElegir={onChangeTrigger}
      />

      {spec && spec.config.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4">
          {spec.config.map((campo) => (
            <label key={campo.key} className="flex flex-col gap-1">
              <span className="font-sans text-xs font-medium text-white">
                {campo.label}
                {!campo.required && <span className="text-white"> (opcional)</span>}
              </span>
              <Input
                type="number"
                name={`triggerConfig.${campo.key}`}
                min={campo.min}
                value={String(config[campo.key] ?? campo.defaultValue)}
                onChange={(event) => onChangeConfig(campo.key, Number(event.target.value))}
              />
              {campo.help && (
                <span className="font-sans text-xs text-white">{campo.help}</span>
              )}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Grupo({
  titulo,
  explicacion,
  icono,
  triggers,
  elegido,
  onElegir,
}: {
  titulo: string;
  explicacion: string;
  icono: React.ReactNode;
  triggers: TriggerSpec[];
  elegido: string;
  onElegir: (type: string) => void;
}) {
  if (triggers.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 font-sans text-xs font-semibold text-white">
        <span aria-hidden className="text-primary">
          {icono}
        </span>
        {titulo}
        <span className="font-normal text-white">— {explicacion}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {triggers.map((trigger) => {
          const activo = trigger.type === elegido;
          return (
            <button
              key={trigger.type}
              type="button"
              onClick={() => onElegir(trigger.type)}
              aria-pressed={activo}
              className={[
                'flex flex-col gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                activo
                  ? 'border-primary bg-primary-muted'
                  : 'border-border bg-surface hover:border-text-disabled',
              ].join(' ')}
            >
              <span
                className={[
                  'font-sans text-sm font-medium',
                  activo ? 'text-primary' : 'text-text-primary',
                ].join(' ')}
              >
                {trigger.label}
              </span>
              <span className="font-sans text-xs text-white">{trigger.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
