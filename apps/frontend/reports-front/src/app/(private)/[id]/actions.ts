'use server';

import { ApiError, type ProjectDetail, type Task } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import {
  type AssistantChatResult,
  type AssistantQuota,
  type ConversacionCompleta,
  type ConversacionResumen,
  type PropuestaAsignacion,
  type PropuestaChecklist,
  type PropuestaComentario,
  type PropuestaEdicion,
  type PropuestaMovimiento,
  type PropuestaTarea,
} from '@/lib/assistant';

/**
 * Las acciones del asistente.
 *
 * ## La regla que gobierna este archivo
 *
 * **La IA propone; ejecuta el código que ya existe.** `preguntarAction` solo
 * habla con el asistente y devuelve texto y propuestas. Escribir es otra cosa y
 * pasa por una `aceptar*Action`, y **cada una llama al mismo endpoint que su
 * formulario del tablero**, con los mismos permisos, la misma validación y los
 * mismos 400 y 403 que ya están probados:
 *
 * | Acción | Endpoint | Permiso |
 * |---|---|---|
 * | `aceptarTareaAction` | `POST /boards/:id/tasks` | `canCreateTask` |
 * | `aceptarAsignacionAction` | `POST /tasks/:id/assign` | `canEditTask` |
 * | `aceptarEdicionAction` | `PATCH /tasks/:id` | `canEditTask` |
 * | `aceptarMovimientoAction` | `POST /tasks/:id/move` | `canMoveTask` |
 * | `aceptarChecklistAction` | `POST /tasks/:id/checklists` | `canEditTask` |
 * | `aceptarComentarioAction` | `POST /tasks/:id/comments` | `canComment` |
 *
 * No se abre ninguna vía de escritura nueva: sin `canCreateTask`, aceptar falla
 * igual que le fallaría a esa persona pulsando el botón a mano.
 *
 * **Y no hay ninguna que borre.** No existe `aceptarBorradoAction` ni la va a
 * haber: ver la nota al pie de `tools.ts`.
 *
 * ⚠️ **Nada de lo que llega aquí desde el chat es de fiar**, y no hace falta que
 * lo sea: la propuesta viaja por el navegador, así que el `columnId` se vuelve a
 * resolver contra el proyecto de verdad y el permiso lo comprueba el gateway.
 *
 * Comprueban la sesión por su cuenta, como las del tablero: una Server Function
 * viaja como POST a la ruta donde se usa y un cambio de `matcher` en `proxy.ts`
 * podría dejarla fuera del guard.
 *
 * ⚠️ **Ninguna llama a `revalidatePath`, y es a propósito.** Lo que cambia al
 * aceptar es el tablero, que vive en otra zona y no comparte caché con esta;
 * revalidar aquí solo conseguiría volver a renderizar la página de reportes
 * —cinco informes, dos de ellos recorriendo el historial— para no cambiar ni un
 * píxel de lo que se está viendo.
 */

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

/**
 * Traduce el fallo a algo que se pueda leer en una burbuja de chat.
 *
 * El 429 es el único con un mensaje propio del backend que merece salir tal
 * cual: lleva el límite y la fecha de reinicio.
 */
function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'No tienes permiso para hacer esto en este proyecto.';
    if (error.status === 404) return 'Eso ya no existe en el proyecto.';
    if (error.status >= 500 && error.status !== 502) return fallback;
    return error.message;
  }
  return fallback;
}

/** La cuota que el backend mete en `details` del 429, si viene. */
function cuotaDelError(error: unknown): AssistantQuota | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (details && typeof details === 'object' && 'cuota' in details) {
    return (details as { cuota: AssistantQuota }).cuota;
  }
  return null;
}

export interface RespuestaChat {
  reply: string | null;
  proposals: AssistantChatResult['proposals'];
  /** Siempre que se pueda saber: también cuando el turno falla por cuota. */
  cuota: AssistantQuota | null;
  /** La conversación en la que cayó el turno. El cliente lo guarda para el siguiente. */
  conversationId: string | null;
  error: string | null;
}

