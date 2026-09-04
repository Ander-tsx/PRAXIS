'use client';

import { inviteMemberAction } from '@/app/projects/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/projects/action-state';
import { Button, Input, type ProjectRole, QuotaNotice, Select, useAccion } from '@praxis/commons';
import { createApiClient } from '@praxis/commons/api';
import { useEffect, useId, useMemo, useState } from 'react';

export interface InviteMemberDialogProps {
  projectId: string;
  roles: ProjectRole[];
  /** Quiénes no deben salir: miembros, invitados sin responder y el dueño. */
  excluirIds: string[];
  /**
   * Si quien invita es el dueño del proyecto.
   *
   * ⚠️ **Solo se usa para el tope de miembros, y ahí importa mucho.** El tope lo
   * pone el plan del **dueño**, así que ofrecerle «ver planes» a un invitado que
   * administra el equipo sería mandarle a pagar por algo que no arregla su caso:
   * su plan no toca este proyecto.
   */
  soyDueño?: boolean;
  /**
   * La organización dueña del proyecto: **de ahí sale la lista**.
   *
   * Sin ella se cae al directorio de la plataforma, que es lo que había antes y
   * lo que producía el 403. Es opcional porque el tipo `Project` la trae
   * opcional —los listados viejos no la incluyen—, no porque se pueda invitar
   * sin organización.
   */
  organizationId?: string;
  onClose?: () => void;
}

/**
 * Una fila de `GET /organizations/:id/members`.
 *
 * ⚠️ **`userId` puede ser nulo**: una invitación a la organización sin aceptar
 * ocupa asiento pero todavía no tiene cuenta detrás. Esas se filtran al cargar —
 * no hay a quién meter en un proyecto.
 */
interface MiembroDeLaOrg {
  userId: string | null;
  email: string;
  name: string | null;
  roleName: string | null;
}

/** Toda petición del navegador pasa por el proxy de la zona, que pone el Bearer. */
const api = createApiClient({ gatewayPath: '/api/gateway' });

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
 * ## 🔴 Se busca en la organización, no en la plataforma
 *
 * Hasta 2026-08-28 esto buscaba en `GET /users?search=`: el directorio entero de
 * PRAXIS. Y **quien entra en un proyecto necesita asiento en su organización**,
 * así que la mitad de lo que ofrecía terminaba en un `403 NOT_IN_ORG` al
 * invitar — un error después de haber elegido a la persona, que es el peor
 * momento para enterarse.
 *
 * Ahora la lista es `GET /organizations/:id/members` y se filtra en el cliente:
 * son los de un equipo, caben en una respuesta, y no hay nada que buscar contra
 * el servidor.
 *
 * ⚠️ **Y quien no esté sale con una salida, no con un «no encontrado».** Si
 * nadie coincide, se ofrece invitar a la organización — que es el paso que de
 * verdad falta, y el único que arregla el caso.
 */
