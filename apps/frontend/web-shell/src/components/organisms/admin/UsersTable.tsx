'use client';

import { deleteUserAction } from '@/app/admin/actions';
import { RowActions } from '@/components/molecules/RowActions';
import { ESTADOS, ROLES, fechaYHora, nombreDe } from '@/lib/admin/admin';
import {
  type AdminUser,
  Avatar,
  Badge,
  type DataColumn,
  DataTable,
  avatarHref,
  globalRoleLevelOf,
} from '@praxis/commons';
import { useMemo, useState } from 'react';
import { HardDeleteDialog } from './HardDeleteDialog';
import { UserRoleDialog } from './UserRoleDialog';
import { UserStatusDialog } from './UserStatusDialog';

export interface UsersTableProps {
  usuarios: AdminUser[];
  /** Quién está mirando, para apagar las acciones de su propia fila. */
  miId: string;
  /** Sus roles globales, para apagar las filas que no puede tocar. */
  misRoles: string[];
}

/**
 * Las cuentas, con lo que se puede hacer sobre cada una.
 *
 * ## Las acciones se apagan antes de fallar
 *
 * Cada fila decide si se puede tocar comparando **niveles**, la misma regla que
 * aplica el gateway: nada sobre tu propia cuenta, nada sobre una de nivel igual o
 * superior. El backend lo rechaza igual —con su mensaje— pero un botón que existe
 * para dar un 403 es un botón que sobra, y aquí se puede decir *por qué* está
 * apagado en vez de esperar al error.
 *
 * ⚠️ Esto es cortesía, no autorización: el gateway es quien manda. Si esta
 * comparación tuviera un fallo, el resultado sería un botón que da error, no un
 * cambio que no debería poder hacerse.
 *
 * ⚠️ **Y el motivo ya no vive en un `title`.** Vive dentro del menú, escrito
 * debajo de la opción apagada: un `title` obliga a dejar el ratón quieto sobre un
 * botón deshabilitado para enterarte de por qué lo está, y en una pantalla táctil
 * no aparece nunca. Ver `RowActions`.
 *
 * ## Una tabla que en móvil no es una tabla
 *
 * En pantallas estrechas las columnas se apilan en tarjetas. Una tabla de seis
 * columnas con scroll horizontal en un móvil se lee fatal, y este panel es justo
 * el que se abre desde el teléfono cuando alguien avisa de un problema. Lo
 * resuelve `DataTable`, que además es lo que impide que la cabecera y las filas
 * vuelvan a desalinearse.
 */
