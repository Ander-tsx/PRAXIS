/**
 * Los roles globales de la plataforma, y la única jerarquía que los ordena.
 *
 * ## Por qué existe este archivo
 *
 * La capa 1 de `docs/backend/permissions.md` tenía **dos roles planos** y se
 * comprobaban comparando el nombre exacto: `checkRole` buscaba la fila
 * `{ userId, roleName }` y devolvía un booleano, y `AccountOwnerGuard` llevaba
 * su propia constante `'Admin'` a fuego. Con dos roles sin orden entre ellos eso
 * funcionaba.
 *
 * Con tres deja de funcionar, y falla justo al revés de lo que se espera: un
 * `SuperAdmin` no tiene la fila `Admin`, así que **suspendería todos los
 * `@RequireGlobalRole('Admin')` que ya existen** — el rol más alto sería el que
 * menos puede. La jerarquía tiene que vivir en un sitio y ser la misma para los
 * dos guards, el panel y los seeds.
 *
 * ## Las dos preguntas, que no son la misma
 *
 * - `satisfiesGlobalRole(mios, exigido)` — **¿puedo entrar?** Compara contra el
 *   mínimo que pide un endpoint. Es lo que necesita un guard.
 * - `outranks(mios, ajenos)` — **¿puedo actuar sobre esta cuenta?** Exige nivel
 *   **estrictamente** superior.
 *
 * La segunda no se deduce de la primera, y confundirlas deja el sistema abierto
 * a que se descabece a sí mismo: un `Admin` satisface `Admin`, así que con solo
 * la primera pregunta podría suspender a otro `Admin` — o a un `SuperAdmin`, que
 * no le quita el rol pero le impide entrar, que a efectos prácticos es lo mismo.
 * Suspendes a los `SuperAdmin` y ya nadie puede volver a crear ni degradar
 * administradores.
 *
 * ⚠️ **`outranks` mira la cuenta, no la acción.** El nivel del *rol que se
 * concede* se comprueba aparte y también en estricto: por eso un `Admin` puede
 * dar y quitar `User`, un `SuperAdmin` puede dar y quitar `Admin`, y **nadie
 * concede `SuperAdmin`** — el primero lo crea el seed, no la interfaz.
 */

/**
 * Los tres nombres, tal como están escritos en la tabla `permissions.roles`.
 *
 * Se comparan **con distinción de mayúsculas** contra esa columna, así que esta
 * constante y el seed tienen que decir exactamente lo mismo. Por eso el seed los
 * lee de aquí en vez de repetirlos.
 */
export const GLOBAL_ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN: 'Admin',
  USER: 'User',
} as const;

export type GlobalRole = (typeof GLOBAL_ROLES)[keyof typeof GLOBAL_ROLES];

/**
 * El orden. Es lo único que define la jerarquía: todo lo demás compara números.
 *
 * Los huecos entre valores no significan nada; lo que importa es el orden. Un rol
 * nuevo se añade aquí y las dos preguntas de abajo lo entienden sin tocarse.
 */
const GLOBAL_ROLE_LEVEL: Record<GlobalRole, number> = {
  [GLOBAL_ROLES.USER]: 0,
  [GLOBAL_ROLES.ADMIN]: 1,
  [GLOBAL_ROLES.SUPER_ADMIN]: 2,
};

/** El nivel de `User`, que es también el de quien no tiene ninguna fila. */
const NIVEL_BASE = GLOBAL_ROLE_LEVEL[GLOBAL_ROLES.USER];

/**
 * Los roles que la plataforma crea al arrancar.
 *
 * Vive aquí y no en el servicio porque lo necesitan tres sitios que no se
 * conocen: el `onModuleInit` de permissions-service (que los reconstruye en cada
 * arranque, así que una base recién migrada y sin sembrar los tiene igual), su
 * `seed.ts`, y el panel para pintar el desplegable de roles.
 */
