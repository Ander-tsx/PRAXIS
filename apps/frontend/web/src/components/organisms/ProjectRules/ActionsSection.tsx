'use client';

import {
  type AutomationCatalog,
  type OpcionesDelProyecto,
  opcionesDe,
} from '@/lib/projects/automation-catalog';
import type { ActionDraft } from '@/lib/projects/automation-draft';
import { Button, Input, Select } from '@praxis/commons';
import { Plus, X } from 'lucide-react';

export interface ActionsSectionProps {
  catalog: AutomationCatalog;
  actions: ActionDraft[];
  onChange: (actions: ActionDraft[]) => void;
  proyecto: OpcionesDelProyecto;
}

/** Lo mismo que aplica el servidor: cinco por regla. */
const MAX_ACCIONES = 5;

/**
 * El «Entonces»: qué hace la regla cuando se cumple.
 *
 * ## ⚠️ La configuración viaja como JSON, en una entrada por acción
 *
 * Las acciones se recomponen por posición en `draftFromFormData`, igual que las
 * condiciones. Emitir un campo por cada clave de configuración rompe esa
 * alineación en cuanto dos acciones tienen distinto número de campos — y eso es
 * lo normal desde que hay siete: «avisar» lleva un destinatario, «comentar»
 * lleva un texto y «mover» lleva una columna. Con el objeto serializado, cada
 * acción ocupa exactamente una entrada, tenga los campos que tenga.
 *
 * ## Sobre los permisos
 *
 * Una acción que escribe exige que **quien crea la regla** pueda hacer eso a
 * mano. No se comprueba aquí —el servidor lo hace al guardar y otra vez al
 * ejecutar— pero sí se avisa: enterarse al pulsar «Guardar» es tarde, y
 * enterarse tres días después, cuando la regla falla sola, es peor.
 */
export function ActionsSection({ catalog, actions, onChange, proyecto }: ActionsSectionProps) {
  function actualizar(indice: number, cambios: Partial<ActionDraft>) {
    onChange(actions.map((accion, i) => (i === indice ? { ...accion, ...cambios } : accion)));
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-sans text-sm font-semibold text-text-primary">
        Entonces… <span className="font-normal text-white">¿qué hace?</span>
      </legend>

      <ul className="flex flex-col gap-2">
        {actions.map((accion, indice) => {
          const spec = catalog.actions.find((uno) => uno.type === accion.type);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: la posición ES la identidad de una acción — el contrato la guarda como `position`
              key={indice}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-3"
            >
              <input type="hidden" name="actionType" value={accion.type} />
              <input type="hidden" name="actionConfig" value={JSON.stringify(accion.config)} />

              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Select
                    label="Qué hace"
                    fullWidth
                    options={catalog.actions.map((uno) => ({
                      value: uno.type,
                      label: uno.label,
                    }))}
                    value={accion.type}
                    onValueChange={(valor) => {
                      const nuevo = catalog.actions.find((uno) => uno.type === valor);
                      if (!nuevo) return;
                      /* La configuración se reinicia: la de «mover» no
                         significa nada dentro de «comentar», y arrastrarla
                         mandaría claves que esa acción no declara — 400. */
                      const config: Record<string, unknown> = {};
                      for (const campo of nuevo.config) {
                        if (campo.options?.length === 1)
                          config[campo.key] = campo.options[0]?.value;
                      }
                      actualizar(indice, { type: nuevo.type, config });
                    }}
                  />
                </div>

                {actions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(actions.filter((_, i) => i !== indice))}
                    aria-label={`Quitar la acción ${spec?.label ?? accion.type}`}
                    className="rounded-lg p-1.5 text-white transition-colors hover:bg-error-muted hover:text-error"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {spec?.config.map((campo) => {
                const opciones = opcionesDe(campo, proyecto);
                const valor = accion.config[campo.key];
                return (
                  <label key={campo.key} className="flex flex-col gap-1">
                    <span className="font-sans text-xs font-medium text-white">{campo.label}</span>
                    {opciones.length > 0 ? (
                      <Select
                        placeholder="Elige…"
                        fullWidth
                        options={opciones.map((opcion) => ({
                          value: opcion.value,
                          label: opcion.label,
                        }))}
                        value={String(valor ?? '')}
                        onValueChange={(nuevo) =>
                          actualizar(indice, { config: { ...accion.config, [campo.key]: nuevo } })
                        }
                      />
                    ) : (
                      <Input
                        maxLength={campo.maxLength}
                        value={String(valor ?? '')}
                        onChange={(event) =>
                          actualizar(indice, {
                            config: { ...accion.config, [campo.key]: event.target.value },
                          })
                        }
                      />
                    )}
                    {campo.help && (
                      <span className="font-sans text-xs text-white">{campo.help}</span>
                    )}
                  </label>
                );
              })}

              {spec?.requires && (
                <p className="font-sans text-xs text-white">
                  Necesita que quien cree la regla pueda hacer esto a mano.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {actions.length < MAX_ACCIONES && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const primera = catalog.actions[0];
              if (!primera) return;
              const config: Record<string, unknown> = {};
              for (const campo of primera.config) {
                if (campo.options?.length === 1) config[campo.key] = campo.options[0]?.value;
              }
              onChange([...actions, { type: primera.type, config }]);
            }}
          >
            <Plus className="size-4" /> Añadir acción
          </Button>
        </div>
      )}
    </fieldset>
  );
}
