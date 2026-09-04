'use client';

import { reviewAutomationsAction } from '@/app/projects/[id]/actions';
import { REVIEW_INITIAL_STATE } from '@/lib/projects/action-state';
import type { AutomationCatalog, OpcionesDelProyecto } from '@/lib/projects/automation-catalog';
import { describeExecutionContext, describeReviewSummary } from '@/lib/projects/automation-draft';
import {
  type AutomationExecution,
  type AutomationExecutionPage,
  type AutomationExecutionStatus,
  Badge,
  type BadgeVariant,
  Button,
  alpha,
  colors,
  useAccion,
} from '@praxis/commons';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface RuleExecutionsProps {
  projectId: string;
  /** `null` = el servicio no respondió. No es lo mismo que «no hay ninguna». */
  executions: AutomationExecutionPage | null;
  catalog: AutomationCatalog | null;
  proyecto: OpcionesDelProyecto;
}

const STATUS_LABELS: Record<AutomationExecutionStatus, string> = {
  SUCCEEDED: 'Actuó',
  SKIPPED: 'No cumplía las condiciones',
  FAILED: 'Falló',
  RUNNING: 'En curso',
};

const STATUS_VARIANTS: Record<AutomationExecutionStatus, BadgeVariant> = {
  SUCCEEDED: 'success',
  SKIPPED: 'default',
  FAILED: 'error',
  RUNNING: 'info',
};

const ERROR_MESSAGE_MAX_CHARS = 140;

/** Nombra el panel para quien navega por regiones. Ver `ProjectRules`. */
const ENCABEZADO_EJECUCIONES = 'ejecuciones-de-reglas';

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <p className="font-sans text-sm text-white">
      <span className="font-medium text-text-primary">{titulo}: </span>
      {children}
    </p>
  );
}

function failureMessage(execution: AutomationExecution): string | null {
  const failed = execution.actionResults?.find((result) => result.status === 'FAILED');
  if (!failed) return null;
  return failed.error.message.length > ERROR_MESSAGE_MAX_CHARS
    ? `${failed.error.message.slice(0, ERROR_MESSAGE_MAX_CHARS)}…`
    : failed.error.message;
}

/**
 * El panel de ejecuciones — Bloque 6.
 *
 * «Revisar ahora» ya no descarta el resumen que confirma el servidor: lo
 * enseña en una frase, sin inventar `skipped` ni `deduped` (el backend no los
 * manda — hueco 4 de `PENDIENTES-BACKEND-AUTOMATIZACION.md`). El detalle de
 * por qué se omitió cada candidata se lee fila por fila, donde `SKIPPED` sí
 * aparece.
 */
