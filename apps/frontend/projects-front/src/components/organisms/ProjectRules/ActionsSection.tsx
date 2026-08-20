import { triggerSpecFor } from '@/lib/automation-catalog';

export interface ActionsSectionProps {
  triggerType: string;
}

/**
 * «Entonces …» — la acción, con su destinatario explicado.
 *
 * Hoy el catálogo solo ofrece una acción por trigger, así que no hay botón
 * de «añadir acción» — D7: dos avisos idénticos a las mismas personas no
 * serían una capacidad nueva, serían ruido duplicado. El botón aparece solo
 * cuando el catálogo declare más de una variante para el trigger elegido.
 */
export function ActionsSection({ triggerType }: ActionsSectionProps) {
  const spec = triggerSpecFor(triggerType);
  const action = spec?.actions[0];

  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <legend className="px-1 font-sans text-sm font-medium text-text-primary">Entonces</legend>
      {action ? (
        <p className="font-sans text-sm text-text-primary">
          {action.label}: avisa {action.recipientLabel}.
        </p>
      ) : (
        <p className="font-sans text-sm text-text-secondary">
          Elige un trigger para ver la acción.
        </p>
      )}
      {action && <input type="hidden" name="actionType" value={action.type} />}
    </fieldset>
  );
}
