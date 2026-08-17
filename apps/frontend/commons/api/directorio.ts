import type { UserProfile } from './domain';
import { personLabel } from './domain';
import type { Paginated } from './envelope';

/**
 * Resolver un puñado de `userId` a perfiles, en **una** petición y sin mentir
 * cuando no se puede.
 *
 * ## El fallo que cierra
 *
 * Cinco pantallas hacían lo mismo a mano:
 *
 * ```ts
 * const perfiles = await Promise.all(
 *   ids.map((id) => api.get<UserProfile>(`/users/${id}`).catch(() => null)),
 * );
 * ```
 *
 * Eso es **una petición por persona**. Un chat de equipo de veinte son veinte
 * peticiones por carga de página, y como el renderizado ocurre en el servidor,
 * todas salen con la **IP del servidor Next**: el limitador del gateway
 * (`ThrottlerModule`, 300/min por IP) las cuenta a todas en el mismo cubo, así
 * que el presupuesto es de toda la plataforma junta, no de cada persona.
 *
 * Al pasarse, el gateway responde 429, el `.catch(() => null)` se lo tragaba en
 * silencio y el perfil desaparecía del mapa. Aguas abajo eso se leía como «esta
 * cuenta ya no existe» y la pantalla escribía **«Alguien que ya no está»** sobre
 * gente que estaba perfectamente, y sin foto. Se arreglaba solo al minuto,
 * cuando la ventana del limitador se reiniciaba — de ahí que pareciera aleatorio
 * e imposible de reproducir en local, donde nadie llega a 300.
 *
 * ## Las dos mitades del arreglo
 *
 * 1. **Una sola petición.** `GET /users?ids=a,b,c` ya existía —lo estrenó la
 *    rejilla de proyectos— y admite hasta 200 ids. Veinte peticiones pasan a
 *    ser una.
 * 2. **Distinguir «no existe» de «no lo pude preguntar».** Es la parte que
 *    importa de verdad: un fallo de red y una cuenta borrada **no son lo
 *    mismo** y no pueden pintarse igual. Por eso esto no devuelve un `Map` a
 *    secas sino un {@link Directorio} con el `completo` puesto, y
 *    {@link nombreDePersona} lo respeta.
 */
export interface Directorio {
  /**
   * Los perfiles que se pudieron resolver, por id.
   *
   * Es un `Map` y no un objeto porque cruza de un componente de servidor a uno
   * de cliente y React serializa `Map` sin ayuda.
   */
  perfiles: Map<string, UserProfile>;
  /**
   * ¿Se pudo preguntar al directorio?
   *
   * `true` significa que la respuesta llegó: quien no esté en `perfiles` es que
   * de verdad no existe. `false` significa que la consulta falló —429, gateway
   * caído, tiempo agotado— y entonces **un ausente no dice nada**: puede estar
   * ahí y no haberse podido resolver.
   *
   * ⚠️ Sin esta distinción, cualquier hipo de red se convierte en una
   * afirmación falsa sobre una persona real en la pantalla de sus compañeros.
   */
  completo: boolean;
}

/** Un directorio vacío que además admite no saber nada. Para los primeros renders. */
export const DIRECTORIO_VACIO: Directorio = { perfiles: new Map(), completo: true };

/**
 * Cuántos ids caben en una petición.
 *
 * Espejo del tope de `FindUsersByIdsDto` en el microservicio (200). Se trocea
 * aquí en vez de dejar que el backend rechace la lista entera: una pantalla con
 * un proyecto de 250 personas debe salir, no fallar.
 */
const IDS_POR_PETICION = 200;

/** Lo mínimo que se le pide al cliente de API. Vale el del servidor y el del navegador. */
interface ClienteDeLectura {
  get<T>(path: string): Promise<T>;
}

/**
 * Los perfiles de una lista de ids.
 *
 * Deduplica y descarta los vacíos por su cuenta, así que quien llama puede
 * concatenar de donde le venga sin limpiar antes.
 *
 * **Nunca lanza.** Un directorio que no se puede resolver degrada la pantalla
 * —salen iniciales en vez de fotos— pero no puede impedir leer la conversación,
 * que es contenido y no decoración.
 */
export async function resolverPerfiles(
  api: ClienteDeLectura,
  ids: Iterable<string | null | undefined>,
): Promise<Directorio> {
  const limpios = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  if (limpios.length === 0) return { perfiles: new Map(), completo: true };

  const lotes: string[][] = [];
  for (let i = 0; i < limpios.length; i += IDS_POR_PETICION) {
    lotes.push(limpios.slice(i, i + IDS_POR_PETICION));
  }

  const respuestas = await Promise.all(
    lotes.map((lote) =>
      api.get<Paginated<UserProfile>>(`/users?ids=${lote.join(',')}`).catch(() => null),
    ),
  );

  const perfiles = new Map<string, UserProfile>();
  for (const respuesta of respuestas) {
    for (const perfil of respuesta?.items ?? []) perfiles.set(perfil.id, perfil);
  }

  /* Basta con que **un** lote falle para no poder afirmar que a los ausentes de
     ese lote se los tragó la tierra. */
  return { perfiles, completo: respuestas.every((respuesta) => respuesta !== null) };
}

/**
 * Cómo se lee una persona en pantalla.
 *
 * Tres casos y **tres textos distintos**, que es justo lo que faltaba:
 *
 * | Situación | Se lee |
 * |---|---|
 * | Eres tú | «Tú» |
 * | Perfil resuelto | su nombre, o la parte local del correo |
 * | El directorio respondió y no está | «Alguien que ya no está» |
 * | El directorio **no** respondió | «Alguien del equipo» |
 *
 * La última fila es la que arregla el fallo: antes también decía «Alguien que ya
 * no está», y eso es una afirmación —esa cuenta se fue— hecha a partir de un
 * fallo de red. Ahora se dice lo único que se sabe con certeza en ese momento:
 * que hay una persona detrás y no se ha podido averiguar cuál.
 */
export function nombreDePersona(
  directorio: Directorio,
  userId: string,
  currentUserId?: string,
): string {
  if (currentUserId && userId === currentUserId) return 'Tú';

  const perfil = directorio.perfiles.get(userId);
  if (perfil) return personLabel(perfil);

  return directorio.completo ? 'Alguien que ya no está' : 'Alguien del equipo';
}
