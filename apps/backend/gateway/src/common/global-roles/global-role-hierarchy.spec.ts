/// <reference types="jest" />

import {
  GLOBAL_ROLES,
  canGrantGlobalRole,
  globalRoleLevel,
  isGlobalRole,
  outranks,
  satisfiesGlobalRole,
} from '@praxis/contracts';

/**
 * Las reglas de la capa 1 de permisos, en prueba.
 *
 * Viven en `@praxis/contracts` y se prueban desde aquí, que es donde se aplican:
 * contracts no tiene jest configurado y montarle uno para cinco funciones puras
 * sería más infraestructura que prueba.
 *
 * No es una prueba de cobertura. Cada bloque es una regla de seguridad que se
 * decidió a propósito y cuyo incumplimiento tiene una consecuencia concreta
 * escrita al lado. Si alguien añade un rol y esto se pone rojo, el mensaje dice
 * qué se rompió.
 */
describe('jerarquía de roles globales', () => {
  const { SUPER_ADMIN, ADMIN, USER } = GLOBAL_ROLES;

  describe('globalRoleLevel', () => {
    it('sin roles equivale a User: es el caso de una cuenta recién registrada', () => {
      /* `POST /auth/register` no asigna ningún rol, así que la mayoría de las
         cuentas reales no tienen ni una fila en UserRole. Si esto fuera un nivel
         inexistente, `outranks` fallaría justo en el caso más común. */
      expect(globalRoleLevel([])).toBe(globalRoleLevel([USER]));
    });

    it('toma el nivel más alto cuando hay varios roles', () => {
      expect(globalRoleLevel([USER, ADMIN])).toBe(globalRoleLevel([ADMIN]));
      expect(globalRoleLevel([USER, ADMIN, SUPER_ADMIN])).toBe(globalRoleLevel([SUPER_ADMIN]));
    });

    it('ignora los nombres desconocidos', () => {
      /* `permissions.roles` es una tabla abierta. Si un nombre inventado subiera
         el nivel, un INSERT sería una escalada de privilegios. */
      expect(globalRoleLevel(['Root', 'Owner', 'admin'])).toBe(globalRoleLevel([]));
      expect(globalRoleLevel([ADMIN, 'Root'])).toBe(globalRoleLevel([ADMIN]));
    });

    it('distingue mayúsculas: "admin" no es "Admin"', () => {
      expect(isGlobalRole('admin')).toBe(false);
      expect(isGlobalRole(ADMIN)).toBe(true);
    });
  });

  describe('satisfiesGlobalRole — ¿puedo entrar?', () => {
    it('un SuperAdmin satisface Admin', () => {
      /* La razón de existir de todo esto: con la comparación por nombre exacto
         que había, el rol más alto fallaba todos los @RequireGlobalRole('Admin')
         que ya existían. */
      expect(satisfiesGlobalRole([SUPER_ADMIN], ADMIN)).toBe(true);
    });

    it('un Admin no satisface SuperAdmin', () => {
      expect(satisfiesGlobalRole([ADMIN], SUPER_ADMIN)).toBe(false);
    });

    it('una cuenta sin roles no satisface Admin', () => {
      expect(satisfiesGlobalRole([], ADMIN)).toBe(false);
    });
  });

  describe('outranks — ¿puedo actuar sobre esta cuenta?', () => {
    it('un Admin no puede actuar sobre otro Admin', () => {
      /* Es la diferencia con satisfiesGlobalRole, y por eso son dos funciones:
         un Admin *satisface* Admin, así que con la primera pregunta podría
         suspender a un igual. */
      expect(outranks([ADMIN], [ADMIN])).toBe(false);
    });

    it('un Admin no puede actuar sobre un SuperAdmin', () => {
      /* La vía para descabezar el sistema: suspender no quita el rol, pero
         impide entrar, y sin SuperAdmins nadie puede volver a nombrar
         administradores. */
      expect(outranks([ADMIN], [SUPER_ADMIN])).toBe(false);
    });

    it('un Admin puede actuar sobre un User y sobre una cuenta sin roles', () => {
      expect(outranks([ADMIN], [USER])).toBe(true);
      expect(outranks([ADMIN], [])).toBe(true);
    });

    it('un SuperAdmin puede actuar sobre Admin y User, pero no sobre otro SuperAdmin', () => {
      expect(outranks([SUPER_ADMIN], [ADMIN])).toBe(true);
      expect(outranks([SUPER_ADMIN], [USER])).toBe(true);
      expect(outranks([SUPER_ADMIN], [SUPER_ADMIN])).toBe(false);
    });

    it('nadie se supera a sí mismo, sea cual sea su nivel', () => {
      for (const role of Object.values(GLOBAL_ROLES)) {
        expect(outranks([role], [role])).toBe(false);
      }
      expect(outranks([], [])).toBe(false);
    });
  });

  describe('canGrantGlobalRole — ¿puedo repartir este rol?', () => {
    it('nadie concede SuperAdmin, ni un SuperAdmin', () => {
      /* El primero lo crea el seed. Es lo que impide que crear el rol abriera un
         agujero: `POST /permissions/assign` exige Admin, luego cualquier
         administrador podría haberse concedido el nivel de encima. */
      expect(canGrantGlobalRole([SUPER_ADMIN], SUPER_ADMIN)).toBe(false);
      expect(canGrantGlobalRole([ADMIN], SUPER_ADMIN)).toBe(false);
    });

    it('solo un SuperAdmin concede Admin', () => {
      expect(canGrantGlobalRole([SUPER_ADMIN], ADMIN)).toBe(true);
      expect(canGrantGlobalRole([ADMIN], ADMIN)).toBe(false);
    });

    it('un Admin concede User', () => {
      expect(canGrantGlobalRole([ADMIN], USER)).toBe(true);
    });

    it('quien no administra no concede nada', () => {
      for (const role of Object.values(GLOBAL_ROLES)) {
        expect(canGrantGlobalRole([], role)).toBe(false);
        expect(canGrantGlobalRole([USER], role)).toBe(false);
      }
    });
  });
});
