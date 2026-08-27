'use client';

import {
  borrarPlantillaAction,
  guardarPlantillaAction,
} from '@/app/(private)/organizations/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import { Button, Input, Select, useAccion } from '@praxis/commons';
import type { ProjectRoleTemplateView } from '@praxis/commons/billing/planes';
import { useId, useState } from 'react';

/**
 * Los permisos de proyecto, con la frase que lee una persona.
 *
 * ⚠️ **Es el otro vocabulario**, no el de la organización: aquí no hay
 * `canManageBilling` y allí no hay `canCreateTask`. Mezclarlos daría un rol de
 * proyecto con un permiso que nadie comprueba nunca.
 *
 * ⚠️ Y la lista se escribe aquí porque es **texto de pantalla**, no el catálogo:
 * el catálogo vive en `ProjectPermission` de contracts, y lo que falte de esta
 * tabla se pinta con su identificador en vez de desaparecer. Un permiso sin
 * frase es feo; uno que no se pinta es una casilla que nadie sabe que existe.
 */
const TEXTO: Record<string, string> = {
  canViewProject: 'Ver el proyecto y su contenido',
  canCreateTask: 'Crear tareas',
  canMoveTask: 'Mover tareas de columna, sin editarlas',
  canEditTask: 'Editar tareas',
  canDeleteTask: 'Borrar tareas',
  canCreateBoard: 'Crear tableros',
  canEditBoard: 'Editar tableros',
  canDeleteBoard: 'Borrar tableros',
  canCreateColumn: 'Crear columnas',
  canEditColumn: 'Editar columnas',
  canDeleteColumn: 'Borrar columnas',
  canManageMembers: 'Añadir y sacar gente del proyecto',
  canManageRoles: 'Definir los roles del proyecto',
  canManageAutomations: 'Crear automatizaciones que escriben solas',
  canManageIntegrations: 'Conectar integraciones',
  canComment: 'Comentar y participar en el chat',
  canManageLabels: 'Gestionar las etiquetas',
  canEditProject: 'Cambiar el nombre y la descripción',
  canViewReports: 'Ver Análisis y usar PRAX con este proyecto',
  canDeleteProject: 'Borrar el proyecto',
};

/**
 * Las plantillas de rol de proyecto.
 *
 * 🔴 **Solo afectan a los proyectos nuevos, y hay que decirlo aquí.** Cambiar
 * una plantilla no reescribe los roles de los proyectos que ya existen: sería
 * borrar el trabajo de quien los ajustó, desde una pantalla que habla de otra
 * cosa. Nadie lo supone, así que se escribe.
 */
export function TemplatesPanel({
  organizationId,
  plantillas,
  puedeEditar,
}: {
  organizationId: string;
  plantillas: ProjectRoleTemplateView[];
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  /* El orden lo fija la primera plantilla que llegue: son las claves del
     catálogo, y todas traen las mismas. Sin una, se cae a las conocidas. */
  const claves = Object.keys(plantillas[0]?.permissions ?? TEXTO);

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-xl border-l-2 border-warning py-1 pl-4 font-sans text-sm text-text-secondary">
        Un cambio aquí solo se nota en los proyectos que se creen a partir de ahora. Los que ya
        existen conservan sus roles.
      </p>

      <ol className="flex flex-col">
        {plantillas.map((plantilla) => (
          <li
            key={plantilla.id}
            className="border-b border-dotted border-border py-5 last:border-b-0"
          >
            {editando === plantilla.id ? (
              <Formulario
                organizationId={organizationId}
                plantilla={plantilla}
                claves={claves}
                onCerrar={() => setEditando(null)}
              />
            ) : (
              <Fila
                organizationId={organizationId}
                plantilla={plantilla}
                puedeEditar={puedeEditar}
                onEditar={() => setEditando(plantilla.id)}
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
              plantilla={null}
              claves={claves}
              onCerrar={() => setCreando(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="self-start font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
          >
            Crear una plantilla
          </button>
        ))}
    </div>
  );
}

function Fila({
  organizationId,
  plantilla,
  puedeEditar,
  onEditar,
}: {
  organizationId: string;
  plantilla: ProjectRoleTemplateView;
  puedeEditar: boolean;
  onEditar: () => void;
}) {
  const [borrar, borrarAction, borrando] = useAccion(
    borrarPlantillaAction,
    ORGANIZACION_INITIAL_STATE,
  );
  const cuantos = Object.values(plantilla.permissions).filter(Boolean).length;
  const total = Object.keys(plantilla.permissions).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-lg text-text-primary">{plantilla.name}</span>
          <span className="font-sans text-xs text-text-disabled">
            {cuantos === total
              ? 'Todos los permisos del proyecto'
              : `${cuantos} de ${total} permisos`}
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
            <form action={borrarAction}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="templateId" value={plantilla.id} />
              <Button type="submit" variant="ghost" size="sm" isLoading={borrando}>
                Borrar
              </Button>
            </form>
          </div>
        )}
      </div>

      {borrar.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {borrar.error}
        </p>
      )}
    </div>
  );
}

/**
 * ⚠️ **`onSubmit` + `preventDefault()` porque EDITA.** Un `<form action={…}>` se
 * resetea solo en React 19 y los veinte `Select` volverían a su valor de antes
 * de guardar. Ver CLAUDE.md.
 */
function Formulario({
  organizationId,
  plantilla,
  claves,
  onCerrar,
}: {
  organizationId: string;
  plantilla: ProjectRoleTemplateView | null;
  claves: string[];
  onCerrar: () => void;
}) {
  const [state, formAction, pending] = useAccion(
    guardarPlantillaAction,
    ORGANIZACION_INITIAL_STATE,
  );
  const [name, setName] = useState(plantilla?.name ?? '');
  const [permisos, setPermisos] = useState<Record<string, boolean>>(
    Object.fromEntries(claves.map((clave) => [clave, plantilla?.permissions[clave] ?? false])),
  );
  const nombreId = useId();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('organizationId', organizationId);
    if (plantilla) datos.set('templateId', plantilla.id);
    datos.set('name', name);
    for (const clave of claves) datos.set(`permiso.${clave}`, String(permisos[clave] === true));
    formAction(datos);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <Input
        id={nombreId}
        label="Nombre del rol"
        value={name}
        onChange={(evento) => setName(evento.target.value)}
        maxLength={60}
        placeholder="QA"
        fullWidth
        required
      />

      <ul className="flex flex-col">
        {claves.map((clave) => (
          <li
            key={clave}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-dotted border-border py-3 last:border-b-0"
          >
            <span className="min-w-0 flex-1 font-sans text-sm text-text-secondary">
              {TEXTO[clave] ?? clave}
            </span>
            <div className="w-28 shrink-0">
              <Select
                value={permisos[clave] ? 'si' : 'no'}
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
        ))}
      </ul>

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" isLoading={pending}>
          {plantilla ? 'Guardar' : 'Crear la plantilla'}
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
