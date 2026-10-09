'use client';

import {
  actualizarConexionAction,
  revocarConexionAction,
} from '@/app/(privado)/main/integrations/actions';
import { NOTIFICATION_INITIAL_STATE } from '@/lib/main/action-state';
import type { McpConnectionView } from '@/lib/main/integrations';
import { Button, Checkbox, useAccion } from '@praxis/commons';
import { type FormEvent, useState } from 'react';
import { GuiaDeConexion } from './GuiaDeConexion';

export interface OrgDeConexion {
  id: string;
  name: string;
}

/**
 * Los clientes de IA conectados con tu cuenta de Kyloo (ChatGPT, Claude web).
 *
 * Una conexión no vale para una organización sino para las que elegiste al
 * conectar, con una activa. **Aquí se cambia eso sin reconectar**: añadir una
 * organización nueva, quitar otra, o decidir con cuál trabaja ahora. El agente
 * también puede cambiar la activa solo (`switch_organization`) dentro de las
 * permitidas; lo que no puede es ampliarlas — eso solo se hace aquí.
 */
export function ConexionesDeIa({
  conexiones,
  organizaciones,
  endpoint,
}: {
  conexiones: McpConnectionView[];
  organizaciones: OrgDeConexion[];
  endpoint: string;
}) {
  const vivas = conexiones.filter((c) => !c.revokedAt);

  return (
    <div className="flex flex-col gap-8">
      <GuiaDeConexion endpoint={endpoint} />

      <section className="flex flex-col gap-3">
        <h3 className="font-sans text-base font-medium text-text-primary">Tus conexiones</h3>
        {vivas.length === 0 ? (
          <p className="font-sans text-sm text-text-secondary">Todavía no has conectado ninguno.</p>
        ) : (
          <ul className="flex flex-col">
            {vivas.map((conexion) => (
              <Conexion key={conexion.id} conexion={conexion} organizaciones={organizaciones} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function fecha(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
}

function Conexion({
  conexion,
  organizaciones,
}: {
  conexion: McpConnectionView;
  organizaciones: OrgDeConexion[];
}) {
  const [guardado, guardar, guardando] = useAccion(
    actualizarConexionAction,
    NOTIFICATION_INITIAL_STATE,
  );
  const [revocada, revocar, revocando] = useAccion(
    revocarConexionAction,
    NOTIFICATION_INITIAL_STATE,
  );
  const [elegidas, setElegidas] = useState(new Set(conexion.allowedOrgIds));
  const [activa, setActiva] = useState(conexion.activeOrgId);
  const [confirmando, setConfirmando] = useState(false);

  /* Quitar la activa de las marcadas no puede dejar una activa que ya no está. */
  function alternar(id: string) {
    setElegidas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      if (!siguiente.has(activa)) setActiva([...siguiente][0] ?? '');
      return siguiente;
    });
  }

  /* `onSubmit` + FormData a mano y no `action={…}`: React 19 resetea el formulario al
     terminar, y estos campos son controlados por el estado de arriba. */
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('id', conexion.id);
    datos.set('activeOrgId', activa);
    for (const id of elegidas) datos.append('allowedOrgIds', id);
    guardar(datos);
  }

  function quitar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('id', conexion.id);
    revocar(datos);
  }

  const usada = fecha(conexion.lastUsedAt);
  const cambiado =
    activa !== conexion.activeOrgId ||
    elegidas.size !== conexion.allowedOrgIds.length ||
    conexion.allowedOrgIds.some((id) => !elegidas.has(id));

  return (
    <li className="flex flex-col gap-3 border-t border-border py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-sans text-sm font-medium text-text-primary">
          {conexion.clientName}
        </span>
        <span className="font-sans text-xs text-text-secondary">
          {usada ? `usada el ${usada}` : 'sin usar todavía'} · conectada el{' '}
          {fecha(conexion.createdAt)}
        </span>
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-sans text-xs text-text-secondary">
            Puede llegar a estas organizaciones; la marcada con el círculo es con la que trabaja
            ahora.
          </legend>
          {organizaciones.map((org) => (
            <div key={org.id} className="flex items-center gap-3">
              <Checkbox
                label={org.name}
                checked={elegidas.has(org.id)}
                onChange={() => alternar(org.id)}
                disabled={guardando}
              />
              <label className="ml-auto flex items-center gap-1.5 font-sans text-xs text-text-secondary">
                <input
                  type="radio"
                  name={`activa-${conexion.id}`}
                  checked={activa === org.id}
                  disabled={!elegidas.has(org.id) || guardando}
                  onChange={() => setActiva(org.id)}
                  aria-label={`Trabajar ahora en ${org.name}`}
                />
                activa
              </label>
            </div>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={!cambiado || guardando || elegidas.size === 0}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
          {guardado.done && !cambiado && (
            <span className="font-sans text-xs text-text-secondary">Guardado.</span>
          )}
          {guardado.error && (
            <span role="alert" className="font-sans text-xs text-error">
              {guardado.error}
            </span>
          )}
        </div>
      </form>

      <form onSubmit={quitar} className="flex items-center gap-2">
        {confirmando ? (
          <>
            <span className="font-sans text-xs text-text-secondary">
              Deja de funcionar en la siguiente llamada.
            </span>
            <Button type="submit" variant="danger" size="sm" disabled={revocando}>
              {revocando ? 'Revocando…' : 'Revocar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
            Revocar acceso
          </Button>
        )}
        {revocada.error && (
          <span role="alert" className="font-sans text-xs text-error">
            {revocada.error}
          </span>
        )}
      </form>
    </li>
  );
}
