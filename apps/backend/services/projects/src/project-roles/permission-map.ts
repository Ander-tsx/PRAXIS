import { PROJECT_PERMISSIONS } from '@praxis/contracts';

/**
 * Cómo se leen los permisos guardados de un rol.
 *
 * Vivía entero dentro de `ProjectRolesService`, que era su único consumidor.
 * Salió aquí cuando `ProjectsService` necesitó lo mismo para filtrar
 * `GET /projects?permission=…`: la alternativa era una segunda copia de la
 * jerarquía, y una jerarquía duplicada es una jerarquía que se desincroniza el
 * día que alguien añade un permiso en un solo sitio.
 *
 * No es un servicio de Nest a propósito — son funciones puras sobre un objeto,
 * sin estado ni dependencias, y meterlas en el contenedor solo añadiría cableado.
 */

/**
 * Mapa de jerarquía de permisos:
 * Si el usuario tiene el permiso-hijo, se le otorgan automáticamente
 * los permisos-padre listados en el arreglo.
 *
 * Regla general:
 *   canDelete* → implica canEdit* + canCreate*
 *   canEdit*   → implica canCreate*
 *
 * El orden de las entradas **no importa**: `expandPermissions` itera hasta punto
 * fijo, así que la implicación es transitiva se escriba como se escriba. No
 * siempre fue así — ver la nota de esa función.
 */
export const PERMISSION_HIERARCHY: Record<string, string[]> = {
  // Boards
  canDeleteBoard: ['canEditBoard', 'canCreateBoard', 'canEditProject', 'canManageSprint'],
  // Quien administra la estructura del tablero también gestiona sus sprints
  // (D7 de `docs/PLAN-SCRUM-KANBAN.md`).
  canEditBoard: ['canCreateBoard', 'canEditProject', 'canManageSprint'],
  // Quien administra el proyecto ve los reportes.
  canEditProject: ['canViewReports'],
  canManageMembers: ['canViewReports'],
  // Columns
  canDeleteColumn: ['canEditColumn', 'canCreateColumn'],
  canEditColumn: ['canCreateColumn'],
  // Tasks
  canDeleteTask: ['canEditTask', 'canMoveTask', 'canComment', 'canCreateTask'],
  // Editar implica mover y comentar: quien puede reescribir la tarea entera
  // puede, con más razón, cambiarla de columna o dejar una nota. Al revés no.
  canEditTask: ['canMoveTask', 'canComment', 'canCreateTask'],
  // Borrar el proyecto se lleva todos sus tableros por delante, así que quien
  // puede borrarlo puede, con mucha más razón, renombrarlo.
  canDeleteProject: [
    'canDeleteBoard',
    'canEditBoard',
    'canCreateBoard',
    'canEditProject',
    'canViewReports',
  ],
  // Quien puede repartir permisos puede administrar las dos capacidades que
  // dependen de ellos. Los roles administrativos existentes ya tienen
  // canManageRoles, por lo que obtienen esta ampliación al leerlos sin migrar
  // por nombre los JSON históricos.
  canManageRoles: ['canManageAutomations', 'canManageIntegrations'],
  // Miembros no tiene jerarquía adicional.
};

/**
 * `canViewProject` es el suelo de la jerarquía: cualquier permiso lo implica.
 *
 * Se resuelve aparte y no en la tabla porque no depende de un permiso concreto
 * sino de tener **alguno**. Enumerarlo en cada entrada se olvidaría en cuanto
 * alguien añadiera un permiso nuevo.
 */
export const VIEW_PERMISSION = 'canViewProject';

/** Mapa con todos los permisos conocidos al mismo valor. */
export function fullPermissionMap(value: boolean): Record<string, boolean> {
  return Object.fromEntries(PROJECT_PERMISSIONS.map((p) => [p, value]));
}

/** Fuerza booleanos: en BD los permisos son Json y podrían llegar sucios. */
export function normalizeBooleans(map: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, !!v]));
}

/**
 * Normaliza lo que hay guardado en `ProjectRole.permissions`.
 *
 * El campo es `Json`, y antes de que el DTO validara se colaron roles con un
 * **array** de nombres en vez del diccionario. Sobre un array, `permisos[clave]`
 * da `undefined`, así que esos roles no concedían nada: el rol existía, se veía
 * en la lista con sus permisos y no servía para nada.
 *
 * La entrada ya está cerrada (`IsPermissionMap`), pero los roles creados antes
 * siguen en la base. Convertirlos aquí les devuelve el significado que tenían
 * al crearlos, sin necesidad de una migración de datos.
 */
export function normalizePermissions(stored: unknown): Record<string, boolean> {
  if (Array.isArray(stored)) {
    return Object.fromEntries(
      stored.filter((key): key is string => typeof key === 'string').map((key) => [key, true]),
    );
  }

  if (stored && typeof stored === 'object') {
    return normalizeBooleans(stored as Record<string, unknown>);
  }

  return {};
}

/**
 * Dado el mapa de permisos almacenado en BD, devuelve uno expandido
 * donde cada permiso de nivel superior "hereda" los de nivel inferior.
 *
 * Ejemplo:
 *   { canDeleteBoard: true } → { canDeleteBoard: true, canEditBoard: true, canCreateBoard: true }
 *
 * ## Por qué itera hasta punto fijo y no una vez
 *
 * Recorría el mapa **una sola pasada**, y con eso la implicación no es
 * transitiva: `canDeleteBoard` concede `canEditProject`, y `canEditProject`
 * concede `canViewReports`, pero la segunda regla ya había pasado cuando la
 * primera la activó. Funcionaba —y solo funcionaba— porque las entradas están
 * escritas de mayor a menor alcance y `Object.entries` respeta el orden de
 * inserción.
 *
 * ⚠️ **Eso hace que el orden de un objeto literal decida quién ve los
 * reportes.** Reordenar el mapa, alfabetizarlo o meter un permiso nuevo por
 * arriba le quitaba `canViewReports` a quien administra tableros, sin error, sin
 * aviso y sin nada que lo relacionara con el cambio: un rol que deja de conceder
 * algo no falla, simplemente devuelve 403 más tarde y en otro sitio.
 *
 * Con el punto fijo la jerarquía significa lo que dice. El bucle termina siempre:
 * cada vuelta solo puede añadir permisos de un conjunto finito, así que a lo sumo
 * hay tantas vueltas como permisos. La cota está escrita igualmente — un bucle
 * sin salida en el camino de los permisos es peor que un permiso de menos.
 */
export function expandPermissions(raw: Record<string, boolean>): Record<string, boolean> {
  const expanded = { ...raw };
  const reglas = Object.entries(PERMISSION_HIERARCHY);

  for (let vuelta = 0; vuelta <= reglas.length; vuelta++) {
    let cambió = false;

    for (const [key, implied] of reglas) {
      if (!expanded[key]) continue;
      for (const impliedPerm of implied) {
        if (!expanded[impliedPerm]) {
          expanded[impliedPerm] = true;
          cambió = true;
        }
      }
    }

    if (!cambió) break;
  }

  // Quien puede hacer algo en el proyecto, puede verlo.
  if (Object.values(expanded).some(Boolean)) {
    expanded[VIEW_PERMISSION] = true;
  }

  return expanded;
}
