'use client';

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
} from '@praxis/commons';
import { createApiClient } from '@praxis/commons/api';
import { useActionState, useEffect, useId, useState } from 'react';
import { inviteMemberAction } from '@/app/(private)/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/action-state';

export interface InviteMemberDialogProps {
  projectId: string;
  roles: ProjectRole[];
  /** Quiénes no deben salir: miembros, invitados sin responder y el dueño. */
  excluirIds: string[];
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
export function InviteMemberDialog({ projectId, roles, excluirIds }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(inviteMemberAction, MEMBER_INITIAL_STATE);

  const [query, setQuery] = useState('');
  /** `null` mientras no se ha buscado: distingue "sin buscar" de "sin resultados". */
  const [results, setResults] = useState<UserProfile[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');

  const searchId = useId();
  const roleFieldId = useId();

  useEffect(() => {
    if (state.done) {
      setOpen(false);
      setQuery('');
      setResults(null);
      setSelected(null);
    }
  }, [state.done]);

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
      /* Se piden de más para poder descartar a los que ya están dentro sin
         quedarse corto de resultados. */
      const pagina = await api.get<Paginated<UserProfile>>(
        `/users?search=${encodeURIComponent(needle)}&limit=${MAX_RESULTS * 3}`,
      );

      const excluidos = new Set(excluirIds);
      setResults(pagina.items.filter((user) => !excluidos.has(user.id)).slice(0, MAX_RESULTS));
    } catch {
      setResults([]);
      setErrorBusqueda('No se pudo buscar. Inténtalo de nuevo.');
    } finally {
      setBuscando(false);
    }
  }

  function reset() {
    setOpen(false);
    setQuery('');
    setResults(null);
    setSelected(null);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={roles.length === 0}>
        Invitar persona
      </Button>

      <Dialog
        open={open}
        onClose={reset}
        title="Invitar al proyecto"
        description="Recibirá una invitación y entrará al aceptarla, con el rol que elijas."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="userId" value={selected?.id ?? ''} />

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
                /* Enter busca; sin esto enviaría el formulario a medias. */
                if (event.key === 'Enter') {
                  event.preventDefault();
                  search();
                }
              }}
              message="Solo aparecen personas que ya tienen cuenta en PRAXIS."
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
                {/* Un fallo de red no es «no hay nadie»: decirlo así manda a
                    buscar otra vez con otras palabras algo que sí estaba. */}
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

          <Select
            id={roleFieldId}
            name="projectRoleId"
            label="Rol con el que entrará"
            value={roleId}
            onValueChange={setRoleId}
            options={roles.map((role) => ({ value: role.id, label: role.name }))}
            message="Decide lo que podrá hacer dentro del proyecto."
            fullWidth
          />

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
      </Dialog>
    </>
  );
}
