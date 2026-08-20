'use client';

import { inviteMemberAction } from '@/app/(private)/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/action-state';
import {
  Button,
  Dialog,
  Input,
  type Paginated,
  type ProjectRole,
  Select,
  type UserProfile,
  alpha,
  colors,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { createApiClient } from '@praxis/commons/api';
import { useEffect, useId, useState } from 'react';

export interface InviteMemberDialogProps {
  projectId: string;
  roles: ProjectRole[];
  /** Quiénes no deben salir: miembros, invitados sin responder y el dueño. */
  excluirIds: string[];
  onClose?: () => void;
}

/** Toda petición del navegador pasa por el proxy de la zona, que pone el Bearer. */
const api = createApiClient({ gatewayPath: '/projects/api/gateway' });

/** Cuántos resultados se enseñan por búsqueda. */
const MAX_RESULTS = 6;

/**
 * Invitar a alguien al proyecto.
 *
 * La lista de personas **no se muestra hasta que se busca**: aparece al pulsar
 * Enter o el botón. Con pocos usuarios volcarla entera era cómodo, pero
 * acostumbra a elegir de una lista que dejará de caber en cuanto haya cuentas
 * de verdad; buscar primero es el gesto que escala.
 *
 * La búsqueda va **contra el servidor**, con `GET /users?search=`.
 *
 * ⚠️ Se resolvía en el cliente sobre `/users?limit=100` que traía la página, y
 * ese comentario decía que no había alternativa. La había: el backend acepta
 * `search` como query param desde hace tiempo y nadie volvió a mirarlo. Mientras
 * tanto, buscar solo encontraba a quien cupiera en las primeras cien cuentas de
 * **toda la plataforma** — o sea, a casi nadie en cuanto hubo cuentas de verdad.
 */
export function InviteMemberDialog({ projectId, roles, excluirIds, onClose }: InviteMemberDialogProps) {
  const [state, formAction, pending] = useAccion(inviteMemberAction, MEMBER_INITIAL_STATE);

  const [query, setQuery] = useState('');
  /** `null` mientras no se ha buscado: distingue "sin buscar" de "sin resultados". */
  const [results, setResults] = useState<UserProfile[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');

  const searchId = useId();
  const roleFieldId = useId();

  /**
   * Cerrar el diálogo cuando el servidor confirma.
   *
   * ⚠️ **La dependencia es `state`, no `state.done`.** `done` vale siempre lo
   * mismo —la cadena `'invited'`— así que a partir de la **segunda** invitación
   * sin recargar la página su valor no cambia, el efecto no se vuelve a
   * ejecutar y el diálogo se queda abierto encima de un formulario que ya se
   * envió. La primera vez sí funciona, porque ahí pasa de `null` a `'invited'`:
   * de ahí que pareciera aleatorio.
   *
   * `useAccion` devuelve un objeto nuevo por cada ejecución, así que su
   * identidad sí cambia siempre. La guarda de dentro sigue siendo la que decide
   * —si la acción falló, `done` es `null` y no se cierra nada—.
   *
   * El mismo error estaba en los 18 sitios que hacen esto. Si añades otro, la
   * dependencia es el estado entero.
   */
  useEffect(() => {
    if (state.done) {
      setQuery('');
      setResults(null);
      setSelected(null);
      onClose?.();
    }
  }, [state, onClose]);

  async function search() {
    const needle = query.trim();
    if (!needle) {
      setResults(null);
      setErrorBusqueda('');
      return;
    }

    setBuscando(true);
    setErrorBusqueda('');

    try {
      const pagina = await api.get<Paginated<UserProfile>>(
        `/users?search=${encodeURIComponent(needle)}&limit=${MAX_RESULTS}`,
      );

      const filtrados = pagina.items.filter((user) => !excluirIds.includes(user.id));
      setResults(filtrados);
    } catch {
      setErrorBusqueda('La búsqueda falló por un problema de red.');
      setResults(null);
    } finally {
      setBuscando(false);
    }
  }

  function reset() {
    setQuery('');
    setResults(null);
    setSelected(null);
    onClose?.();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
      <header className="mb-4 flex flex-col gap-1">
        <h3 className="font-display text-xl text-text-primary">Invitar al proyecto</h3>
        <p className="font-sans text-sm text-text-secondary">
          Recibirá una invitación y entrará al aceptarla, con el rol que elijas.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="userId" value={selected?.id ?? ''} />

        <div className="flex flex-col md:flex-row gap-4 items-start w-full">
          {/* Columna Izquierda: Búsqueda y Resultados */}
          <div className="flex-1 w-full flex flex-col gap-4">
            <div className="flex items-end gap-2">
              <Input
                id={searchId}
                type="search"
                label="Buscar persona"
                placeholder="Correo o nombre"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                  setResults(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    search();
                  }
                }}
                message="Solo aparecen personas que ya tienen cuenta."
                autoComplete="off"
                fullWidth
              />
              <Button
                type="button"
                variant="secondary"
                onClick={search}
                isLoading={buscando}
                disabled={buscando}
                className="mb-[22px]"
              >
                Buscar
              </Button>
            </div>

            {selected ? (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-primary px-3 py-2"
                style={{ background: alpha(colors.primary, 10) }}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-sans text-sm text-text-primary">
                    {personLabel(selected)}
                  </span>
                  <span className="truncate font-sans text-xs text-text-secondary">
                    {selected.credential.email}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              results !== null && (
                <div className="flex flex-col gap-1.5">
                  {errorBusqueda ? (
                    <p
                      role="alert"
                      className="rounded-lg bg-surface-elevated px-3 py-2.5 font-sans text-sm text-error"
                    >
                      {errorBusqueda}
                    </p>
                  ) : results.length === 0 ? (
                    <p className="rounded-lg bg-surface-elevated px-3 py-2.5 font-sans text-sm text-text-disabled">
                      Nadie coincide con «{query.trim()}».
                    </p>
                  ) : (
                    results.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setSelected(user)}
                        className="flex flex-col items-start rounded-lg bg-surface-elevated px-3 py-2 text-left transition-colors hover:bg-border"
                      >
                        <span className="font-sans text-sm text-text-primary">
                          {personLabel(user)}
                        </span>
                        <span className="font-sans text-xs text-text-secondary">
                          {user.credential.email}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )
            )}
          </div>

          {/* Columna Derecha: Rol */}
          <div className="w-full md:w-64 shrink-0">
            <Select
              id={roleFieldId}
              name="projectRoleId"
              label="Rol asignado"
              value={roleId}
              onValueChange={setRoleId}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              message="Decide lo que podrá hacer."
              fullWidth
            />
          </div>
        </div>

          {state.error && (
            <p
              role="alert"
              className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
              style={{
                background: alpha(colors.error, 10),
                borderColor: alpha(colors.error, 30),
              }}
            >
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={pending} disabled={!selected || !roleId}>
              Enviar invitación
            </Button>
          </div>
        </form>
    </div>
  );
}