export function RuleExecutions({ projectId, executions, catalog, proyecto }: RuleExecutionsProps) {
  const [state, formAction, pending] = useAccion(reviewAutomationsAction, REVIEW_INITIAL_STATE);
  /** Qué fila está abierta. Una sola: dos detalles a la vez no se comparan. */
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    /* Mismo trato que la lista de reglas y que el resto de secciones del
       proyecto: encabezado fuera de la superficie, caja debajo. */
    <section className="flex flex-col gap-4" aria-labelledby={ENCABEZADO_EJECUCIONES}>
      {/* La misma barra que Reglas, Equipo y Roles. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h3
            id={ENCABEZADO_EJECUCIONES}
            className="shrink-0 font-sans font-medium text-text-primary"
          >
            Ejecuciones
          </h3>
          <span className="shrink-0 font-light text-white">/</span>
          {/* ⚠️ **«Las de barrido se lanzan desde aquí» no explicaba nada.**
              «Barrido» es como se llama por dentro; quien lee esto solo quiere
              saber qué pasa si pulsa el botón de al lado. */}
          <p className="truncate font-sans text-sm text-white">
            Qué hizo cada regla, sobre qué tarea y cuándo.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <form action={formAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <Button
              type="submit"
              variant="secondary"
              isLoading={pending}
              title="Comprueba ahora las reglas que vigilan un estado —vence pronto, lleva parada, ya venció, sigue sin encargado— contra las tareas del proyecto. Las que reaccionan a un hecho (se crea, se mueve, se completa…) no lo necesitan: saltan solas."
            >
              Revisar ahora
            </Button>
          </form>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
          style={{ background: alpha(colors.error, 10), borderColor: alpha(colors.error, 30) }}
        >
          {state.error}
        </p>
      )}

      {state.summary && (
        <output
          className="block rounded-lg border px-3 py-2 font-sans text-sm"
          style={{
            background: alpha(colors.info, 8),
            borderColor: alpha(colors.info, 25),
            color: colors.textPrimary,
          }}
        >
          {describeReviewSummary(state.summary)}
        </output>
      )}

      {executions === null ? (
        /* ⚠️ **Servicio caído no es «no hay ninguna».** Ver `ProjectRules`. */
        <p className="rounded-xl border border-warning bg-warning-muted px-5 py-4 font-sans text-sm text-text-primary">
          No se ha podido consultar el historial de ejecuciones. Vuelve a cargar en un momento.
        </p>
      ) : executions.items.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 font-sans text-sm text-white">
          Aún no se ha revisado nada. «Revisar ahora» evalúa las reglas activas contra las tareas
          del proyecto y deja aquí una fila por cada candidata que encontró.
        </p>
      ) : (
        /* Una caja para todas, separadas por una línea — igual que la lista
           de reglas. */
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {executions.items.map((execution) => {
            const failure = execution.status === 'FAILED' ? failureMessage(execution) : null;
            const desplegada = abierta === execution.id;
            return (
              <li key={execution.id}>
                {/**
                 * 🔴 **La fila era plana y no dejaba auditar nada.**
                 *
                 * Enseñaba la regla, el estado y el contexto entero de golpe:
                 * con veinte filas, la lista era un muro de datos donde no se
                 * distinguía la que había fallado. Y no decía **sobre qué
                 * tarea** actuó, que es lo primero que se busca.
                 *
                 * Ahora la fila cerrada responde a «qué regla, sobre qué tarea,
                 * cómo acabó» y el detalle —el contexto que se evaluó, qué
                 * acciones se ejecutaron, el error entero— se despliega solo si
                 * se pide.
                 */}
                <button
                  type="button"
                  onClick={() => setAbierta(desplegada ? null : execution.id)}
                  aria-expanded={desplegada}
                  className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-surface-elevated"
                >
                  <ChevronDown
                    aria-hidden
                    className={[
                      'size-4 shrink-0 text-white transition-transform',
                      desplegada ? 'rotate-180' : '',
                    ].join(' ')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-base font-semibold text-text-primary">
                      {execution.subjectTitle ?? execution.rule.name}
                    </span>
                    <span className="block truncate font-sans text-xs text-white">
                      {execution.rule.name} ·{' '}
                      {new Date(execution.createdAt).toLocaleString('es-MX')}
                    </span>
                  </span>
                  <Badge variant={STATUS_VARIANTS[execution.status]}>
                    {STATUS_LABELS[execution.status]}
                  </Badge>
                </button>

                {desplegada && (
                  <div className="animate-desplegar-panel">
                    <div className="flex flex-col gap-2 px-5 pb-5 pl-12">
                      <Dato titulo="Se evaluó con">
                        {describeExecutionContext(
                          catalog,
                          execution.conditionResult.context,
                          proyecto,
                        )}
                      </Dato>
                      {execution.actionResults && execution.actionResults.length > 0 && (
                        <Dato titulo="Acciones">
                          {execution.actionResults
                            .map((resultado) =>
                              resultado.status === 'SUCCEEDED'
                                ? `hecha en ${resultado.attempts === 1 ? 'un intento' : 'dos intentos'}`
                                : `falló: ${resultado.error.message}`,
                            )
                            .join(' · ')}
                        </Dato>
                      )}
                      {failure && (
                        <Dato titulo="Error">
                          <span className="text-error">{failure}</span>
                        </Dato>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/**
       * 🔴 **Decir que esto es una ventana, no el histórico.**
       *
       * El listado trae las últimas veinte y no había forma de saberlo. Quien
       * abre las ejecuciones lo hace para averiguar por qué una regla no actuó,
       * y una ventana que no llega hasta el caso que busca —sin decirlo— le
       * hace concluir que la regla no se evaluó nunca. Es el recorte mudo que
       * este repositorio prohíbe en cualquier otro sitio.
       *
       * Solo aparece cuando de verdad falta algo: con menos ejecuciones que el
       * tope, la lista **es** el histórico y anunciarlo sería ruido.
       */}
      {executions !== null && executions.total > executions.items.length && (
        <p className="font-sans text-xs text-white">
          Se ven las últimas {executions.items.length} de {executions.total}.
        </p>
      )}
    </section>
  );
}