export function UsersTable({ usuarios, miId, misRoles }: UsersTableProps) {
  const [estadoDe, setEstadoDe] = useState<AdminUser | null>(null);
  const [rolDe, setRolDe] = useState<AdminUser | null>(null);
  const [borrarA, setBorrarA] = useState<AdminUser | null>(null);

  const miNivel = globalRoleLevelOf(misRoles);

  /**
   * Las columnas, memorizadas.
   *
   * Dependen de tres cosas que casi nunca cambian, y sin `useMemo` el array se
   * reconstruía en cada render junto con las nueve funciones `cell` que lleva
   * dentro. No es un problema de rendimiento medible con veinticinco filas; es
   * que la plantilla de la rejilla se recalcula con él, y que esto sea estable
   * hace evidente que **las columnas se declaran una sola vez**, que es la
   * invariante entera de esta tabla.
   */
  const columnas = useMemo<DataColumn<AdminUser>[]>(
    () => [
      {
        key: 'cuenta',
        header: 'Cuenta',
        track: { fr: 2.4 },
        mobileLabel: false,
        cell: (usuario) => {
          const esMiCuenta = usuario.id === miId;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <AvatarConPresencia usuario={usuario} esMiCuenta={esMiCuenta} />
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate font-sans text-sm font-semibold text-text-primary">
                  {esMiCuenta ? (
                    nombreDe(usuario)
                  ) : (
                    /* Cruza a la zona de chat → `<a>` duro. Ver §16. */
                    <a
                      href={`/chat/${usuario.id}`}
                      className="transition-colors hover:text-primary hover:underline"
                      title={`Escribir a ${nombreDe(usuario)}`}
                    >
                      {nombreDe(usuario)}
                    </a>
                  )}
                  {esMiCuenta && <span className="font-normal text-white">(tú)</span>}
                </p>
                <p className="truncate font-sans text-xs text-white">{usuario.credential.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        key: 'estado',
        header: 'Estado',
        track: { fr: 1 },
        cell: (usuario) => {
          const estado = ESTADOS[usuario.status];
          return <Badge variant={estado.variante}>{estado.etiqueta}</Badge>;
        },
      },
      {
        key: 'rol',
        header: 'Rol global',
        mobileLabel: 'Rol',
        track: { fr: 1 },
        cell: (usuario) => (
          <Badge variant={usuario.globalRole === 'User' ? 'primary' : 'accent'}>
            {ROLES[usuario.globalRole].etiqueta}
          </Badge>
        ),
      },
      /* 🕳️ Aquí iba la columna «Plan IA», del catálogo de planes **por
         persona** que se retiró el 2026-09-03. El plan de alguien es hoy el de
         su organización, que no es un dato de la cuenta: la misma persona puede
         estar en una gratuita y en una de pago a la vez, así que una sola
         columna aquí no podría decir la verdad. Vive en el portal de cada
         organización. */
      {
        key: 'alta',
        header: 'Se registró',
        track: { fr: 1.1 },
        cell: (usuario) => (
          <p className="truncate font-sans text-xs text-white">{fechaYHora(usuario.createdAt)}</p>
        ),
      },
      {
        key: 'acciones',
        header: 'Acciones',
        /* Fija: es un botón de icono y siempre mide lo mismo. Era la pista
           `auto` que descuadraba la tabla entera. */
        track: { rem: 6 },
        align: 'end',
        mobileLabel: false,
        cell: (usuario) => {
          const esMiCuenta = usuario.id === miId;
          const suNivel = globalRoleLevelOf(
            usuario.globalRoles.length > 0 ? usuario.globalRoles : [usuario.globalRole],
          );
          const puedoTocarla = !esMiCuenta && miNivel > suNivel;

          const motivo = esMiCuenta
            ? 'No puedes administrar tu propia cuenta desde el panel.'
            : 'Solo puedes administrar cuentas de nivel inferior al tuyo.';
          const bloqueo = puedoTocarla ? undefined : motivo;

          return (
            <RowActions
              label={nombreDe(usuario)}
              actions={[
                {
                  id: 'estado',
                  label: usuario.status === 'ACTIVE' ? 'Suspender cuenta' : 'Reactivar cuenta',
                  tone: usuario.status === 'ACTIVE' ? 'danger' : 'default',
                  disabledReason: bloqueo,
                  onSelect: () => setEstadoDe(usuario),
                },
                {
                  id: 'rol',
                  label: 'Cambiar rol global',
                  disabledReason: bloqueo,
                  onSelect: () => setRolDe(usuario),
                },
                {
                  id: 'borrar',
                  label: 'Borrar cuenta',
                  tone: 'danger',
                  disabledReason: bloqueo,
                  onSelect: () => setBorrarA(usuario),
                },
              ]}
            />
          );
        },
      },
    ],
    [miId, miNivel],
  );

  return (
    <>
      <DataTable
        columns={columnas}
        rows={usuarios}
        rowKey={(usuario) => usuario.id}
        ariaLabel="Cuentas de la plataforma"
      />

      {estadoDe && <UserStatusDialog usuario={estadoDe} open onClose={() => setEstadoDe(null)} />}

      {borrarA && (
        <HardDeleteDialog
          open
          onClose={() => setBorrarA(null)}
          queCosa="esta cuenta"
          nombre={nombreDe(borrarA)}
          campos={{ userId: borrarA.id, userLabel: nombreDe(borrarA) }}
          accion={deleteUserAction}
          arrastra={['La cuenta y sus credenciales', 'Sus sesiones abiertas, web y de voz']}
          /* Lo que se queda es la mitad del mensaje: sin esto, quien administra
             cree que borrar una cuenta vacía los tableros donde esa persona
             trabajó — y no borra nunca. */
          conserva={[
            'Sus tareas, comentarios y mensajes, que se leerán como «Usuario eliminado»',
            'El registro de actividad de administración',
          ]}
        />
      )}

      {rolDe && (
        <UserRoleDialog usuario={rolDe} miNivel={miNivel} open onClose={() => setRolDe(null)} />
      )}
    </>
  );
}

/**
 * El avatar de una fila, con el punto de estado **al día**.
 *
 * ## 🔴 Por qué esto es un componente y no cuatro líneas dentro de la celda
 *
 * Porque la presencia se leía de `usuario.presence` a secas, que es lo que trajo
 * el servidor **al cargar la página**: un valor congelado. En el resto de la
 * aplicación los avatares pasan por `usePresence`, que pisa esa foto con los
 * eventos del flujo en vivo; aquí no, así que el panel de administración era el
 * único sitio donde alguien seguía «Disponible» media hora después de cerrar, y
 * donde quien acababa de entrar salía gris. Es justo la pantalla donde ese dato
 * se mira para decidir algo.
 *
 * `usePresence` es un hook, y `cell` es una función que devuelve JSX dentro de un
 * `useMemo` — no un componente—, así que llamarlo ahí rompe las reglas de los
 * hooks: el número de llamadas cambiaría con el número de filas. De ahí este
 * envoltorio, que sí es un componente y se monta una vez por fila.
 */
function AvatarConPresencia({ usuario, esMiCuenta }: { usuario: AdminUser; esMiCuenta: boolean }) {
  /**
   * ⚠️ **Aquí no se usa `usePresence`.**
   *
   * El flujo en tiempo real (LiveSource) solo envía actualizaciones de presencia
   * para los contactos mutuos (gente con la que compartes proyectos).
   * En el panel de administración se lista a todo el mundo, así que la mayoría
   * de las cuentas nunca recibirían eventos de presencia y siempre saldrían
   * grises, pareciendo desconectadas aunque estuvieran dentro de la app.
   *
   * Es mejor no pintar la esfera que pintar una que miente.
   */
  return (
    <Avatar
      label={nombreDe(usuario)}
      mine={esMiCuenta}
      size="md"
      src={avatarHref(usuario.avatarUrl, '/api/gateway')}
      presence={undefined}
    />
  );
}
