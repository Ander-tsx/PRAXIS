import type { AutomationExecution, AutomationRule } from '@praxis/commons';
import { RuleCard } from './RuleCard';
import { RuleDialog } from './RuleDialog';
import { RuleExecutions } from './RuleExecutions';

/**
 * Id fijo, no `useId()`: esto es un Server Component y el encabezado que
 * nombra el panel está en el mismo archivo. Solo hay un `ProjectRules` por
 * página, así que no hay riesgo de colisión.
 */
const ENCABEZADO_REGLAS = 'reglas-academicas';

export interface ProjectRulesProps {
  projectId: string;
  rules: AutomationRule[];
  executions: AutomationExecution[];
  /** Sale de `permissions/me`: sin esto no se enseña nada operable. */
  canManage: boolean;
  /** Para distinguir el mensaje de permiso del de suspensión — D8. */
  isSuspended: boolean;
}

/**
 * Reglas de automatización del proyecto.
 *
 * El aviso de suspensión ya se pinta una vez, arriba de toda la página
 * (`SuspendedProjectNotice`): repetirlo aquí sería el mismo texto dos veces.
 * Lo que sí cambia con la suspensión es **qué mensaje se enseña cuando no hay
 * nada operable** — antes decía siempre «no tienes permiso», que es falso
 * cuando la causa real es que el proyecto está suspendido y el mapa de
 * permisos llega recortado por eso, no porque falte un rol.
 *
 * La creación y edición viven en `RuleDialog`, el constructor guiado
 * Cuando/Si/Entonces. El panel de ejecuciones y su revisión manual viven en
 * `RuleExecutions`.
 */
export function ProjectRules({
  projectId,
  rules,
  executions,
  canManage,
  isSuspended,
}: ProjectRulesProps) {
  if (!canManage) {
    return (
      <p className="rounded-xl border border-border bg-surface p-5 font-sans text-sm text-text-secondary">
        {isSuspended
          ? 'Las reglas de este proyecto no se pueden ver ni administrar mientras esté suspendido.'
          : 'No tienes permiso para administrar automatizaciones en este proyecto.'}
      </p>
    );
  }

  return (
    /* Uno debajo del otro y los dos a todo el ancho. En dos columnas, las
       ejecuciones se quedaban en una franja estrecha donde el resumen del
       contexto de cada fila —«prioridad Alta, fecha de vencimiento …»— no
       cabía en una línea. */
    <section aria-label="Reglas de automatización" className="flex flex-col gap-6">
      {/* Los dos paneles son regiones con nombre propio: se leen seguidos, y
          sin nombre no habría forma de saltar de uno a otro. */}
      <div
        aria-labelledby={ENCABEZADO_REGLAS}
        className="space-y-4 rounded-2xl border border-border bg-surface p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id={ENCABEZADO_REGLAS}
              className="font-display text-lg font-semibold text-text-primary"
            >
              Reglas académicas
            </h2>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              Cuando ocurre algo, si se cumplen las condiciones, entonces se avisa a quien
              corresponda.
            </p>
          </div>
          <RuleDialog projectId={projectId} triggerLabel="Nueva regla" />
        </div>

        {rules.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-6 font-sans text-sm text-text-secondary">
            Aún no hay reglas. Una regla dice cuándo revisar, qué condiciones tienen que cumplirse y
            a quién avisar cuando se cumplen.
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <RuleCard key={rule.id} projectId={projectId} rule={rule} canManage={canManage} />
            ))}
          </ul>
        )}
      </div>

      <RuleExecutions projectId={projectId} executions={executions} />
    </section>
  );
}
