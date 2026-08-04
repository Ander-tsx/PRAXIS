'use client';

import { type AdminProject, Badge, Button, type ProjectStatusName } from '@praxis/commons';
import { useState } from 'react';
import { ESTADOS_PROYECTO, fechaYHora } from '@/lib/admin';
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
 * ## Los tres estados dan botones distintos
 *
 * Un proyecto activo se puede suspender o archivar; uno suspendido se reactiva o se
 * archiva; uno archivado solo se recupera. Archivar lo archivado no existe, y un
 * botón que no hace nada es peor que su ausencia.
 *
 * ## Sin borrar
 *
 * `DELETE /projects/:id` existe y es del dueño: cascadea, purga tareas en otro
 * microservicio y no se deshace. El panel ofrece los dos estados reversibles.
 *
 * En pantallas estrechas las columnas se apilan en tarjetas, igual que en Cuentas:
 * este panel se abre desde el teléfono cuando alguien avisa de un problema.
 */
export function ProjectsTable({ proyectos }: ProjectsTableProps) {
  const [objetivo, setObjetivo] = useState<{
    proyecto: AdminProject;
    destino: ProjectStatusName;
  } | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border">
        {/* Cabecera: solo en escritorio, donde de verdad hay columnas. */}
        <div className="hidden border-b border-border bg-surface px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-text-secondary md:grid md:grid-cols-[minmax(0,2.5fr)_1fr_auto_1fr_auto] md:gap-4">
          <span>Proyecto</span>
          <span>Estado</span>
          <span>Tamaño</span>
          <span>Se creó</span>
          <span className="text-right">Acciones</span>
        </div>

        <ul>
          {proyectos.map((proyecto) => {
            const estado = ESTADOS_PROYECTO[proyecto.status];
            const archivado = proyecto.status === 'DELETED';
            const activo = proyecto.status === 'ACTIVE';

            return (
              <li
                key={proyecto.id}
                className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid md:grid-cols-[minmax(0,2.5fr)_1fr_auto_1fr_auto] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-sans text-sm font-semibold text-text-primary">
                    {proyecto.name}
                  </p>
                  <p className="truncate font-sans text-xs text-text-secondary">
                    {proyecto.owner?.name ?? proyecto.owner?.email ?? 'Dueño no disponible'}
                  </p>
                  {proyecto.suspendedReason && (
                    <p className="mt-1 line-clamp-2 font-sans text-xs italic text-text-disabled">
                      «{proyecto.suspendedReason}»
                    </p>
                  )}
                </div>

                <div>
                  <span className="mr-2 font-sans text-xs text-text-disabled md:hidden">
                    Estado
                  </span>
                  <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                </div>

                <p className="whitespace-nowrap font-sans text-xs text-text-secondary">
                  {proyecto._count.members === 1
                    ? '1 miembro'
                    : `${proyecto._count.members} miembros`}
                  {' · '}
                  {proyecto._count.workspaces === 1
                    ? '1 espacio'
                    : `${proyecto._count.workspaces} espacios`}
                </p>

                <p className="font-sans text-xs text-text-secondary">
                  {fechaYHora(proyecto.createdAt)}
                </p>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    size="sm"
                    variant={activo ? 'danger' : 'secondary'}
                    onClick={() =>
                      setObjetivo({
                        proyecto,
                        destino: activo ? 'SUSPENDED' : 'ACTIVE',
                      })
                    }
                  >
                    {activo ? 'Suspender' : archivado ? 'Recuperar' : 'Reactivar'}
                  </Button>

                  {/* Archivar lo ya archivado no existe. */}
                  {!archivado && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setObjetivo({ proyecto, destino: 'DELETED' })}
                    >
                      Archivar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

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
