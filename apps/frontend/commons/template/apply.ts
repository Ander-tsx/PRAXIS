import type {
  Board,
  Column,
  Label,
  Project,
  ProjectRole,
  ProjectTemplate,
  TemplateResult,
  Workspace,
} from '../api/domain';
import { ApiError } from '../api/envelope';
import { createServerApiClient } from '../auth/server-client';

/**
 * Materializa una plantilla propuesta, **llamando a los endpoints de siempre**.
 *
 * ## Esto es la mitad que cierra la invariante
 *
 * `POST /me/assistant/project-draft` devuelve nombres y no toca nada. Lo que
 * crea el proyecto es esta función, y lo hace por donde lo haría una persona:
 * las mismas rutas que usan el formulario de crear proyecto, el de crear
 * espacio, el de crear tablero, el de crear columna, el de etiquetas y el de
 * roles. Con la sesión de quien pulsa, sus permisos y sus validaciones.
 *
 * | Paso | Endpoint |
 * |---|---|
 * | El proyecto | `POST /projects` |
 * | Cada etiqueta | `POST /projects/:id/labels` |
 * | Cada rol | `POST /projects/:id/roles` |
 * | Cada espacio | `POST /projects/:id/workspaces` |
 * | Cada tablero | `POST /workspaces/:id/boards` |
 * | Cada columna | `POST /boards/:id/columns` |
 * | El color de una columna | `PATCH /boards/:id/columns/:columnId` |
 *
 * No hay ninguna ruta nueva, y por tanto ninguna vía de escritura nueva.
 *
 * ## Vive en `commons` porque la usan dos zonas
 *
 * El diálogo de crear proyecto está en `commons/organisms` y lo montan
 * `projects-front` y `dashboard-front`. Duplicar ciento y pico líneas de
 * orquestación en las dos era garantizar que se separaran: cada zona pone
 * encima su Server Action de tres líneas y esto es lo único que sabe el orden.
 *
 * ⚠️ Es **código de servidor**: usa `createServerApiClient`. No lo importes
 * desde el índice raíz de `commons` ni desde un componente cliente.
 */