export function InviteMemberDialog({
  projectId,
  roles,
  excluirIds,
  soyDueño = false,
  organizationId,
  onClose,
}: InviteMemberDialogProps) {
  const [state, formAction, pending] = useAccion(inviteMemberAction, MEMBER_INITIAL_STATE);

  const [query, setQuery] = useState('');
  /**
   * El equipo entero, una sola vez.
   *
   * `null` mientras carga o si falló. No se pagina ni se busca contra el
   * servidor: son los miembros de **una** organización —el plan más grande da
   * asientos de sobra para una respuesta— y filtrar en el cliente hace que
   * escribir vaya afinando sin un viaje de red por tecla.
   */
  const [equipo, setEquipo] = useState<MiembroDeLaOrg[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [selected, setSelected] = useState<MiembroDeLaOrg | null>(null);
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
      setSelected(null);
      onClose?.();
    }
  }, [state, onClose]);

  /**
   * El equipo de la organización, al abrir el diálogo.
   *
   * ⚠️ **Solo quienes ya tienen cuenta.** Una invitación a la organización sin
   * aceptar ocupa asiento pero viene con `userId` nulo: no hay a quién meter en
   * un proyecto todavía, y ofrecerla dejaría elegir una fila que al enviar no
   * manda ningún identificador.
   */
  useEffect(() => {
    if (!organizationId) {
      setCargando(false);
      return;
    }

    let vigente = true;

    api
      .get<MiembroDeLaOrg[]>(`/organizations/${organizationId}/members`)
      .then((miembros) => {
        if (!vigente) return;
        setEquipo(miembros.filter((miembro) => miembro.userId));
      })
      .catch(() => {
        if (!vigente) return;
        setErrorBusqueda('No se pudo cargar el equipo de la organización.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    /* Si el diálogo se cierra mientras la respuesta viaja, escribir estado sobre
       un componente desmontado avisa en consola y no sirve de nada. */
    return () => {
      vigente = false;
    };
  }, [organizationId]);

  /**
   * Quiénes encajan con lo escrito, ya sin los que están dentro.
   *
   * `excluirIds` trae miembros, invitados sin responder y el dueño: ofrecerlos
   * sería ofrecer una acción que el servidor rechaza.
   */
  const candidatos = useMemo(() => {
    const disponibles = (equipo ?? []).filter(
      (miembro) => miembro.userId && !excluirIds.includes(miembro.userId),
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return disponibles.slice(0, MAX_RESULTS);

    return disponibles
      .filter(
        (miembro) =>
          miembro.email.toLowerCase().includes(needle) ||
          (miembro.name ?? '').toLowerCase().includes(needle),
      )
      .slice(0, MAX_RESULTS);
  }, [equipo, excluirIds, query]);

  function reset() {
    setQuery('');
    setSelected(null);
    onClose?.();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#191919] p-6">
      <header className="mb-4 flex flex-col gap-1">
        <h3 className="font-sans text-base font-semibold text-white">Invitar al proyecto</h3>
        <p className="font-sans text-sm text-white/60">
          Recibirá una invitación y entrará al aceptarla, con el rol que elijas.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="userId" value={selected?.userId ?? ''} />

        <div className="flex flex-col md:flex-row gap-4 items-start w-full">
          {/* Columna Izquierda: Búsqueda y Resultados */}
          <div className="flex-1 w-full flex flex-col gap-4">
            <Input
              id={searchId}
              type="search"
              label="Buscar en el equipo"
              placeholder="Correo o nombre"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(null);
              }}
              message={
                cargando
                  ? 'Cargando el equipo…'
                  : 'Solo sale quien ya tiene asiento en la organización.'
              }
              autoComplete="off"
              fullWidth
            />

            {selected ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-sans text-sm text-white">
                    {selected.name || selected.email}
                  </span>
                  <span className="truncate font-sans text-xs text-white/50">
                    {selected.email}
                    {selected.roleName ? ` · ${selected.roleName}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 font-sans text-xs text-white/60 transition-colors hover:text-white"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {errorBusqueda ? (
                  <p
                    role="alert"
                    className="rounded-lg bg-white/[0.03] px-3 py-2.5 font-sans text-sm text-error"
                  >
                    {errorBusqueda}
                  </p>
                ) : cargando ? null : candidatos.length === 0 ? (
                  /* 🔴 **Una salida, no un «no encontrado».** Quien busques puede
                     no estar en la organización todavía, y entonces lo que falta
                     no es otra búsqueda: es un asiento. Antes esto decía «nadie
                     coincide» y dejaba a quien invita sin saber qué hacer —o
                     peor, eligiendo a alguien de fuera para recibir un 403 al
                     enviar. */
                  <div className="flex flex-col gap-2 rounded-lg bg-white/[0.03] px-3 py-3">
                    <p className="font-sans text-sm text-white/60">
                      {query.trim()
                        ? `Nadie del equipo coincide con «${query.trim()}».`
                        : 'Todo el equipo está ya en este proyecto.'}
                    </p>
                    {organizationId && (
                      <a
                        href="/main/team"
                        className="font-sans text-sm text-white underline underline-offset-2 hover:text-white/70"
                      >
                        Invitar a alguien a la organización →
                      </a>
                    )}
                  </div>
                ) : (
                  candidatos.map((miembro) => (
                    <button
                      key={miembro.userId as string}
                      type="button"
                      onClick={() => setSelected(miembro)}
                      className="flex flex-col items-start rounded-lg bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="font-sans text-sm text-white">
                        {miembro.name || miembro.email}
                      </span>
                      <span className="font-sans text-xs text-white/50">
                        {miembro.email}
                        {miembro.roleName ? ` · ${miembro.roleName}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
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

        {/* Quedarse sin sitio en el plan no es un fallo del formulario: hay
              una salida y hay que enseñarla. Ver `QuotaNotice`. */}
        {state.cuota ? (
          <QuotaNotice detalle={state.cuota} mensaje={state.error ?? ''} ampliarSirve={soyDueño} />
        ) : (
          state.error && (
            <p
              role="alert"
              className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 font-sans text-sm text-error"
            >
              {state.error}
            </p>
          )
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
