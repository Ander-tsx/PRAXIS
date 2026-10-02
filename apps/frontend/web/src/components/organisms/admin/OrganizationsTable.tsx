'use client';

import { type AdminOrganization, fechaYHora } from '@/lib/admin/admin';
import { Badge, type DataColumn, DataTable } from '@praxis/commons';
import { useMemo } from 'react';
import { PlanGrantControl } from './PlanGrantControl';

export interface OrganizationsTableProps {
  organizaciones: AdminOrganization[];
}

/**
 * Las organizaciones de la instalación, con su plan y sus asientos.
 *
 * ## Una sola acción: conceder o retirar un plan sin cobrar
 *
 * Para las organizaciones del propio equipo (`PlanGrantControl`). Nada más:
 * la palanca de suspender es la del proyecto y vive
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
const NOMBRE_DEL_PLAN: Record<string, string> = {
  FREE: 'Gratis',
  PRO: 'Pro',
  TEAM: 'Equipo',
  BUSINESS: 'Negocio',
  ENTERPRISE: 'Empresa',
};

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
            <p className="truncate font-sans text-xs text-white">
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
          <div className="min-w-0">
            <p className="truncate font-sans text-xs uppercase tracking-wider text-text-primary">
              {NOMBRE_DEL_PLAN[organizacion.tier] ?? organizacion.tier}
            </p>
            {organizacion.granted && (
              <p className="truncate font-sans text-xs text-text-secondary">concedido</p>
            )}
          </div>
        ),
      },
      {
        key: 'asientos',
        header: 'Asientos',
        track: { fr: 0.9 },
        cell: (organizacion) => (
          <p className="truncate font-sans text-xs tabular-nums text-white">
            <span className="font-semibold text-text-primary">{organizacion.seatsUsed}</span> /{' '}
            {/* Un plan concedido sin tope guarda 1.000 por dentro (ver
                `SubscriptionsService.conceder`); enseñar ese número confunde. */}
            {organizacion.tier === 'ENTERPRISE' ? 'sin tope' : organizacion.seats}
          </p>
        ),
      },
      {
        key: 'alta',
        header: 'Se creó',
        track: { fr: 1.1 },
        cell: (organizacion) => (
          <p className="truncate font-sans text-xs text-white">
            {fechaYHora(organizacion.createdAt)}
          </p>
        ),
      },
      {
        key: 'acciones',
        header: 'Plan sin cobrar',
        track: { fr: 1.6 },
        cell: (organizacion) => <PlanGrantControl organizacion={organizacion} />,
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
