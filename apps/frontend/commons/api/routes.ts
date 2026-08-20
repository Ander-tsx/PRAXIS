import type { Project } from './domain';

/**
 * Las URLs de las pantallas de un proyecto, en un solo sitio.
 *
 * ## Por qué existe
 *
 * Un proyecto tiene **dos identificadores que no son intercambiables**:
 *
 * - `slug` — el nombre legible. Va en la **URL**: `/projects/rediseno-del-panel`.
 * - `id` — el UUID. Va en las **llamadas a la API**, incluidas todas las rutas
 *   anidadas (`/projects/:projectId/members`, tareas, informes, asistente).
 *
 * Solo `GET|PATCH|DELETE /projects/:idOrSlug` entiende las dos formas; lo demás
 * exige el UUID. Y elegir mal **no da error de compilación**: los dos son
 * `string`. Se manifiesta como una URL fea, un 403 del asistente o un
 * desplegable que se queda en «Elige un proyecto».
 *
 * No es hipotético: al introducir los slugs se coló en cinco sitios —la rejilla
 * de proyectos, las pestañas, el selector de espacios, el de informes y la
 * puerta de invitaciones—, y cada uno se encontró por casualidad.
 *
 * Estas funciones convierten «acordarse de usar el slug» en algo que se hace
 * solo. **Si vas a escribir a mano una ruta de proyecto, usa esto en su lugar.**
 *
 * ## Ojo con el basePath
 *
 * Las zonas son apps Next independientes con `basePath`. Dentro de
 * projects-front, Next añade `/projects` solo, así que un enlace **de la misma
 * zona** va sin prefijo. Por eso hay dos familias:
 *
 * - `projectHref()` — ruta completa del shell. Para enlazar **desde otra zona**
 *   (el panel, los avisos) y siempre con `<a>`, no con `next/link`.
 * - `projectPath()` — relativa a projects-front. Para `next/link` y `router`
 *   **dentro** de esa zona.
 *
 * Ver ESTADO-ACTUAL §16.
 */

/** Lo mínimo para construir un enlace: cualquier cosa con slug sirve. */
type ConSlug = Pick<Project, 'slug'>;

/**
 * `/projects/rediseno-del-panel` — ruta del shell, para cruzar de zona.
 *
 * ```tsx
 * <a href={projectHref(project)}>{project.name}</a>
 * <a href={projectHref(project, { board: task.boardId, task: task.id })}>…</a>
 * ```
 */
export function projectHref(project: ConSlug, params?: ProjectParams): string {
  return `/projects/${project.slug}${queryString(params)}`;
}

/**
 * `/rediseno-del-panel` — relativa, para navegar dentro de projects-front.
 *
 * ```tsx
 * <Link href={projectPath(project, { tab: 'equipo' })} replace>Equipo</Link>
 * router.replace(projectPath(project, { tab: 'espacios', ws: id }));
 * ```
 */
export function projectPath(project: ConSlug, params?: ProjectParams): string {
  return `/${project.slug}${queryString(params)}`;
}

/** `/reports/rediseno-del-panel` — el informe, desde cualquier zona. */
export function reportHref(project: ConSlug): string {
  return `/reports/${project.slug}`;
}

/** `/rediseno-del-panel` — el informe, navegando dentro de reports-front. */
export function reportPath(project: ConSlug): string {
  return `/${project.slug}`;
}

/**
 * Los parámetros que entienden las pantallas de proyecto.
 *
 * Están tipados en vez de aceptar un objeto suelto para que un `?tabs=` o un
 * `?taskId=` —que la página ignoraría en silencio— no compile.
 */
export interface ProjectParams {
  /** Pestaña activa. La página cae en «espacios» si no reconoce el valor. */
  tab?: 'espacios' | 'chat' | 'equipo' | 'etiquetas' | 'roles' | 'reglas';
  /** Espacio de trabajo a abrir. */
  ws?: string;
  /** Tablero donde vive la tarea: sin él se aterriza en el primer espacio. */
  board?: string;
  /** Tarea a abrir directamente. */
  task?: string;
  /**
   * Enseñar solo las tareas propias del tablero.
   *
   * Va en la URL y no en estado de cliente por lo mismo que `tab`: sobrevive a
   * recargar, el botón atrás lo deshace, y un enlace compartido lleva a la
   * misma vista que estaba mirando quien lo mandó.
   */
  mias?: '1';
}

function queryString(params?: ProjectParams): string {
  if (!params) return '';

  /* `undefined` se descarta: así quien llama puede pasar campos opcionales sin
     construir el objeto condicionalmente. */
  const pares = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (pares.length === 0) return '';

  return `?${new URLSearchParams(pares as [string, string][]).toString()}`;
}