export const GLOBAL_ROLE_SEED: ReadonlyArray<{
  name: GlobalRole;
  description: string;
}> = [
  {
    name: GLOBAL_ROLES.SUPER_ADMIN,
    description: 'Administra la plataforma, incluidos los demás administradores',
  },
  {
    name: GLOBAL_ROLES.ADMIN,
    description: 'Acceso de administración sobre toda la plataforma',
  },
  {
    name: GLOBAL_ROLES.USER,
    description: 'Miembro normal del sistema',
  },
];

/** ¿Es uno de los tres nombres conocidos? */
export function isGlobalRole(name: string): name is GlobalRole {
  return Object.hasOwn(GLOBAL_ROLE_LEVEL, name);
}

/**
 * El nivel efectivo de quien tiene estos roles: **el más alto** de los que
 * tenga.
 *
 * Dos detalles que no son obvios y que sostienen todo lo demás:
 *
 * 1. **Una lista vacía es `User`, no "sin nivel".** `POST /auth/register` crea la
 *    cuenta y no le asigna ningún rol —lo verifiqué: solo el seed reparte filas
 *    de `UserRole`—, así que la mayoría de las cuentas reales no tienen ni una.
 *    Tratarlas como un nivel inexistente rompería `outranks` justo en el caso
 *    normal: un `Admin` no podría actuar sobre nadie.
 * 2. **Los nombres desconocidos se ignoran.** `permissions.roles` es una tabla
 *    abierta y nada impide insertar ahí un rol inventado. Si un nombre que no
 *    está en la jerarquía subiera el nivel, una fila en la base de datos sería
 *    una escalada de privilegios.
 */
export function globalRoleLevel(roleNames: readonly string[]): number {
  return roleNames.reduce(
    (nivel, name) => (isGlobalRole(name) ? Math.max(nivel, GLOBAL_ROLE_LEVEL[name]) : nivel),
    NIVEL_BASE,
  );
}

/**
 * ¿Estos roles alcanzan el mínimo que pide un endpoint?
 *
 * Es la pregunta de los guards: `satisfiesGlobalRole(mios, 'Admin')` es cierto
 * tanto para un `Admin` como para un `SuperAdmin`, que es exactamente lo que
 * faltaba.
 */
export function satisfiesGlobalRole(roleNames: readonly string[], required: GlobalRole): boolean {
  return globalRoleLevel(roleNames) >= GLOBAL_ROLE_LEVEL[required];
}

/**
 * ¿Puede quien tiene `actorRoles` actuar sobre la cuenta de quien tiene
 * `targetRoles`?
 *
 * **Estrictamente superior.** Un `Admin` administra `User`; un `SuperAdmin`,
 * `Admin` y `User`; y nadie actúa sobre un igual. Aplica igual a suspender que a
 * cambiar el rol: bloquear solo el cambio de rol dejaba la suspensión como vía
 * para el mismo daño.
 *
 * ⚠️ No comprueba que actor y objetivo sean personas distintas. Actuar sobre uno
 * mismo lo impide `outranks` por definición —nadie se supera a sí mismo— pero
 * **solo cuando los dos lados se leen de la base de datos**. Quien llame tiene
 * que comparar los ids igualmente: es la comprobación barata, da un mensaje
 * mucho más claro («no puedes suspenderte») y no depende de que el nivel de los
 * dos lados se haya resuelto bien.
 */
export function outranks(actorRoles: readonly string[], targetRoles: readonly string[]): boolean {
  return globalRoleLevel(actorRoles) > globalRoleLevel(targetRoles);
}

/**
 * ¿Puede quien tiene `actorRoles` conceder o revocar el rol `role`?
 *
 * También estricto, y por eso `SuperAdmin` no se puede conceder desde ninguna
 * ruta: el primero lo crea el seed. Sin esto, crear el rol `SuperAdmin` habría
 * abierto un agujero de golpe — `POST /permissions/assign` exige `Admin`, así que
 * cualquier administrador podría haberse concedido a sí mismo el nivel de
 * encima.
 */
export function canGrantGlobalRole(actorRoles: readonly string[], role: GlobalRole): boolean {
  return globalRoleLevel(actorRoles) > GLOBAL_ROLE_LEVEL[role];
}
