'use client';

import {
  AGENT_LABELS,
  AgentAvatar,
  type AgentKind,
  type TaskAgentEditor,
  type UserProfile,
  createApiClient,
  firstNameOf,
  personLabel,
} from '@praxis/commons';
import { useEffect, useMemo, useRef, useState } from 'react';

const api = createApiClient({ gatewayPath: '/api/gateway' });

/** Cuántas personas se nombran en la etiqueta antes de resumir en «y N más». */
const PERSONAS_VISIBLES = 2;

export interface TaskAgentLabelProps {
  taskId: string;
  /** Cambia cada vez que la tarea se guarda: es lo que vuelve a pedir los editores. */
  version: string;
  usersById: Map<string, UserProfile>;
}

/**
 * «Editado por Claude y Ana»: la etiqueta de arriba del panel de una tarea cuando
 * un agente de IA la ha editado por MCP a nombre de alguien.
 *
 * Es solo de **la tarea en sí** —título, descripción, columna, encargados, campos…—. El
 * checklist y las notas llevan su marca en cada elemento.
 *
 * Sin nada que decir (la organización no tiene encendida la coautoría, o ningún agente
 * ha tocado la tarea) no pinta nada ni deja hueco. Con más gente de la que cabe, nombra
 * a dos y resume el resto; pulsarla abre la lista entera.
 */
export function TaskAgentLabel({ taskId, version, usersById }: TaskAgentLabelProps) {
  const [editores, setEditores] = useState<TaskAgentEditor[]>([]);
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` es justo el disparador: la tarea se guardó
  useEffect(() => {
    let vigente = true;
    api
      .get<TaskAgentEditor[]>(`/tasks/${taskId}/agent-editors`)
      .then((lista) => vigente && setEditores(Array.isArray(lista) ? lista : []))
      .catch(() => vigente && setEditores([]));
    return () => {
      vigente = false;
    };
  }, [taskId, version]);

  /* Cierra con Escape y al pulsar fuera. Escape no se propaga: sin eso cerraría
     también el panel de la tarea. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape, true);
    };
  }, [abierto]);

  const resumen = useMemo(() => {
    const agentes: AgentKind[] = [];
    const nombres: string[] = [];
    const personas: string[] = [];
    for (const editor of editores) {
      if (!agentes.includes(editor.agentKind)) agentes.push(editor.agentKind);
      /* Claude y ChatGPT se llaman por su marca; un agente genérico, por el nombre con el
         que se conectó («Cursor»), porque «un agente de IA» no dice nada. */
      const nombreDelAgente =
        editor.agentKind === 'ai' ? editor.agentName : AGENT_LABELS[editor.agentKind];
      if (!nombres.includes(nombreDelAgente)) nombres.push(nombreDelAgente);
      const persona = usersById.get(editor.userId);
      const nombre = persona ? firstNameOf(persona) : 'Alguien del equipo';
      if (!personas.includes(nombre)) personas.push(nombre);
    }
    const visibles = personas.slice(0, PERSONAS_VISIBLES);
    const resto = personas.length - visibles.length;
    return { agentes, nombres, visibles, resto };
  }, [editores, usersById]);

  if (editores.length === 0) return null;

  /* «Claude y Sofía»; con varios agentes se juntan con «+» para que la única «y» sea la que
     separa al agente de la persona: «ChatGPT + Claude y María, Sofía». Con más gente de la
     que cabe, «y 2 más», y el resto está en la lista. */
  const agentesVisibles = resumen.nombres.slice(0, 2).join(' + ');
  const agentesResto = resumen.nombres.length - 2;
  const agentes = `${agentesVisibles}${agentesResto > 0 ? ` +${agentesResto}` : ''}`;
  const personas = `${resumen.visibles.join(', ')}${resumen.resto > 0 ? ` y ${resumen.resto} más` : ''}`;
  const quien = `${agentes} y ${personas}`;

  return (
    <span ref={raiz} className="relative inline-flex min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        title="Ver quién la ha editado con IA"
        className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.05] py-0.5 pr-3 pl-1 font-sans text-xs text-white transition-colors hover:border-white/[0.25] hover:bg-white/[0.09]"
      >
        <span className="flex shrink-0 -space-x-1.5">
          {resumen.agentes.slice(0, 3).map((kind) => (
            <AgentAvatar key={kind} kind={kind} size="sm" ring />
          ))}
        </span>
        <span className="min-w-0 truncate">Editado por {quien}</span>
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Quién ha editado esta tarea con IA"
          className="absolute top-full left-0 z-30 mt-2 flex w-72 max-w-[85vw] flex-col gap-1 rounded-xl border border-white/[0.12] bg-surface-3 p-2 shadow-xl"
        >
          <span className="px-2 pt-1 pb-1 font-sans text-[11px] uppercase tracking-wider text-text-secondary">
            Editada con IA por
          </span>
          {editores.map((editor) => {
            const persona = usersById.get(editor.userId);
            return (
              <div
                key={`${editor.userId}:${editor.agentKind}:${editor.agentName}`}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
              >
                <AgentAvatar kind={editor.agentKind} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-sans text-xs font-semibold text-white">
                    {persona ? personLabel(persona) : 'Alguien del equipo'}
                  </span>
                  <span className="truncate font-sans text-[11px] text-text-secondary">
                    con {editor.agentName} · {cuando(editor.lastAt)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}

function cuando(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
