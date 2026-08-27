import {
  ORGANIZATION_PERMISSIONS,
  OrganizationPermission,
  cabenEn,
  normalizarPermisosOrg,
  permisosDeAdministracion,
  permisosDeDueno,
  permisosDeMiembro,
  permisosOrgVacios,
} from './organization.dto';

/**
 * Los papeles de una organización.
 *
 * Lo que se prueba aquí no es la forma de un diccionario: es **la regla que
 * impide escalar privilegios**. Sin ella, quien puede repartir papeles se
 * fabrica uno con la facturación dentro y se lo pone. Es el único fallo de esta
 * capa que no se nota hasta que alguien lo usa.
 */
describe('los permisos de una organización', () => {
  describe('normalizar', () => {
    it('una clave que falta se lee como false, no como undefined', () => {
      /* Comparar `undefined` con `=== true` da `false` igualmente, así que el
         guard funcionaría. Lo que se rompe es la pantalla: un `Select` sin valor
         y una fila en un estado que no es ni sí ni no. */
      const permisos = normalizarPermisosOrg({ canCreateProject: true });

      expect(permisos[OrganizationPermission.CAN_CREATE_PROJECT]).toBe(true);
      expect(permisos[OrganizationPermission.CAN_MANAGE_BILLING]).toBe(false);
      expect(Object.keys(permisos).sort()).toEqual([...ORGANIZATION_PERMISSIONS].sort());
    });

    it('una clave que ya no existe en el vocabulario se descarta', () => {
      /* Un permiso retirado no puede seguir concediendo nada desde una fila
         vieja: la fila sobrevive al despliegue que lo quita. */
      const permisos = normalizarPermisosOrg({ canManageBilling: true, canHacerloTodo: true });

      expect(permisos[OrganizationPermission.CAN_MANAGE_BILLING]).toBe(true);
      expect('canHacerloTodo' in permisos).toBe(false);
    });

    it('entiende el formato viejo de array en vez de tragárselo', () => {
      /* No debería llegar nunca —el validador está desde el primer día— pero en
         los roles de proyecto sí pasó, y ahí se guardaron como lista. Leerlo
         como «ningún permiso» sería peor que entenderlo: alguien se quedaría sin
         poder hacer nada y nada lo diría. */
      const permisos = normalizarPermisosOrg(['canCreateProject', 'canInviteMembers']);

      expect(permisos[OrganizationPermission.CAN_CREATE_PROJECT]).toBe(true);
      expect(permisos[OrganizationPermission.CAN_INVITE_MEMBERS]).toBe(true);
      expect(permisos[OrganizationPermission.CAN_MANAGE_BILLING]).toBe(false);
    });

    it('un valor que no es `true` no concede nada', () => {
      /* `'true'`, `1` y `{}` son todos ciertos en JavaScript. Si valieran,
         cualquier cuerpo mal formado concedería permisos. */
      const permisos = normalizarPermisosOrg({
        canManageBilling: 'true',
        canManageMembers: 1,
        canCreateProject: {},
      });

      expect(permisos[OrganizationPermission.CAN_MANAGE_BILLING]).toBe(false);
      expect(permisos[OrganizationPermission.CAN_MANAGE_MEMBERS]).toBe(false);
      expect(permisos[OrganizationPermission.CAN_CREATE_PROJECT]).toBe(false);
    });

    it('null y undefined dan un diccionario vacío, no una excepción', () => {
      expect(normalizarPermisosOrg(null)).toEqual(permisosOrgVacios());
      expect(normalizarPermisosOrg(undefined)).toEqual(permisosOrgVacios());
    });
  });

  describe('repartir permisos no puede crear permisos', () => {
    it('🔴 no se puede dar un permiso que no se tiene', () => {
      /* El caso real: quien tiene `canManageMembers` se crea un papel con
         `canManageBilling`, se lo asigna, y ya está tocando la tarjeta de la
         empresa. */
      const quienReparte = {
        ...permisosOrgVacios(),
        [OrganizationPermission.CAN_MANAGE_MEMBERS]: true,
      };
      const papelQueIntentaCrear = {
        ...permisosOrgVacios(),
        [OrganizationPermission.CAN_MANAGE_BILLING]: true,
      };

      expect(cabenEn(papelQueIntentaCrear, quienReparte)).toBe(false);
    });

    it('sí se puede dar lo que sí se tiene', () => {
      const quienReparte = permisosDeAdministracion();
      const papel = {
        ...permisosOrgVacios(),
        [OrganizationPermission.CAN_CREATE_PROJECT]: true,
        [OrganizationPermission.CAN_INVITE_MEMBERS]: true,
      };

      expect(cabenEn(papel, quienReparte)).toBe(true);
    });

    it('el dueño lo pasa siempre, y no como excepción escrita aparte', () => {
      /* Los tiene todos, así que la regla general le sirve. Una rama `if
         (esDueno) return true` sería un segundo camino que mantener. */
      const todos = Object.fromEntries(ORGANIZATION_PERMISSIONS.map((clave) => [clave, true]));

      expect(cabenEn(todos as never, permisosDeDueno())).toBe(true);
    });

    it('un papel vacío cabe en cualquiera', () => {
      expect(cabenEn(permisosOrgVacios(), permisosOrgVacios())).toBe(true);
    });
  });

  describe('los papeles de arranque', () => {
    it('«Administración» NO puede tocar la facturación', () => {
      /* Es la decisión que más se nota: quien lleva el equipo no toca la tarjeta
         de la empresa salvo que el dueño se lo dé a propósito. Si esto se
         invierte por accidente, nadie lo ve hasta que llega un recibo. */
      const admin = permisosDeAdministracion();

      expect(admin[OrganizationPermission.CAN_MANAGE_BILLING]).toBe(false);
      expect(admin[OrganizationPermission.CAN_MANAGE_MEMBERS]).toBe(true);
      expect(admin[OrganizationPermission.CAN_VIEW_AUDIT_LOG]).toBe(true);
    });

    it('«Miembro» solo puede crear proyectos', () => {
      /* Lo justo para que entrar sirva de algo el primer día sin que nadie tenga
         que configurar nada. */
      const miembro = permisosDeMiembro();
      const concedidos = ORGANIZATION_PERMISSIONS.filter((clave) => miembro[clave]);

      expect(concedidos).toEqual([OrganizationPermission.CAN_CREATE_PROJECT]);
    });

    it('los dos papeles de arranque caben en el dueño', () => {
      /* Si alguno no cupiera, la organización nacería con un papel que su propio
         dueño no podría haber creado. */
      expect(cabenEn(permisosDeAdministracion(), permisosDeDueno())).toBe(true);
      expect(cabenEn(permisosDeMiembro(), permisosDeDueno())).toBe(true);
    });

    it('«Administración» no basta para crear un papel que administre el cobro', () => {
      /* La consecuencia de las dos de arriba juntas, dicha explícitamente porque
         es la que sostiene el modelo entero. */
      const papelConCobro = {
        ...permisosOrgVacios(),
        [OrganizationPermission.CAN_MANAGE_BILLING]: true,
      };

      expect(cabenEn(papelConCobro, permisosDeAdministracion())).toBe(false);
      expect(cabenEn(papelConCobro, permisosDeDueno())).toBe(true);
    });
  });
});
