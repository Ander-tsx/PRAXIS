'use client';

import { setUserRoleAction } from '@/app/(privado)/admin/actions';
import { ADMIN_USER_INITIAL_STATE } from '@/lib/admin/action-state';
import { ROLES, nombreDe } from '@/lib/admin/admin';
import {
  type AdminUser,
  Button,
  Dialog,
  GLOBAL_ROLES,
  type GlobalRoleName,
  Select,
  Textarea,
  globalRoleLevelOf,
  useAccion,
} from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface UserRoleDialogProps {
  usuario: AdminUser;
  /** Nivel de quien administra: solo puede repartir roles por debajo del suyo. */
  miNivel: number;
  open: boolean;
  onClose: () => void;
}

/**
 * Cambiar el rol global de una cuenta.
 *
 * ## El desplegable solo ofrece lo que se puede conceder
 *
 * Un `Admin` solo ve `User`; un `SuperAdmin` ve `Admin` y `User`. **`SuperAdmin`
 * no aparece para nadie**, porque nadie puede concederlo: el primero lo crea el
 * seed, y por encima de ese nivel no hay nada desde donde repartirlo. Ofrecerlo
 * para que el gateway lo rechace sería prometer una operación que no existe.
 *
 * ## Se explica qué significa cada rol
 *
 * Debajo del desplegable, en una frase. «Admin» y «SuperAdmin» no se distinguen
 * por el nombre, y la diferencia —que uno puede tocar a los administradores y el
 * otro no— es justo la que hay que entender antes de pulsar.
 */
export function UserRoleDialog({ usuario, miNivel, open, onClose }: UserRoleDialogProps) {
  const [state, formAction, pending] = useAccion(setUserRoleAction, ADMIN_USER_INITIAL_STATE);

  /* Solo los estrictamente por debajo de mi nivel: la misma regla que aplica el
     gateway con `canGrantGlobalRole`. */
  const repartibles = (Object.values(GLOBAL_ROLES) as GlobalRoleName[]).filter(
    (rol) => globalRoleLevelOf([rol]) < miNivel,
  );

  const [elegido, setElegido] = useState<GlobalRoleName>(
    repartibles.includes(usuario.globalRole) ? usuario.globalRole : (repartibles[0] ?? 'User'),
  );

  useEffect(() => {
    if (state.done) onClose();
  }, [state, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Cambiar el rol global"
      overflowVisible
      description={
        <>
          El rol de <strong className="text-text-primary">{nombreDe(usuario)}</strong> en la
          plataforma. No afecta a lo que puede hacer dentro de sus proyectos, que se decide con los
          roles de cada proyecto.
        </>
      }
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="userId" value={usuario.id} />

        <Select
          name="role"
          label="Rol global"
          value={elegido}
          onValueChange={(valor) => setElegido(valor as GlobalRoleName)}
          options={repartibles.map((rol) => ({ value: rol, label: ROLES[rol].etiqueta }))}
          fullWidth
          variant={state.error ? 'error' : 'default'}
          message={state.error ?? ROLES[elegido]?.descripcion}
        />

        <Textarea
          name="reason"
          label="Motivo"
          optional
          placeholder="Por qué cambia. Queda en el registro."
          rows={2}
          maxLength={500}
          fullWidth
        />

        <footer className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={pending} disabled={elegido === usuario.globalRole}>
            Guardar
          </Button>
        </footer>
      </form>

      <p className="mt-3 font-sans text-xs text-white">
        Rol actual: {ROLES[usuario.globalRole].etiqueta}.
        {repartibles.length === 0 && ' No puedes asignar ningún rol a esta cuenta desde tu nivel.'}
      </p>
    </Dialog>
  );
}
