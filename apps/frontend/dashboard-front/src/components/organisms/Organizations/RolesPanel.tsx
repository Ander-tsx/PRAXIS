'use client';

import { borrarPapelAction, guardarPapelAction } from '@/app/(private)/organizations/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import { Button, Input, Select, useAccion } from '@praxis/commons';
import type {
  OrganizationPermission,
  OrganizationPermissions,
  OrganizationRoleView,
} from '@praxis/commons/billing/planes';
import { TEXTO_DE_PERMISO } from '@praxis/commons/billing/planes';
import { useId, useState } from 'react';

/** El orden en que se leen, de lo que más abre a lo que menos. */
const ORDEN: OrganizationPermission[] = [
  'canManageBilling',
  'canManageMembers',
  'canManageAllProjects',
  'canManageRoleTemplates',
  'canManageOrganization',
  'canInviteMembers',
  'canViewAllProjects',
  'canViewAuditLog',
  'canCreateProject',
];

/**
 * Los papeles de una organización.
 *
 * ## Por qué esto no es la pantalla de roles de un proyecto
 *
 * Son **dos vocabularios distintos**, no la misma lista a dos escalas:
 * `canCreateTask` no significa nada aquí y `canManageBilling` no significa nada
 * dentro de un tablero. Por eso son dos pantallas y no una con un selector de
 * proyecto que repita la navegación que ya existe.
 *
 * ## 🔴 No se puede dar lo que no se tiene
 *
 * El servidor rechaza un papel con permisos que quien lo guarda no tiene —sin
 * esa regla, quien gestiona miembros se crea uno con la facturación dentro y se
 * lo asigna—. Aquí los permisos que no tienes salen **apagados y dichos**, en
 * vez de dejarte marcarlos y devolverte un error al guardar.
 */
