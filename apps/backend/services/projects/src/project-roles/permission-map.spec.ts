/// <reference types="jest" />

import {
  PERMISSION_HIERARCHY,
  VIEW_PERMISSION,
  expandPermissions,
  normalizePermissions,
} from './permission-map';

/**
 * La jerarquía de permisos de proyecto, en prueba.
 *
 * Es la pieza que decide qué puede hacer cada quien dentro de un proyecto, y la
 * que peor falla: un permiso que deja de concederse **no da error**. El rol
 * sigue existiendo, la pantalla lo sigue listando igual, y lo único que cambia es
 * que un 403 aparece más tarde y en otro sitio. Por eso se prueba con valores
 * escritos a mano y no con el mapa como oráculo de sí mismo.
 *
 * ## Lo que motivó estas pruebas
 *
 * `expandPermissions` daba **una sola pasada** sobre el mapa, así que la
 * implicación no era transitiva: funcionaba únicamente porque las entradas están
 * escritas de mayor a menor alcance y `Object.entries` respeta el orden de
 * inserción. Reordenar el objeto literal —alfabetizarlo, añadir un permiso por
 * arriba— le quitaba `canViewReports` a quien administra tableros, en silencio.
 *
 * El último bloque comprueba justo eso: la expansión no puede depender del orden.
 */
