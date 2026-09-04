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
 * ## Hubo dos, y ahora hay uno
 *
 * Mientras el frontend fue un multi-zone, cada zona tenía `basePath` y Next se
 * lo anteponía a los enlaces internos: `projectHref()` daba la ruta completa
 * —para cruzar de zona, con `<a>`— y `projectPath()` la relativa, para navegar
 * dentro de projects-front con `next/link`.
 *
 * 🔴 **`projectPath()` se retiró en F6 de la fusión de zonas.** Sin `basePath`
 * no hay nada que anteponer, así que su valor —`/rediseno-del-panel`— habría
 * llevado a la raíz de la aplicación, o sea a la landing pública. Y no habría
 * dado ningún error: es una cadena válida y un enlace que responde 200.
 *
 * Queda `projectHref()`, que vale en los dos sitios.
 */

/** Lo mínimo para construir un enlace: cualquier cosa con slug sirve. */
type ConSlug = Pick<Project, 'slug'>;

/**
 * `/projects/rediseno-del-panel` — la ruta de un proyecto, entera.
 *
 * ```tsx
 * <Link href={projectHref(project)}>{project.name}</Link>
 * <Link href={projectHref(project, { board: task.boardId, task: task.id })}>…</Link>
 * router.replace(projectHref(project, { tab: 'espacios', ws: id }));
 * ```
 */
export function projectHref(project: ConSlug, params?: ProjectParams): string {
  return `/projects/${project.slug}${queryString(params)}`;
}

/**
 * Los parámetros que entienden las pantallas de proyecto.
 *
 * Están tipados en vez de aceptar un objeto suelto para que un `?tabs=` o un
 * `?taskId=` —que la página ignoraría en silencio— no compile.
 */
export interface ProjectParams {
  /** Pestaña activa. La página cae en «espacios» si no reconoce el valor. */
  /**
   * ⚠️ `automation` es el nombre vigente de la sección de automatización.
   * `reglas` y `automatizaciones` siguen resolviendo —la página los trata como
   * alias— pero no se escriben en enlaces nuevos.
   */
  tab?: 'espacios' | 'chat' | 'equipo' | 'etiquetas' | 'roles' | 'automation';
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
