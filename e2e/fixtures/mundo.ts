import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { comoBearer, crearProyecto, data, nombreUnico, registrar, type Usuario } from './api';

/**
 * Un proyecto completo y utilizable, montado por API.
 *
 * ## Por qué existe
 *
 * Casi nada se puede probar sobre un proyecto recién creado: nace **sin roles y
 * sin miembros**, y sin un `ProjectRole` no se puede dar de alta a nadie. Para
 * llegar a una tarea hacen falta seis peticiones encadenadas —rol, espacio,
 * tablero, columnas, tarea— y cada prueba que las repita a mano es una prueba
 * que falla por el andamio en vez de por lo que quería comprobar.
 *
 * Sigue el «Flujo mínimo para dejar un proyecto usable» de CONTRATO-API.
 *
 * ## Lo que hay que recordar al usarlo
 *
 * - `status` de una tarea **es el nombre de su columna**, no un enum. Por eso se
 *   devuelven las columnas con nombre e id juntos.
 * - Las rutas anidadas esperan el **UUID**, no el slug. `proyecto.id` para la
 *   API; `proyecto.slug` solo para construir URLs de navegador.
 */

export interface Columna {
  id: string;
  name: string;
  order: number;
  color: string;
}

export interface Mundo {
  /** Quien crea todo y, por ser dueño, tiene acceso total sin pasar por roles. */
  duenno: Usuario;
  proyecto: { id: string; slug: string; name: string; ownerId: string };
  workspaceId: string;
  boardId: string;
  columnas: Columna[];
  /** Atajo a la primera columna, que es donde aterrizan las tareas nuevas. */
  primeraColumna: Columna;
}

/** Los tres estados de siempre. El nombre importa: es el `status` de la tarea. */
const COLUMNAS = ['Por hacer', 'En curso', 'Hecho'] as const;

/**
 * Monta el mundo entero y devuelve sus identificadores.
 *
 * Cada paso afirma su código esperado por separado: si algo se rompe, el fallo
 * señala **qué** eslabón cedió en lugar de un `undefined` tres llamadas después.
 */
export async function crearMundo(request: APIRequestContext): Promise<Mundo> {
  const duenno = await registrar(request);
  const cabeceras = comoBearer(duenno.accessToken);

  const proyecto = await crearProyecto(request, duenno.accessToken);

  const respuestaWorkspace = await request.post(`/api/projects/${proyecto.id}/workspaces`, {
    headers: cabeceras,
    data: { name: nombreUnico('Espacio') },
  });
  expect(respuestaWorkspace.status(), 'Crear espacio de trabajo').toBe(201);
  const workspaceId = (await data<{ id: string }>(respuestaWorkspace)).id;

  const respuestaBoard = await request.post(`/api/workspaces/${workspaceId}/boards`, {
    headers: cabeceras,
    data: { name: nombreUnico('Tablero') },
  });
  expect(respuestaBoard.status(), 'Crear tablero').toBe(201);
  const boardId = (await data<{ id: string }>(respuestaBoard)).id;

  const columnas: Columna[] = [];
  for (const [indice, nombre] of COLUMNAS.entries()) {
    const respuesta = await request.post(`/api/boards/${boardId}/columns`, {
      headers: cabeceras,
      data: { name: nombre, order: indice },
    });
    expect(respuesta.status(), `Crear columna «${nombre}»`).toBe(201);
    columnas.push(await data<Columna>(respuesta));
  }

  return {
    duenno,
    proyecto,
    workspaceId,
    boardId,
    columnas,
    primeraColumna: columnas[0],
  };
}

/**
 * Crea una tarea en la columna indicada.
 *
 * `status` se rellena solo con el nombre de la columna, que es lo que el backend
 * exige y el error más fácil de cometer a mano.
 */
export async function crearTarea(
  request: APIRequestContext,
  token: string,
  mundo: Mundo,
  opciones: { titulo?: string; columna?: Columna } = {},
): Promise<{ id: string; title: string; status: string; columnId: string }> {
  const columna = opciones.columna ?? mundo.primeraColumna;

  const respuesta = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
    headers: comoBearer(token),
    data: {
      columnId: columna.id,
      title: opciones.titulo ?? nombreUnico('Tarea'),
      status: columna.name,
    },
  });
  expect(respuesta.status(), 'Crear tarea').toBe(201);
  return data(respuesta);
}

/**
 * Da de alta a alguien en el proyecto con los permisos indicados.
 *
 * ⚠️ `permissions` **tiene que ser el diccionario de booleanos**. Un array se
 * acepta con 201 y no concede nada (CONTRATO-API §Project Roles), así que la
 * firma solo admite la forma correcta: el error no puede ni escribirse.
 */
export async function darDeAlta(
  request: APIRequestContext,
  mundo: Mundo,
  invitado: Usuario,
  permisos: Record<string, boolean>,
  nombreRol = nombreUnico('Rol'),
): Promise<{ projectRoleId: string }> {
  const cabeceras = comoBearer(mundo.duenno.accessToken);

  const respuestaRol = await request.post(`/api/projects/${mundo.proyecto.id}/roles`, {
    headers: cabeceras,
    data: { name: nombreRol.slice(0, 50), permissions: permisos },
  });
  expect(respuestaRol.status(), 'Crear rol de proyecto').toBe(201);
  const projectRoleId = (await data<{ id: string }>(respuestaRol)).id;

  const respuestaMiembro = await request.post(`/api/projects/${mundo.proyecto.id}/members`, {
    headers: cabeceras,
    data: { userId: invitado.userId, projectRoleId },
  });
  expect(respuestaMiembro.status(), 'Dar de alta al miembro').toBe(201);

  return { projectRoleId };
}