describe('jerarquía de permisos de proyecto', () => {
  describe('expandPermissions', () => {
    it('un permiso sin implicaciones solo se concede a sí mismo', () => {
      const expandido = expandPermissions({ canComment: true });

      expect(expandido.canComment).toBe(true);
      expect(expandido.canEditTask).toBeFalsy();
      expect(expandido.canDeleteTask).toBeFalsy();
    });

    it('borrar una tarea implica editarla, moverla, comentarla y crearla', () => {
      const expandido = expandPermissions({ canDeleteTask: true });

      expect(expandido.canEditTask).toBe(true);
      expect(expandido.canMoveTask).toBe(true);
      expect(expandido.canComment).toBe(true);
      expect(expandido.canCreateTask).toBe(true);
    });

    it('editar una tarea NO implica borrarla', () => {
      const expandido = expandPermissions({ canEditTask: true });

      /* La otra mitad. Una jerarquía que concede hacia arriba no es una
         jerarquía: sería conceder todo a quien tenga cualquier cosa. */
      expect(expandido.canDeleteTask).toBeFalsy();
    });

    it('cualquier permiso concede ver el proyecto', () => {
      expect(expandPermissions({ canComment: true })[VIEW_PERMISSION]).toBe(true);
      expect(expandPermissions({ canCreateColumn: true })[VIEW_PERMISSION]).toBe(true);
    });

    it('un mapa vacío no concede nada, ni siquiera ver', () => {
      const expandido = expandPermissions({});

      /* Sin esto, un rol sin ningún permiso marcado abriría el proyecto: es el
         caso de un rol recién creado al que aún no se le ha marcado nada. */
      expect(expandido[VIEW_PERMISSION]).toBeFalsy();
    });

    it('un mapa con todo en false tampoco', () => {
      const expandido = expandPermissions({ canComment: false, canEditTask: false });

      expect(expandido[VIEW_PERMISSION]).toBeFalsy();
      expect(Object.values(expandido).some(Boolean)).toBe(false);
    });
  });

  describe('la implicación es transitiva', () => {
    it('borrar un tablero llega hasta ver los reportes, saltando dos reglas', () => {
      /**
       * La cadena entera: `canDeleteBoard` → `canEditProject` → `canViewReports`.
       * Ninguna entrada del mapa concede `canViewReports` desde `canDeleteBoard`
       * directamente; hace falta que la expansión vuelva a pasar por las reglas
       * después de haber activado `canEditProject`.
       *
       * Con una sola pasada esto dependía de que `canEditProject` estuviera
       * escrito **después** de `canDeleteBoard` en el objeto literal.
       */
      const expandido = expandPermissions({ canDeleteBoard: true });

      expect(expandido.canEditProject).toBe(true);
      expect(expandido.canViewReports).toBe(true);
    });

    it('borrar el proyecto llega a todo lo de tableros y a los reportes', () => {
      const expandido = expandPermissions({ canDeleteProject: true });

      expect(expandido.canDeleteBoard).toBe(true);
      expect(expandido.canEditBoard).toBe(true);
      expect(expandido.canCreateBoard).toBe(true);
      expect(expandido.canEditProject).toBe(true);
      expect(expandido.canViewReports).toBe(true);
    });

    it('y no depende del orden en que estén escritas las reglas', () => {
      /**
       * La prueba que fija la corrección de verdad: se recorre el mapa **al
       * revés** y cada permiso tiene que expandir exactamente igual.
       *
       * Se compara contra el resultado del mapa tal cual está, así que no hace
       * falta escribir a mano la clausura de cada permiso — lo que se afirma es
       * la invariante: *el orden no puede cambiar el resultado*.
       */
      const original = { ...PERMISSION_HIERARCHY };
      const alRevés = Object.fromEntries(Object.entries(original).reverse());

      /** Reemplaza el mapa en su sitio: los consumidores lo importan por referencia. */
      const reemplazar = (mapa: Record<string, string[]>) => {
        for (const clave of Object.keys(PERMISSION_HIERARCHY)) delete PERMISSION_HIERARCHY[clave];
        Object.assign(PERMISSION_HIERARCHY, mapa);
      };

      /* Se recogen las diferencias en vez de afirmar dentro del bucle: así el
         fallo dice **qué** permisos se descolgaron, que es lo que hay que
         arreglar, en vez de solo el primero. */
      const discrepancias: string[] = [];

      try {
        for (const permiso of Object.keys(original)) {
          reemplazar(original);
          const esperado = expandPermissions({ [permiso]: true });

          reemplazar(alRevés);
          const obtenido = expandPermissions({ [permiso]: true });

          if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) {
            discrepancias.push(permiso);
          }
        }
      } finally {
        /* Pase lo que pase: el mapa es un objeto compartido por todo el módulo y
           dejarlo del revés rompería cualquier prueba que corriera después. */
        reemplazar(original);
      }

      expect(discrepancias).toEqual([]);
    });
  });

  describe('normalizePermissions', () => {
    it('un diccionario de booleanos pasa tal cual', () => {
      expect(normalizePermissions({ canComment: true, canEditTask: false })).toEqual({
        canComment: true,
        canEditTask: false,
      });
    });

    it('un array de nombres se convierte en diccionario', () => {
      /* Los roles creados antes de `IsPermissionMap` siguen guardados así. Sobre
         un array, `permisos[clave]` da `undefined` y el rol no concedía nada:
         existía, se listaba con sus permisos, y no servía para nada. */
      expect(normalizePermissions(['canComment', 'canEditTask'])).toEqual({
        canComment: true,
        canEditTask: true,
      });
    });

    it('y ese array expande igual que el diccionario equivalente', () => {
      expect(expandPermissions(normalizePermissions(['canDeleteTask']))).toEqual(
        expandPermissions({ canDeleteTask: true }),
      );
    });

    it('lo que no es ni objeto ni array no concede nada', () => {
      /* `null` en la columna Json, o una cadena suelta. Devolver `{}` es lo
         seguro: cualquier otra cosa sería inventarse permisos. */
      expect(normalizePermissions(null)).toEqual({});
      expect(normalizePermissions('canComment')).toEqual({});
      expect(normalizePermissions(undefined)).toEqual({});
    });

    it('los valores sucios se fuerzan a booleano', () => {
      expect(normalizePermissions({ canComment: 1, canEditTask: 0, canMoveTask: 'sí' })).toEqual({
        canComment: true,
        canEditTask: false,
        canMoveTask: true,
      });
    });
  });
});
