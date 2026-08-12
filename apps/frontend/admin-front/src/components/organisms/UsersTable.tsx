'use client';

import { ESTADOS, ROLES, fechaYHora, nombreDe } from '@/lib/admin';
import { type AdminUser, Avatar, Badge, Button, globalRoleLevelOf } from '@praxis/commons';
import { useState } from 'react';
import { UserPlanDialog } from './UserPlanDialog';
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
 * apagado en el `title` en vez de esperar al error.
 *
 * ⚠️ Esto es cortesía, no autorización: el gateway es quien manda. Si esta
 * comparación tuviera un fallo, el resultado sería un botón que da error, no un
 * cambio que no debería poder hacerse.
 *
 * ## Una tabla que en móvil no es una tabla
 *
 * En pantallas estrechas las columnas se apilan en tarjetas. Una tabla de seis
 * columnas con scroll horizontal en un móvil se lee fatal, y este panel es justo
 * el que se abre desde el teléfono cuando alguien avisa de un problema.
 */
export function UsersTable({ usuarios, miId, misRoles }: UsersTableProps) {
  const [estadoDe, setEstadoDe] = useState<AdminUser | null>(null);
  const [rolDe, setRolDe] = useState<AdminUser | null>(null);
  const [planDe, setPlanDe] = useState<AdminUser | null>(null);

  const miNivel = globalRoleLevelOf(misRoles);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border">
        {/* Cabecera: solo en escritorio, donde de verdad hay columnas. */}
        <div className="hidden border-b border-border bg-surface px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-text-secondary md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_0.8fr_1fr_auto] md:gap-4">
          <span>Cuenta</span>
          <span>Estado</span>
          <span>Rol global</span>
          <span>Plan IA</span>
          <span>Se registró</span>
          <span className="text-right">Acciones</span>
        </div>

        <ul>
          {usuarios.map((usuario) => {
            const esMiCuenta = usuario.id === miId;
            const suNivel = globalRoleLevelOf(
              usuario.globalRoles.length > 0 ? usuario.globalRoles : [usuario.globalRole],
            );
            const puedoTocarla = !esMiCuenta && miNivel > suNivel;

            const motivoBloqueo = esMiCuenta
              ? 'No puedes administrar tu propia cuenta desde el panel.'
              : 'Solo puedes administrar cuentas de nivel inferior al tuyo.';

            const estado = ESTADOS[usuario.status];

            return (
              <li
                key={usuario.id}
                className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_0.8fr_1fr_auto] md:items-center md:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar label={nombreDe(usuario)} mine={esMiCuenta} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-semibold text-text-primary">
                      {nombreDe(usuario)}
                      {esMiCuenta && (
                        <span className="ml-2 font-normal text-text-secondary">(tú)</span>
                      )}
                    </p>
                    <p className="truncate font-sans text-xs text-text-secondary">
                      {usuario.credential.email}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="mr-2 font-sans text-xs text-text-disabled md:hidden">
                    Estado
                  </span>
                  <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                </div>

                <div>
                  <span className="mr-2 font-sans text-xs text-text-disabled md:hidden">Rol</span>
                  <Badge variant={usuario.globalRole === 'User' ? 'primary' : 'accent'}>
                    {ROLES[usuario.globalRole].etiqueta}
                  </Badge>
                </div>

                <div>
                  <span className="mr-2 font-sans text-xs text-text-disabled md:hidden">
                    Plan IA
                  </span>
                  {/* El plan no es un rol y no se pinta como tal: PRO destaca
                      porque es lo que se concede a mano; FREE es el valor por
                      defecto de casi todas las cuentas y no necesita color. */}
                  <Badge variant={usuario.assistantPlan === 'PRO' ? 'success' : 'default'}>
                    {usuario.assistantPlan}
                  </Badge>
                </div>

                <p className="font-sans text-xs text-text-secondary">
                  {fechaYHora(usuario.createdAt)}
                </p>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    size="sm"
                    variant={usuario.status === 'ACTIVE' ? 'danger' : 'secondary'}
                    disabled={!puedoTocarla}
                    title={puedoTocarla ? undefined : motivoBloqueo}
                    onClick={() => setEstadoDe(usuario)}
                  >
                    {usuario.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!puedoTocarla}
                    title={puedoTocarla ? undefined : motivoBloqueo}
                    onClick={() => setRolDe(usuario)}
                  >
                    Cambiar rol
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!puedoTocarla}
                    title={puedoTocarla ? undefined : motivoBloqueo}
                    onClick={() => setPlanDe(usuario)}
                  >
                    Plan IA
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {estadoDe && <UserStatusDialog usuario={estadoDe} open onClose={() => setEstadoDe(null)} />}

      {planDe && <UserPlanDialog usuario={planDe} open onClose={() => setPlanDe(null)} />}

      {rolDe && (
        <UserRoleDialog usuario={rolDe} miNivel={miNivel} open onClose={() => setRolDe(null)} />
      )}
    </>
  );
}