/**
 * Un turno de conversación.
 *
 * ⚠️ **El historial ya no lo manda el cliente.** Lo guarda el servidor desde que
 * hay conversaciones, así que aquí solo viaja `conversationId` — sin él se abre
 * una nueva y su id vuelve en la respuesta, para que el siguiente mensaje
 * continúe el mismo hilo.
 */
export async function preguntarAction(
  projectId: string,
  message: string,
  conversationId?: string,
): Promise<RespuestaChat> {
  const api = await requireApi();
  if (!api) {
    return {
      reply: null,
      proposals: [],
      cuota: null,
      conversationId: null,
      error: 'Tu sesión ha caducado.',
    };
  }

  const texto = message.trim();
  if (texto.length === 0) {
    return {
      reply: null,
      proposals: [],
      cuota: null,
      conversationId: null,
      error: 'Escribe algo primero.',
    };
  }
  if (texto.length > 2000) {
    return {
      reply: null,
      proposals: [],
      cuota: null,
      conversationId: null,
      error: 'El mensaje no puede pasar de 2 000 caracteres.',
    };
  }

  try {
    const resultado = await api.post<AssistantChatResult>(`/projects/${projectId}/assistant/chat`, {
      message: texto,
      ...(conversationId ? { conversationId } : {}),
    });

    /* Contra el `data`, no contra el status: un 200 con el cuerpo vacío es la
       forma en que este backend ha fallado antes. */
    if (!resultado?.reply) {
      return {
        reply: null,
        proposals: [],
        cuota: resultado?.cuota ?? null,
        conversationId: resultado?.conversationId ?? null,
        error: 'El asistente no ha respondido nada.',
      };
    }

    return {
      reply: resultado.reply,
      proposals: resultado.proposals ?? [],
      cuota: resultado.cuota ?? null,
      conversationId: resultado.conversationId ?? null,
      error: null,
    };
  } catch (error) {
    return {
      reply: null,
      proposals: [],
      conversationId: null,
      /* En el 429 la cuota viaja en el error: el contador tiene que quedar en
         el tope, no en el número de antes de intentarlo. */
      cuota: cuotaDelError(error),
      error: describe(error, 'El asistente no ha podido responder. Inténtalo otra vez.'),
    };
  }
}

/** Mis conversaciones en este proyecto, la última movida arriba. */
export async function conversacionesAction(projectId: string): Promise<ConversacionResumen[]> {
  const api = await requireApi();
  if (!api) return [];
  return api
    .get<ConversacionResumen[]>(`/projects/${projectId}/assistant/conversations`)
    .catch(() => []);
}

/** Una conversación entera, para volver a pintarla. */
export async function cargarConversacionAction(
  projectId: string,
  conversationId: string,
): Promise<ConversacionCompleta | null> {
  const api = await requireApi();
  if (!api) return null;
  return api
    .get<ConversacionCompleta>(`/projects/${projectId}/assistant/conversations/${conversationId}`)
    .catch(() => null);
}

