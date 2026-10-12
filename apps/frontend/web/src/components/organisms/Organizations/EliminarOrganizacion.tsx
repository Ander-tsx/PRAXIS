'use client';

import { eliminarOrganizacionAction } from '@/app/(privado)/main/team/actions';
import type { OrganizacionState } from '@/lib/main/action-state';
import { Button } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { HardDeleteDialog } from '../admin/HardDeleteDialog';

/**
 * La zona de peligro de una organización: eliminarla.
 *
 * Solo la ve su dueño y solo en una organización de empresa (el espacio personal no se elimina).
 * El servidor decide de verdad —dueño, no personal, sin proyectos, sin suscripción de pago viva— y
 * esta pantalla enseña su motivo cuando se niega; aquí se **dice antes** lo que hace falta, para
 * que no haya que descubrirlo con un error.
 */
export function EliminarOrganizacion({
  organizationId,
  nombre,
}: {
  organizationId: string;
  nombre: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const eliminada = useRef(false);

  /* Envuelve la acción solo para saber que salió bien: el diálogo se cierra por «hecho» y por
     «cancelar» con la misma función, y solo en el primer caso hay que salir de aquí. */
  async function accion(estado: OrganizacionState, datos: FormData): Promise<OrganizacionState> {
    const resultado = await eliminarOrganizacionAction(estado, datos);
    if (resultado.done) eliminada.current = true;
    return resultado;
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-xl border border-error/30 bg-error/5 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-sans text-[15px] font-semibold text-text-primary">
          Eliminar la organización
        </h3>
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          Se elimina <strong className="font-semibold text-text-primary">{nombre}</strong> con sus
          miembros, sus roles y su configuración. No se deshace. Antes hay que{' '}
          <strong className="font-semibold text-text-primary">eliminar sus proyectos</strong> y, si
          tiene un plan de pago,{' '}
          <strong className="font-semibold text-text-primary">cancelarlo</strong> en Facturación:
          borrar la organización no deja de cobrarlo.
        </p>
      </div>
      <div>
        <Button type="button" variant="danger" onClick={() => setAbierto(true)}>
          Eliminar organización
        </Button>
      </div>

      <HardDeleteDialog
        open={abierto}
        onClose={() => {
          setAbierto(false);
          if (eliminada.current) router.replace('/main');
        }}
        queCosa="la organización"
        nombre={nombre}
        campos={{ organizationId }}
        accion={accion}
        arrastra={[
          'La organización y su configuración (nombre, icono, imagen).',
          'Todos sus miembros y sus invitaciones pendientes: dejan de pertenecer a ella.',
          'Sus roles y plantillas de rol.',
        ]}
        conserva={[
          'El historial de pagos, por contabilidad.',
          'Las cuentas de quienes eran miembros, con su espacio personal.',
        ]}
      />
    </section>
  );
}
