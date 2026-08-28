'use client';

import { type AdminOrganization, fechaYHora } from '@/lib/admin';
import { Badge, type DataColumn, DataTable } from '@praxis/commons';
import { useMemo } from 'react';

export interface OrganizationsTableProps {
  organizaciones: AdminOrganization[];
}

/**
 * Las organizaciones de la instalación, con su plan y sus asientos.
 *
 * ## Sin columna de acciones, y no es un olvido
 *
 * 🔴 Esta tabla **solo lee**. La palanca de suspender es la del proyecto y vive
 * en `/admin/projects`; apagar una organización entera dejaría a varios equipos
 * sin escribir de un clic y sin ninguna pantalla que se lo explique. Cuando haga
 * falta, primero se diseña qué se les dice. Ver la cabecera de la página.
 *
 * ## Tampoco enlaza al portal de la organización
 *
 * Por lo mismo que la tabla de proyectos no enlaza al proyecto: el rol global
 * **no concede pertenencia**, así que el portal respondería «no perteneces a esa
 * organización» a quien administra la plataforma. Un enlace que da un error no
 * es un enlace, es una trampa.
 *
 * ## Los asientos van juntos y en una fracción
 *
 * `2 / 15` dice de un vistazo lo que dos columnas separadas obligaban a restar
 * mentalmente, que es la pregunta con la que se abre esta pantalla: cuánto se
 * está pagando de más.
 */
export function OrganizationsTable({ organizaciones }: OrganizationsTableProps) {
  const columnas = useMemo<DataColumn<AdminOrganization>[]>(
    () => [
      {
        key: 'organizacion',
        header: 'Organización',
        track: { fr: 2.5 },
        mobileLabel: false,
        cell: (organizacion) => (
          <div className="min-w-0">
            <p className="truncate font-sans text-sm font-semibold text-text-primary">
              {organizacion.name ?? 'Sin nombre'}
            </p>
            <p className="truncate font-sans text-xs text-text-secondary">
              {organizacion.owner?.name ?? organizacion.owner?.email ?? 'Dueño no disponible'}
            </p>
          </div>
        ),
      },
      {
        key: 'clase',
        header: 'Clase',
        track: { fr: 1 },
        cell: (organizacion) => (
          /* «Espacio personal» y no «PERSONAL»: es el sitio de quien trabaja
             solo, y aquí hay que poder distinguir de un vistazo las que son un
             equipo de verdad de las que crea el registro. */
          <Badge variant={organizacion.kind === 'PERSONAL' ? 'warning' : 'success'}>
            {organizacion.kind === 'PERSONAL' ? 'Espacio personal' : 'Equipo'}
          </Badge>
        ),
      },
      {
        key: 'plan',
        header: 'Plan',
        track: { fr: 0.9 },
        cell: (organizacion) => (
          <p className="truncate font-sans text-xs uppercase tracking-wider text-text-secondary">
            {organizacion.tier === 'FREE' ? 'Gratis' : organizacion.tier}
          </p>
        ),
      },
      {
        key: 'asientos',
        header: 'Asientos',
        track: { fr: 0.9 },
        cell: (organizacion) => (
          <p className="truncate font-sans text-xs tabular-nums text-text-secondary">
            <span className="font-semibold text-text-primary">{organizacion.seatsUsed}</span> /{' '}
            {organizacion.seats}
          </p>
        ),
      },
      {
        key: 'alta',
        header: 'Se creó',
        track: { fr: 1.1 },
        cell: (organizacion) => (
          <p className="truncate font-sans text-xs text-text-secondary">
            {fechaYHora(organizacion.createdAt)}
          </p>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columnas}
      rows={organizaciones}
      rowKey={(organizacion) => organizacion.id}
      ariaLabel="Organizaciones de la plataforma"
    />
  );
}
