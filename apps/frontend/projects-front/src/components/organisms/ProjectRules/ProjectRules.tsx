'use client';

import type { AutomationCatalog, OpcionesDelProyecto } from '@/lib/automation-catalog';
import { type AutomationExecutionPage, type AutomationRule, Button } from '@praxis/commons';
import { AlertTriangle, Plus } from 'lucide-react';
import { useState } from 'react';
import { RuleBuilder } from './RuleBuilder';
import { RuleCard } from './RuleCard';
import { RuleExecutions } from './RuleExecutions';

/**
 * Id fijo, no `useId()`: solo hay un `ProjectRules` por página, así que no hay
 * riesgo de colisión y el valor se puede leer en una prueba.
 */
const ENCABEZADO_REGLAS = 'reglas-de-automatizacion';

export interface ProjectRulesProps {
  projectId: string;
  /** `null` = el servicio no respondió. **No** es lo mismo que «no hay ninguna». */
  rules: AutomationRule[] | null;
  executions: AutomationExecutionPage | null;
  /** El catálogo del servidor. Sin él no se puede construir ninguna regla. */
  catalog: AutomationCatalog | null;
  /** Columnas, etiquetas y gente del proyecto, para los campos con `source`. */
  proyecto: OpcionesDelProyecto;
  /** Sale de `permissions/me`: sin esto no se enseña nada operable. */
  canManage: boolean;
  /** Para distinguir el mensaje de permiso del de suspensión. */
  isSuspended: boolean;
}

/**
 * La sección de Automatización del proyecto.
 *
 * El aviso de suspensión ya se pinta una vez, arriba de toda la página
 * (`SuspendedProjectNotice`): repetirlo aquí sería el mismo texto dos veces. Lo
 * que sí cambia con la suspensión es **qué mensaje se enseña cuando no hay nada
 * operable** — antes decía siempre «no tienes permiso», que es falso cuando la
 * causa real es que el proyecto está suspendido y el mapa de permisos llega
 * recortado por eso, no porque falte un rol.
 *
 * ## 🔴 Servicio caído ≠ «no tienes reglas»
 *
 * La página pedía las reglas con `.catch(() => [])`, y una lista vacía **ya
 * significaba otra cosa**: con el servicio de automatización parado, quien
 * tuviera diez reglas veía la pantalla de bienvenida diciéndole que no había
 * ninguna, y el botón de crear invitándole a empezar. Es exactamente el recorte
 * mudo que este repositorio prohíbe en cualquier otro sitio. Ahora llega `null`
 * y se dice.
 */
export function ProjectRules({
  projectId,
  rules,
  executions,
  catalog,
  proyecto,
  canManage,
  isSuspended,
}: ProjectRulesProps) {
  const [creando, setCreando] = useState(false);
  /** Qué regla se está editando. Una sola: dos formularios a la vez no se leen. */
  const [editando, setEditando] = useState<string | null>(null);

  if (!canManage) {
    return (
      <p className="rounded-xl border border-border bg-surface p-5 font-sans text-sm text-text-secondary">
        {isSuspended
          ? 'La automatización de este proyecto no se puede ver ni administrar mientras esté suspendido.'
          : 'No tienes permiso para administrar automatizaciones en este proyecto.'}
      </p>
    );
  }

  const noDisponible = rules === null || catalog === null;

  return (
    /* Uno debajo del otro y los dos a todo el ancho. En dos columnas, las
       ejecuciones se quedaban en una franja estrecha donde el detalle de cada
       fila no cabía en una línea. */
    <div className="flex flex-col gap-10">
      {/* Misma forma que `ProjectRoles`, `ProjectMembers` y el resto de
          secciones del proyecto: el encabezado **fuera** de la superficie, con
          su explicación y su botón al lado, y la caja debajo con el contenido. */}
      <section className="flex flex-col gap-4" aria-labelledby={ENCABEZADO_REGLAS}>
        {/* La misma barra que Equipo y Roles: nombre, barra, una frase que
            explica la sección, y la acción a la derecha. Antes esto era un
            encabezado grande con el párrafo debajo, y Automatización se leía
            como si fuera de otra pantalla. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <h3 id={ENCABEZADO_REGLAS} className="shrink-0 font-sans font-medium text-text-primary">
              Reglas
            </h3>
            <span className="shrink-0 font-light text-text-disabled">/</span>
            <p className="truncate font-sans text-sm text-text-secondary">
              Cuando pasa algo, si se cumplen las condiciones, la regla actúa sola.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!noDisponible && (
              <Button
                variant={creando ? 'secondary' : 'primary'}
                onClick={() => {
                  setCreando(!creando);
                  setEditando(null);
                }}
                aria-expanded={creando}
              >
                {creando ? (
                  'Cancelar'
                ) : (
                  <>
                    <Plus className="size-4" /> Nueva regla
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {noDisponible ? (
          <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-muted px-5 py-4 font-sans text-sm text-text-primary">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            No se ha podido consultar la automatización de este proyecto. Tus reglas siguen ahí:
            vuelve a cargar la página en un momento.
          </p>
        ) : (
          <>
            {creando && catalog && (
              <div className="animate-desplegar-panel">
                <div>
                  <RuleBuilder
                    projectId={projectId}
                    catalog={catalog}
                    proyecto={proyecto}
                    onClose={() => setCreando(false)}
                  />
                </div>
              </div>
            )}

            {rules.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-5 py-6 font-sans text-sm text-text-secondary">
                Aún no hay reglas. Una regla dice qué tiene que pasar, sobre qué tareas, y qué hacer
                cuando ocurra.
              </p>
            ) : (
              /* Una sola caja para todas, separadas por una línea, y no una
                 tarjeta por regla: cada una ya lleva dentro dos párrafos y una
                 fila de controles, así que apilar cajas con borde propio dentro
                 de otra caja daba tres bordes anidados para una lista. */
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    projectId={projectId}
                    rule={rule}
                    catalog={catalog}
                    proyecto={proyecto}
                    canManage={canManage}
                    editando={editando === rule.id}
                    onEditar={() => {
                      setEditando(rule.id);
                      setCreando(false);
                    }}
                    onCerrarEdicion={() => setEditando(null)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <RuleExecutions
        projectId={projectId}
        executions={executions}
        catalog={catalog}
        proyecto={proyecto}
      />
    </div>
  );
}
