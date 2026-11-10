'use client';

import { permitirAtribucionAction } from '@/app/(privado)/main/integrations/actions';
import { NOTIFICATION_INITIAL_STATE } from '@/lib/main/action-state';
import { AgentAvatar, Button, useAccion } from '@praxis/commons';
import type { FormEvent } from 'react';

/**
 * El ajuste de la organización que enciende la **coautoría de los agentes de IA**: lo que
 * Claude, ChatGPT o cualquier agente haga por MCP a nombre de alguien se marca en la tarea
 * («Editado por Claude y Ana»), en cada paso del checklist y en cada nota.
 *
 * Apagado por defecto y solo para quien administra la organización. Apagarlo deja de
 * anotar lo nuevo; lo ya marcado queda como historial.
 */
export function AtribucionDeAgentes({
  organizationId,
  agentAttribution,
}: {
  organizationId: string;
  agentAttribution: boolean;
}) {
  const [state, enviar, pending] = useAccion(permitirAtribucionAction, NOTIFICATION_INITIAL_STATE);

  /* `onSubmit` y no `action`: es un formulario de edición (React 19 resetea los de `action`). */
  function cambiar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('organizationId', organizationId);
    datos.set('agentAttribution', String(!agentAttribution));
    enviar(datos);
  }

  return (
    <form
      onSubmit={cambiar}
      className="mb-6 flex flex-col gap-2 rounded-md border border-border-subtle bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-sans text-xs uppercase tracking-wider text-text-secondary">
            Ajuste de la organización · solo lo ve quien la administra
          </span>
          <span className="flex items-center gap-2 font-sans text-sm font-medium text-text-primary">
            <span className="flex -space-x-1.5">
              <AgentAvatar kind="claude" size="sm" ring />
              <AgentAvatar kind="chatgpt" size="sm" ring />
            </span>
            {agentAttribution
              ? 'Se marca lo que hacen los agentes de IA'
              : 'No se marca lo que hacen los agentes de IA'}
          </span>
          <span className="max-w-xl font-sans text-xs text-text-secondary">
            {agentAttribution
              ? 'Lo que un agente haga por MCP a nombre de alguien se indica en la tarea («Editado por Claude y Ana»), en cada paso del checklist y en cada nota. Apagarlo deja de marcar lo nuevo; lo ya marcado se conserva.'
              : 'Actívalo para saber cuándo un agente (Claude, ChatGPT…) edita tareas, marca pasos o escribe notas por alguien del equipo. Empieza a marcar desde que lo enciendas.'}
          </span>
        </div>
        <Button
          type="submit"
          variant={agentAttribution ? 'secondary' : 'primary'}
          size="sm"
          disabled={pending}
        >
          {pending ? 'Guardando…' : agentAttribution ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
      {state.error && <p className="font-sans text-sm text-error">{state.error}</p>}
    </form>
  );
}
