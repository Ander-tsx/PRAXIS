'use client';

import { deleteProjectAction } from '@/app/(private)/projects/actions';
import { RowActions } from '@/components/molecules/RowActions';
import { ESTADOS_PROYECTO, fechaYHora } from '@/lib/admin';
import {
  type AdminProject,
  Badge,
  type DataColumn,
  DataTable,
  type ProjectStatusName,
} from '@praxis/commons';
import { useMemo, useState } from 'react';
import { HardDeleteDialog } from './HardDeleteDialog';
import { ProjectStatusDialog } from './ProjectStatusDialog';

export interface ProjectsTableProps {
  proyectos: AdminProject[];
}

/**
 * El inventario de proyectos, con lo que se puede hacer sobre cada uno.
 *
 * ## No enlaza al proyecto
 *
 * Y no es un olvido. El rol global **no concede permisos dentro de un proyecto**
 * (`docs/backend/permissions.md`), así que `/projects/<slug>` le daría 403 a quien
 * administra si no es miembro — un enlace que parece roto. Lo que se necesita para
 * decidir está en la fila: nombre, dueño, tamaño y estado.
 *
 * ## Los tres estados dan acciones distintas
 *
 * Un proyecto activo se puede suspender o archivar; uno suspendido se reactiva o se
 * archiva; uno archivado solo se recupera. Archivar lo archivado no existe, y una
 * opción que no hace nada es peor que su ausencia.
 *
 * ## Sin borrar
 *
 * `DELETE /projects/:id` existe y es del dueño: cascadea, purga tareas en otro
 * microservicio y no se deshace. El panel ofrece los dos estados reversibles.
 *
 * ## ⚠️ Tenía DOS pistas `auto`, y era la peor de las tres tablas
 *
 * `minmax(0,2.5fr)_1fr_auto_1fr_auto`: «Tamaño» y «Acciones». Cada una se medía
 * con su contenido, distinto en la cabecera y en la fila, así que había dos
 * puntos de desajuste que además se acumulaban. Ahora las columnas se declaran
 * una sola vez y `Track` no admite `auto`. Ver `DataTable`.
 */
export function ProjectsTable({ proyectos }: ProjectsTableProps) {
  const [borrar, setBorrar] = useState<AdminProject | null>(null);
  const [objetivo, setObjetivo] = useState<{
    proyecto: AdminProject;
    destino: ProjectStatusName;
  } | null>(null);

  const columnas = useMemo<DataColumn<AdminProject>[]>(
    () => [
      {
        key: 'proyecto',
        header: 'Proyecto',
        track: { fr: 2.5 },
        mobileLabel: false,
        cell: (proyecto) => (
          <div className="min-w-0">
            <p className="truncate font-sans text-sm font-semibold text-text-primary">
              {proyecto.name}
            </p>
            <p className="truncate font-sans text-xs text-text-secondary">
              {proyecto.owner?.name ?? proyecto.owner?.email ?? 'Dueño no disponible'}
            </p>
            {/* El motivo, aquí y no detrás de un clic: es la respuesta a «¿por
                qué está suspendido?», que es la pregunta con la que se abre
                esta pantalla. */}
            {proyecto.suspendedReason && (
              <p className="mt-1 line-clamp-2 font-sans text-xs italic text-text-disabled">
                «{proyecto.suspendedReason}»
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'estado',
        header: 'Estado',
        track: { fr: 1 },
        cell: (proyecto) => {
          const estado = ESTADOS_PROYECTO[proyecto.status];
          return <Badge variant={estado.variante}>{estado.etiqueta}</Badge>;
        },
      },
      {
        key: 'tamano',
        header: 'Tamaño',
        track: { fr: 1.2 },
        cell: (proyecto) => (
          <p className="truncate font-sans text-xs text-text-secondary">
            {proyecto._count.members === 1 ? '1 miembro' : `${proyecto._count.members} miembros`}
            {' · '}
            {proyecto._count.workspaces === 1
              ? '1 espacio'
              : `${proyecto._count.workspaces} espacios`}
          </p>
        ),
      },
      {
        key: 'alta',
        header: 'Se creó',
        track: { fr: 1.1 },
        cell: (proyecto) => (
          <p className="truncate font-sans text-xs text-text-secondary">
            {fechaYHora(proyecto.createdAt)}
          </p>
        ),
      },
      {
        key: 'acciones',
        header: 'Acciones',
        track: { rem: 5 },
        align: 'end',
        mobileLabel: false,
        cell: (proyecto) => {
          const archivado = proyecto.status === 'DELETED';
          const activo = proyecto.status === 'ACTIVE';

          return (
            <RowActions
              label={proyecto.name}
              actions={[
                {
                  id: 'estado',
                  label: activo
                    ? 'Suspender proyecto'
                    : archivado
                      ? 'Recuperar proyecto'
                      : 'Reactivar proyecto',
                  tone: activo ? 'danger' : 'default',
                  onSelect: () =>
                    setObjetivo({ proyecto, destino: activo ? 'SUSPENDED' : 'ACTIVE' }),
                },
                /* Archivar lo ya archivado no existe, así que la opción tampoco:
                   no se enseña apagada porque no hay ningún motivo que explicar,
                   simplemente no aplica a este estado. */
                ...(archivado
                  ? []
                  : [
                      {
                        id: 'archivar',
                        label: 'Archivar proyecto',
                        tone: 'danger' as const,
                        onSelect: () => setObjetivo({ proyecto, destino: 'DELETED' as const }),
                      },
                    ]),
                /* ⚠️ **Borrar no es archivar**, y van seguidos a propósito:
                   archivar es el paso reversible y tiene que verse primero. */
                {
                  id: 'borrar',
                  label: 'Borrar para siempre',
                  tone: 'danger' as const,
                  onSelect: () => setBorrar(proyecto),
                },
              ]}
            />
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columnas}
        rows={proyectos}
        rowKey={(proyecto) => proyecto.id}
        /* `start`: la primera celda crece cuando hay motivo de suspensión, y con
           `center` las otras cuatro quedaban flotando a media altura. */
        align="start"
        ariaLabel="Proyectos de la plataforma"
      />

      {borrar && (
        <HardDeleteDialog
          open
          onClose={() => setBorrar(null)}
          queCosa="este proyecto"
          nombre={borrar.name}
          campos={{ projectId: borrar.id, projectName: borrar.name }}
          accion={deleteProjectAction}
          arrastra={[
            'El proyecto, sus espacios, tableros y columnas',
            'Todas sus tareas, con sus checklists, adjuntos y comentarios',
            'Sus roles, su gente y su chat de equipo',
            'Sus reglas de automatización y su historial de ejecuciones',
          ]}
        />
      )}

      {objetivo && (
        <ProjectStatusDialog
          proyecto={objetivo.proyecto}
          destino={objetivo.destino}
          open
          onClose={() => setObjetivo(null)}
        />
      )}
    </>
  );
}