export async function renombrarConversacionAction(
  projectId: string,
  conversationId: string,
  title: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  const limpio = title.trim().slice(0, 60);
  if (limpio.length === 0) return { error: 'El título no puede estar vacío.' };

  try {
    await api.patch(`/projects/${projectId}/assistant/conversations/${conversationId}`, {
      title: limpio,
    });
    return { error: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo renombrar.') };
  }
}

export async function borrarConversacionAction(
  projectId: string,
  conversationId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/projects/${projectId}/assistant/conversations/${conversationId}`);
    return { error: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo borrar la conversación.') };
  }
}

/**
 * Anota qué se decidió sobre una propuesta.
 *
 * ⚠️ **Esto no aplica nada.** Solo deja constancia, para que al releer el hilo
 * dentro de una semana no vuelva a ofrecer un botón que ya se pulsó.
 *
 * Se llama **después** de que la acción de verdad haya salido bien: al revés,
 * un fallo del gateway dejaría una propuesta marcada como aceptada sin que se
 * hubiera creado nada, que es peor que no marcarla.
 *
 * Falla en silencio a propósito. Que no se pueda anotar el estado no es motivo
 * para decirle a alguien que su tarea no se creó, cuando sí se creó: el peor
 * caso es una tarjeta que sigue ofreciendo su botón, y ese botón vuelve a pasar
 * por el gateway con sus permisos.
 */
export async function resolverPropuestaAction(
  projectId: string,
  proposalId: string,
  status: 'ACCEPTED' | 'DISCARDED',
): Promise<void> {
  const api = await requireApi();
  if (!api) return;
  await api
    .post(`/projects/${projectId}/assistant/proposals/${proposalId}/resolve`, { status })
    .catch(() => null);
}

/** Cuánta cuota queda. La pide la página al cargar, antes de escribir nada. */
export async function cuotaAction(projectId: string): Promise<AssistantQuota | null> {
  const api = await requireApi();
  if (!api) return null;
  return api.get<AssistantQuota>(`/projects/${projectId}/assistant/quota`).catch(() => null);
}

export interface AceptarTareaState {
  error: string | null;
  creada: { id: string; title: string; boardId: string } | null;
}

/**
 * Crear de verdad la tarea que se propuso.
 *
 * Dos cosas se resuelven **aquí y no en el chat**, y las dos por el mismo
 * motivo —que la propuesta ha pasado por el navegador—:
 *
 * - **el tablero**, que la propuesta no trae: se busca la columna en el
 *   proyecto de verdad, y de paso eso confirma que la columna sigue existiendo;
 * - **`status`**, que tiene que igualar el nombre de la columna destino
 *   (trampa del contrato) y se toma del proyecto, no de lo que diga el modelo.
 */
export async function aceptarTareaAction(
  projectId: string,
  propuesta: PropuestaTarea,
): Promise<AceptarTareaState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', creada: null };

  const title = String(propuesta.title ?? '').trim();
  if (title.length === 0) return { error: 'La tarea necesita un título.', creada: null };
  if (title.length > 120) {
    return { error: 'El título no puede superar 120 caracteres.', creada: null };
  }

  const project = await api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null);
  const columna = (project?.workspaces ?? [])
    .flatMap((workspace) => workspace.boards ?? [])
    .flatMap((board) => (board.columns ?? []).map((column) => ({ column, board })))
    .find(({ column }) => column.id === propuesta.columnId);

  if (!columna) {
    return { error: 'La columna de la propuesta ya no existe en el tablero.', creada: null };
  }

  try {
    const created = await api.post<Task>(`/boards/${columna.board.id}/tasks`, {
      columnId: columna.column.id,
      title,
      /* El nombre de la columna, no el que venga en la propuesta. */
      status: columna.column.name,
      ...(propuesta.description && { description: propuesta.description }),
      ...(propuesta.dueDate && { dueDate: toIsoDueDate(propuesta.dueDate) }),
      ...(propuesta.priority && { priority: propuesta.priority }),
      ...(propuesta.assigneeIds?.length && { assigneeIds: propuesta.assigneeIds }),
      ...(propuesta.labelIds?.length && { labelIds: propuesta.labelIds }),
    });

    if (!created?.id || created.title !== title) {
      return { error: 'El servidor no guardó la tarea.', creada: null };
    }

    return {
      error: null,
      creada: { id: created.id, title: created.title, boardId: columna.board.id },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la tarea.'), creada: null };
  }
}

export interface AceptarAsignacionState {
  error: string | null;
  asignada: { id: string; title: string; boardId: string; cuantos: number } | null;
}

/**
 * Cambiar quién lleva una tarea que ya existe.
 *
 * El `taskId` ya lo validó el servicio contra su inventario, pero se vuelve a
 * traer la tarea igualmente: **la propuesta ha pasado por el navegador**. Entre
 * proponer y aceptar la tarea puede haberse borrado, y nada impide que llegue un
 * id manipulado. Comprobar que es de **este** proyecto evita además un 403 del
 * gateway, que se leería como un fallo de permisos de quien acepta y no lo es.
 *
 * (Hubo un tiempo en que el id lo escribía la persona a mano en el chat, porque
 * los ids no viajaban en el contexto. Ya no: ver `task_inventory`.)
 */
export async function aceptarAsignacionAction(
  projectId: string,
  propuesta: PropuestaAsignacion,
): Promise<AceptarAsignacionState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', asignada: null };

  const taskId = String(propuesta.taskId ?? '').trim();
  if (!taskId) return { error: 'La propuesta no dice qué tarea.', asignada: null };

  const tarea = await api.get<Task>(`/tasks/${taskId}`).catch(() => null);
  if (!tarea?.id) {
    return { error: 'Esa tarea no existe. Comprueba el id que le diste.', asignada: null };
  }
  if (tarea.projectId !== projectId) {
    return { error: 'Esa tarea es de otro proyecto.', asignada: null };
  }

  const assigneeIds = propuesta.assigneeIds ?? [];

  try {
    /* La lista completa sustituye a la que hubiera: es la semántica de
       `assigneeIds` en todo el contrato, y es también lo que se le declaró al
       modelo. */
    const guardada = await api.post<Task>(`/tasks/${taskId}/assign`, { assigneeIds });

    const quedan = (guardada?.assignees ?? []).map((asignado) => asignado.userId);
    if (!guardada?.id || quedan.length !== assigneeIds.length) {
      return { error: 'El servidor no guardó los encargados.', asignada: null };
    }

    return {
      error: null,
      asignada: {
        id: guardada.id,
        title: guardada.title,
        boardId: guardada.boardId,
        cuantos: quedan.length,
      },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar el encargado.'), asignada: null };
  }
}

/**
 * El resultado común de las cuatro acciones que tocan una tarea existente.
 *
 * `hecha` trae lo que hace falta para confirmar en pantalla y enlazar al
 * tablero. Es la misma forma en las cuatro para que la tarjeta no tenga que
 * saber cuál de ellas la ha llamado.
 */
export interface AceptarSobreTareaState {
  error: string | null;
  hecha: { id: string; title: string; boardId: string; detalle: string } | null;
}

/**
 * Trae la tarea y comprueba que es de este proyecto.
 *
 * Lo hacen las cuatro antes de escribir nada. El `taskId` ya lo validó el
 * servicio contra su inventario, pero **la propuesta ha pasado por el
 * navegador**: entre que se propuso y se acepta, la tarea puede haberse
 * borrado, y nada impide que llegue un id manipulado. Sin esta comprobación un
 * id de otro proyecto daría un 403 del gateway, que se leería como un fallo de
 * permisos de quien acepta y no lo es.
 */
async function tareaDelProyecto(
  api: NonNullable<Awaited<ReturnType<typeof requireApi>>>,
  projectId: string,
  taskId: string,
): Promise<{ tarea: Task } | { error: string }> {
  if (!taskId) return { error: 'La propuesta no dice qué tarea.' };

  const tarea = await api.get<Task>(`/tasks/${taskId}`).catch(() => null);
  if (!tarea?.id) return { error: 'Esa tarea ya no existe.' };
  if (tarea.projectId !== projectId) return { error: 'Esa tarea es de otro proyecto.' };

  return { tarea };
}

/**
 * Editar los datos de una tarea que ya existe.
 *
 * Va a `PATCH /tasks/:id`, que pide `canEditTask` — el mismo endpoint y el
 * mismo permiso que el formulario del diálogo de tarea.
 *
 * **Solo se mandan los campos que la propuesta trae.** Omitir un campo en el
 * `PATCH` lo deja como estaba, y mandarlo vacío lo borra: no es lo mismo, y por
 * eso la propuesta distingue «no lo cambia» de «lo deja vacío» en vez de
 * rellenar huecos con lo que ya hubiera.
 */
export async function aceptarEdicionAction(
  projectId: string,
  propuesta: PropuestaEdicion,
): Promise<AceptarSobreTareaState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecha: null };

  const encontrada = await tareaDelProyecto(api, projectId, String(propuesta.taskId ?? '').trim());
  if ('error' in encontrada) return { error: encontrada.error, hecha: null };

  const title = propuesta.title?.trim();
  if (title !== undefined && (title.length === 0 || title.length > 120)) {
    return { error: 'El título tiene que tener entre 1 y 120 caracteres.', hecha: null };
  }

  const cuerpo: Record<string, unknown> = {};
  if (title !== undefined) cuerpo.title = title;
  if (propuesta.description !== undefined) cuerpo.description = propuesta.description;
  if (propuesta.priority !== undefined) cuerpo.priority = propuesta.priority;
  if (propuesta.dueDate !== undefined) cuerpo.dueDate = toIsoDueDate(propuesta.dueDate);
  if (propuesta.labelIds !== undefined) cuerpo.labelIds = propuesta.labelIds;

  if (Object.keys(cuerpo).length === 0) {
    return { error: 'La propuesta no cambia nada.', hecha: null };
  }

  try {
    const guardada = await api.patch<Task>(`/tasks/${encontrada.tarea.id}`, cuerpo);
    /* Se confirma contra el `data`, no contra el status: la trampa nº 3 del
       backend, que devolvía 200 sin guardar nada. */
    if (!guardada?.id) return { error: 'El servidor no guardó el cambio.', hecha: null };

    return {
      error: null,
      hecha: {
        id: guardada.id,
        title: guardada.title,
        boardId: guardada.boardId,
        detalle: 'Tarea actualizada.',
      },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo editar la tarea.'), hecha: null };
  }
}

/**
 * Mover una tarea a otra columna.
 *
 * Va a `POST /tasks/:id/move`, **no** a `PATCH /tasks/:id`. Los dos mueven,
 * pero el `PATCH` pide `canEditTask` y este pide `canMoveTask`: usar el otro
 * dejaría fuera precisamente al perfil para el que existe esta herramienta —
 * quien ejecuta el trabajo y puede decir que lo terminó sin poder redefinirlo.
 *
 * `status` sale del proyecto de verdad y no de la propuesta: el contrato exige
 * que iguale el nombre de la columna destino.
 */
export async function aceptarMovimientoAction(
  projectId: string,
  propuesta: PropuestaMovimiento,
): Promise<AceptarSobreTareaState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecha: null };

  const encontrada = await tareaDelProyecto(api, projectId, String(propuesta.taskId ?? '').trim());
  if ('error' in encontrada) return { error: encontrada.error, hecha: null };

  const project = await api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null);
  const columna = (project?.workspaces ?? [])
    .flatMap((workspace) => workspace.boards ?? [])
    .flatMap((board) => board.columns ?? [])
    .find((column) => column.id === propuesta.columnId);

  if (!columna) {
    return { error: 'La columna de la propuesta ya no existe en el tablero.', hecha: null };
  }

  try {
    const movida = await api.post<Task>(`/tasks/${encontrada.tarea.id}/move`, {
      columnId: columna.id,
      status: columna.name,
    });

    if (movida?.columnId !== columna.id) {
      return { error: 'El servidor no movió la tarea.', hecha: null };
    }

    return {
      error: null,
      hecha: {
        id: movida.id,
        title: movida.title,
        boardId: movida.boardId,
        detalle: `Movida a «${columna.name}».`,
      },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo mover la tarea.'), hecha: null };
  }
}

/**
 * Añadir pasos al checklist de una tarea.
 *
 * ⚠️ **`POST /tasks/:taskId/checklists` crea un paso por llamada**, así que
 * esto son N peticiones y no una. Van en **secuencia y no en paralelo** porque
 * el `order` de cada paso es su posición: lanzadas a la vez, el orden en que
 * llegan al servidor decide el orden en pantalla, y no tiene por qué ser el que
 * propuso el modelo.
 *
 * Si una falla a mitad, las anteriores **ya están creadas**: no hay transacción
 * que abarque varias peticiones HTTP. Se dice cuántas entraron en vez de fingir
 * que no pasó nada, que es lo único honesto que se puede hacer aquí.
 */
export async function aceptarChecklistAction(
  projectId: string,
  propuesta: PropuestaChecklist,
): Promise<AceptarSobreTareaState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecha: null };

  const encontrada = await tareaDelProyecto(api, projectId, String(propuesta.taskId ?? '').trim());
  if ('error' in encontrada) return { error: encontrada.error, hecha: null };

  const { tarea } = encontrada;
  const pasos = (propuesta.items ?? []).map((paso) => String(paso).trim()).filter(Boolean);
  if (pasos.length === 0) return { error: 'La propuesta no trae ningún paso.', hecha: null };

  /* Detrás de los que ya tenga: los pasos se suman, no sustituyen. */
  const desde = (tarea.checklists ?? []).length;
  let creados = 0;

  try {
    for (const [indice, text] of pasos.entries()) {
      await api.post(`/tasks/${tarea.id}/checklists`, { text, order: desde + indice });
      creados += 1;
    }
  } catch (error) {
    if (creados === 0) {
      return { error: describe(error, 'No se pudo añadir el checklist.'), hecha: null };
    }
    return {
      error: `Se añadieron ${creados} de ${pasos.length} pasos antes de fallar.`,
      hecha: null,
    };
  }

  return {
    error: null,
    hecha: {
      id: tarea.id,
      title: tarea.title,
      boardId: tarea.boardId,
      detalle: creados === 1 ? 'Se añadió 1 paso.' : `Se añadieron ${creados} pasos.`,
    },
  };
}

/**
 * Publicar un comentario en una tarea.
 *
 * Va a `POST /tasks/:taskId/comments`, que pide `canComment`. El autor sale del
 * token, así que **el comentario queda a nombre de quien acepta**, no del
 * asistente: es lo que se le dice al modelo al declararle la herramienta, y es
 * la razón por la que la tarjeta tiene que enseñar el texto entero antes de
 * publicarlo. Nadie debería firmar algo que no ha leído.
 */
export async function aceptarComentarioAction(
  projectId: string,
  propuesta: PropuestaComentario,
): Promise<AceptarSobreTareaState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecha: null };

  const encontrada = await tareaDelProyecto(api, projectId, String(propuesta.taskId ?? '').trim());
  if ('error' in encontrada) return { error: encontrada.error, hecha: null };

  const body = String(propuesta.body ?? '').trim();
  if (body.length === 0) return { error: 'El comentario está vacío.', hecha: null };

  try {
    const creado = await api.post<{ id: string }>(`/tasks/${encontrada.tarea.id}/comments`, {
      body,
    });
    if (!creado?.id) return { error: 'El servidor no guardó el comentario.', hecha: null };

    return {
      error: null,
      hecha: {
        id: encontrada.tarea.id,
        title: encontrada.tarea.title,
        boardId: encontrada.tarea.boardId,
        detalle: 'Comentario publicado.',
      },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo publicar el comentario.'), hecha: null };
  }
}

/**
 * `YYYY-MM-DD` → ISO al final de ese día.
 *
 * Igual que en el tablero: una fecha de vencimiento se cumple **durante** el día,
 * no a las 00:00. Sin esto, «para el viernes» vence el jueves por la noche.
 */
function toIsoDueDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}