function describe(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

function vacio(): TemplateResult['creado'] {
  return { etiquetas: 0, roles: 0, espacios: 0, tableros: 0, columnas: 0 };
}

/**
 * Crea el proyecto y todo lo que cuelga de él.
 *
 * ## Lo que pasa cuando algo falla a mitad
 *
 * Se sigue, y se apunta. **No hay transacción que abarque varias peticiones
 * HTTP**, así que si la quinta columna falla las cuatro anteriores ya existen:
 * abortar dejaría el proyecto a medias igual, pero además sin lo que sí se
 * podía crear. Es la misma decisión que tomó el checklist del asistente
 * (ESTADO-ACTUAL §30.3) y por el mismo motivo: fingir que no pasó nada sería
 * mentir sobre el estado del tablero.
 *
 * La única excepción es el propio `POST /projects`: si eso falla no hay dónde
 * colgar nada y se vuelve con el error tal cual.
 *
 * ## 🔴 `organizationId` no es opcional de verdad: es obligatorio y se olvidó
 *
 * ⚠️ **Sin él, el proyecto cae SIEMPRE en la organización personal**, aunque el
 * selector esté en otra. `POST /projects` resuelve así el campo ausente
 * (CLAUDE.md, trampa 17), y el formulario manual ya lo mandaba —
 * `PraxCreateProjectTrigger` lleva ese aviso escrito desde que le pasó—. Esta
 * ruta, la de la plantilla, se quedó sin el arreglo: el proyecto se creaba
 * donde no lo ibas a mirar.
 *
 * Y lo que lo hacía difícil de leer como avería es la segunda consecuencia: la
 * cuota de proyectos se cuenta **por organización**, así que llenar la personal
 * a espaldas de quien mira acaba en un 402 «ya tienes 3» sobre una organización
 * distinta de la que se está viendo.
 *
 * Sigue siendo un parámetro opcional en la firma porque el tipo no puede
 * garantizar lo que sí garantiza quien llama: los dos llamantes lo sacan de
 * `loadPrivateChrome()`, o sea de `resolverOrganizacionActiva`, **nunca de la
 * cookie en crudo** (ver `theme/organizacion.ts`).
 */
export async function aplicarPlantilla(
  plantilla: ProjectTemplate,
  organizationId?: string | null,
): Promise<TemplateResult> {
  const api = createServerApiClient();
  const fallos: string[] = [];
  const creado = vacio();

  let proyecto: Project;
  try {
    proyecto = await api.post<Project>('/projects', {
      name: plantilla.nombre,
      /* Solo si la hay: un campo vacío de más es un 400 (CLAUDE.md). */
      ...(plantilla.descripcion ? { description: plantilla.descripcion } : {}),
      ...(organizationId ? { organizationId } : {}),
    });
  } catch (error) {
    return {
      proyecto: null,
      creado,
      fallos: [],
      error: describe(error, 'No se pudo crear el proyecto.'),
    };
  }

  if (!proyecto?.id) {
    return {
      proyecto: null,
      creado,
      fallos: [],
      error: 'El servidor respondió correctamente pero no guardó el proyecto.',
    };
  }

  /**
   * Las etiquetas y los roles, en paralelo entre sí pero no con lo demás.
   *
   * Aquí el orden no significa nada —una etiqueta no se coloca «detrás» de
   * otra— así que no hay motivo para hacerlas de una en una. Las columnas son
   * el caso contrario y por eso van en secuencia más abajo.
   */
  const [etiquetas, roles] = await Promise.all([
    Promise.all(
      plantilla.etiquetas.map((etiqueta) =>
        api
          .post<Label>(`/projects/${proyecto.id}/labels`, {
            name: etiqueta.nombre,
            color: etiqueta.color,
          })
          .then(() => true)
          .catch((error: unknown) => {
            fallos.push(`Etiqueta «${etiqueta.nombre}»: ${describe(error, 'no se pudo crear.')}`);
            return false;
          }),
      ),
    ),
    Promise.all(
      plantilla.roles.map((rol) =>
        api
          .post<ProjectRole>(`/projects/${proyecto.id}/roles`, {
            name: rol.nombre,
            /* Diccionario de booleanos, nunca un array: el backend lo valida y
               un array daba un rol vacío en silencio. Trampa 8 de CLAUDE.md. */
            permissions: rol.permisos,
          })
          .then(() => true)
          .catch((error: unknown) => {
            fallos.push(`Rol «${rol.nombre}»: ${describe(error, 'no se pudo crear.')}`);
            return false;
          }),
      ),
    ),
  ]);

  creado.etiquetas = etiquetas.filter(Boolean).length;
  creado.roles = roles.filter(Boolean).length;

  for (const espacio of plantilla.espacios) {
    let creadoEspacio: Workspace;
    try {
      creadoEspacio = await api.post<Workspace>(`/projects/${proyecto.id}/workspaces`, {
        name: espacio.nombre,
      });
    } catch (error) {
      fallos.push(`Espacio «${espacio.nombre}»: ${describe(error, 'no se pudo crear.')}`);
      /* Sin espacio no hay dónde poner sus tableros: se salta el subárbol
         entero en vez de acumular un fallo por cada hijo, que sería repetir la
         misma causa cinco veces. */
      continue;
    }

    creado.espacios += 1;

    for (const tablero of espacio.tableros) {
      let creadoTablero: Board;
      try {
        creadoTablero = await api.post<Board>(`/workspaces/${creadoEspacio.id}/boards`, {
          name: tablero.nombre,
        });
      } catch (error) {
        fallos.push(`Tablero «${tablero.nombre}»: ${describe(error, 'no se pudo crear.')}`);
        continue;
      }

      creado.tableros += 1;
      creado.columnas += await crearColumnas(api, creadoTablero.id, tablero, fallos);
    }
  }

  return {
    proyecto: { id: proyecto.id, name: proyecto.name, slug: proyecto.slug },
    creado,
    fallos,
    error: null,
  };
}

/**
 * Las columnas de un tablero, **en secuencia y por ese orden**.
 *
 * ⚠️ No van en paralelo, y no es por prudencia: `order` es la posición, así que
 * lanzadas a la vez el orden en pantalla lo decide quién llegue antes al
 * servidor. Un tablero cuyas fases salen barajadas no es un tablero. Mismo
 * razonamiento que el checklist del asistente.
 *
 * El color va en un `PATCH` aparte porque `POST /boards/:id/columns` solo acepta
 * `name` y `order` — un campo de más es un 400—. Y si ese `PATCH` falla no se
 * cuenta como columna perdida: la columna está, lo que le falta es el color.
 */
async function crearColumnas(
  api: ReturnType<typeof createServerApiClient>,
  boardId: string,
  tablero: ProjectTemplate['espacios'][number]['tableros'][number],
  fallos: string[],
): Promise<number> {
  let creadas = 0;

  for (const [orden, columna] of tablero.columnas.entries()) {
    let creadaColumna: Column;
    try {
      creadaColumna = await api.post<Column>(`/boards/${boardId}/columns`, {
        name: columna.nombre,
        order: orden,
      });
    } catch (error) {
      fallos.push(
        `Columna «${columna.nombre}» de «${tablero.nombre}»: ${describe(error, 'no se pudo crear.')}`,
      );
      continue;
    }

    creadas += 1;

    if (!columna.color) continue;

    try {
      await api.patch<Column>(`/boards/${boardId}/columns/${creadaColumna.id}`, {
        color: columna.color,
      });
    } catch {
      /**
       * Se avisa **solo cuando el color significa algo**. Un `success` que no
       * llega deja un tablero cuya última columna no cierra las tareas, y eso
       * hay que decirlo; que una columna intermedia salga del color por defecto
       * no le importa a nadie.
       */
      if (columna.color === 'success') {
        fallos.push(
          `La columna «${columna.nombre}» se creó pero no quedó marcada como de cierre. ` +
            'Ponle el color verde desde su menú para que cierre las tareas.',
        );
      }
    }
  }

  return creadas;
}