export function RolesPanel({
  organizationId,
  papeles,
  mios,
  puedeEditar,
}: {
  organizationId: string;
  papeles: OrganizationRoleView[];
  /** Lo que puede quien mira. Lo que él no tiene, no lo puede repartir. */
  mios: OrganizationPermissions;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col">
        {papeles.map((papel) => (
          <li key={papel.id} className="border-b border-dotted border-border py-5 last:border-b-0">
            {editando === papel.id ? (
              <Formulario
                organizationId={organizationId}
                papel={papel}
                mios={mios}
                onCerrar={() => setEditando(null)}
              />
            ) : (
              <Fila
                organizationId={organizationId}
                papel={papel}
                puedeEditar={puedeEditar}
                onEditar={() => setEditando(papel.id)}
              />
            )}
          </li>
        ))}
      </ol>

      {puedeEditar &&
        (creando ? (
          <div className="border-t border-border pt-6">
            <Formulario
              organizationId={organizationId}
              papel={null}
              mios={mios}
              onCerrar={() => setCreando(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="self-start font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
          >
            Crear un papel
          </button>
        ))}
    </div>
  );
}

/** Una fila: el nombre, qué abre y qué se puede hacer con él. */
function Fila({
  organizationId,
  papel,
  puedeEditar,
  onEditar,
}: {
  organizationId: string;
  papel: OrganizationRoleView;
  puedeEditar: boolean;
  onEditar: () => void;
}) {
  const [borrar, borrarAction, borrando] = useAccion(borrarPapelAction, ORGANIZACION_INITIAL_STATE);
  const concedidos = ORDEN.filter((clave) => papel.permissions[clave]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-lg text-text-primary">
            {papel.name}
            {papel.isDefault && (
              <span className="ml-3 font-sans text-[10px] uppercase tracking-wider text-text-disabled">
                por defecto
              </span>
            )}
          </span>
          <span className="font-sans text-xs text-text-disabled">
            {papel.miembros === 0
              ? 'Nadie lo lleva'
              : `${papel.miembros} ${papel.miembros === 1 ? 'persona' : 'personas'}`}
          </span>
        </div>

        {puedeEditar && (
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={onEditar}
              className="font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
            >
              Editar
            </button>
            {/* ⚠️ El servidor rechaza borrar uno que todavía lleva gente o que
                es el de por defecto, y su mensaje dice cuánta gente hay que
                mover. Aquí no se esconde el botón: esconderlo dejaría a alguien
                preguntándose por qué no puede, sin decírselo. */}
            <form action={borrarAction}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="roleId" value={papel.id} />
              <Button type="submit" variant="ghost" size="sm" isLoading={borrando}>
                Borrar
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Lo que abre, con la frase entera y no el identificador: «Gestionar
          proyectos» no le dice a nadie que eso incluye entrar en un tablero
          ajeno, y es justo lo que sorprende. */}
      <ul className="flex flex-col gap-1">
        {concedidos.length === 0 ? (
          <li className="font-sans text-sm text-text-secondary">
            No abre nada. Solo sirve para estar dentro y participar en los proyectos a los que se le
            añada.
          </li>
        ) : (
          concedidos.map((clave) => (
            <li key={clave} className="flex items-baseline gap-2 font-sans text-sm">
              <span aria-hidden="true" className="text-primary">
                ·
              </span>
              <span className="text-text-secondary">{TEXTO_DE_PERMISO[clave]}</span>
            </li>
          ))
        )}
      </ul>

      {borrar.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {borrar.error}
        </p>
      )}
    </div>
  );
}

/**
 * Crear o editar un papel.
 *
 * ⚠️ **Se envía con `onSubmit` + `preventDefault()` porque EDITA.** Un
 * `<form action={…}>` se resetea solo en React 19 y los `Select` volverían a su
 * valor inicial al terminar — que aquí es el papel de antes de guardarlo. Ver
 * CLAUDE.md.
 *
 * ⚠️ **Un booleano se pinta con `Select`, nunca con `Checkbox`** (§45.3). Una
 * casilla no distingue «no» de «todavía no lo he mirado», y estos nueve valores
 * hay que poder verlos decididos de un vistazo.
 */
function Formulario({
  organizationId,
  papel,
  mios,
  onCerrar,
}: {
  organizationId: string;
  papel: OrganizationRoleView | null;
  mios: OrganizationPermissions;
  onCerrar: () => void;
}) {
  const [state, formAction, pending] = useAccion(guardarPapelAction, ORGANIZACION_INITIAL_STATE);
  const [name, setName] = useState(papel?.name ?? '');
  const [permisos, setPermisos] = useState<Record<string, boolean>>(
    Object.fromEntries(ORDEN.map((clave) => [clave, papel?.permissions[clave] ?? false])),
  );
  const nombreId = useId();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('organizationId', organizationId);
    if (papel) datos.set('roleId', papel.id);
    datos.set('name', name);
    for (const clave of ORDEN) datos.set(`permiso.${clave}`, String(permisos[clave] === true));
    formAction(datos);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <Input
        id={nombreId}
        label="Nombre del papel"
        value={name}
        onChange={(evento) => setName(evento.target.value)}
        maxLength={60}
        placeholder="Coordinación"
        fullWidth
        required
      />

      <ul className="flex flex-col">
        {ORDEN.map((clave) => {
          const puedoDarlo = mios[clave];
          return (
            <li
              key={clave}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-dotted border-border py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 font-sans text-sm text-text-secondary">
                {TEXTO_DE_PERMISO[clave]}
                {!puedoDarlo && (
                  /* Dicho, no escondido: quien no entiende por qué no puede
                     marcarlo va a pensar que la pantalla falla. */
                  <span className="ml-2 text-xs text-text-disabled">
                    — no lo tienes, no puedes darlo
                  </span>
                )}
              </span>
              <div className="w-28 shrink-0">
                <Select
                  value={permisos[clave] ? 'si' : 'no'}
                  disabled={!puedoDarlo}
                  onValueChange={(valor) =>
                    setPermisos((antes) => ({ ...antes, [clave]: valor === 'si' }))
                  }
                  options={[
                    { value: 'no', label: 'No' },
                    { value: 'si', label: 'Sí' },
                  ]}
                  fullWidth
                />
              </div>
            </li>
          );
        })}
      </ul>

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" isLoading={pending}>
          {papel ? 'Guardar' : 'Crear el papel'}
        </Button>
        <button
          type="button"
          onClick={onCerrar}
          className="font-sans text-sm text-text-secondary underline decoration-transparent underline-offset-4 transition-colors hover:decoration-border"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
