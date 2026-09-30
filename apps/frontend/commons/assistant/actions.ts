'use server';

import type {
  AssignmentProposal,
  AutomationProposal,
  AutomationStateProposal,
  AssistantChatResult,
  AssistantQuota,
  BoardProposal,
  CheckStepsProposal,
  ChecklistProposal,
  CommentProposal,
  ConversationSummary,
  DocumentProposal,
  DeleteProposal,
  EditProposal,
  FullConversation,
  MoveProposal,
  PlanningProposal,
  PrivateMessageProposal,
  SprintProposal,
  StartSprintProposal,
  TaskBatchProposal,
  DeleteBatchProposal,
  TaskProposal,
} from '../api/assistant';
import type {
  Board,
  Column,
  ProjectDetail,
  ProjectTemplate,
  Task,
  TemplateResult,
  Workspace,
} from '../api/domain';
import { PRAX_TIMEOUT_MS } from '../api/timeout';
import { loadPrivateChrome } from '../auth/nav';
import { getSession } from '../auth/session';
import type { QuotaExceededDetails } from '../billing/planes';
import { detallesDeCuota } from '../billing/planes';
import { aplicarPlantilla } from '../template/apply';
import { conversationIdDelError, cuotaDelError, describe, requireApi } from './helpers';

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
 * | `aceptarMarcarPasosAction` | `POST /tasks/:id/checklists/:item/toggle` | `canMoveTask` |
 * | `aceptarMensajeAction` | `POST /projects/:id/chat/messages` | `canComment` |
 * | `aceptarBorradoAction` | `DELETE /tasks/:id` | `canDeleteTask` |
 * | `aceptarTableroAction` | `POST /workspaces/:id/boards` + `/columns` | `canCreateBoard` + `canCreateColumn` |
 *
 * No se abre ninguna vía de escritura nueva: sin `canCreateTask`, aceptar falla
 * igual que le fallaría a esa persona pulsando el botón a mano.
 *
 * ⚠️ **La última entró el 2026-08-18 y es la única que no se deshace.** Durante
 * meses no existió, y el argumento era que el asistente no debía poder destruir
 * nada. No se sostenía: la regla de la casa es «propone; ejecuta el código que ya
 * existe», y borrar la cumple igual que crear — esta acción llama al mismo
 * endpoint que el botón del diálogo de tarea, con la sesión y los permisos de
 * quien acepta. Lo que sí cambia es la **interfaz**: la tarjeta de un borrado
 * lleva confirmación propia, aspecto destructivo y el inventario de lo que se
 * lleva por delante. Ver `DeleteProposalCard`.
 *
 * ## Por qué esto vive en `commons` y no en una zona
 *
 * Porque lo usaban **dos**: `assistant-front` —donde la conversación es toda la
 * pantalla— y `reports-front`, donde era un panel al lado de los gráficos.
 * Duplicar novecientas líneas de acciones que llaman a endpoints con permisos
 * delicados es duplicar el sitio donde se puede colar un fallo de autorización.
 *
 * ⚠️ Que hoy quede **uno** —`reports-front` se archivó en F1 de
 * PLAN-FUSION-ZONAS— no devuelve estas acciones a la zona: la fusión va justo en
 * la dirección contraria, y a partir de F8 la conversación se abre desde varias
 * pantallas de la misma aplicación.
 *
 * ⚠️ **`aceptarGraficoAction` NO está aquí**, y era la única que se quedaba en
 * `reports-front`. Escribía en el lienzo, así que necesitaba el catálogo de
 * widgets de aquella zona y revalidaba *su* página. Llegaba a la conversación
 * **inyectada por props**; desde que no hay lienzo no la inyecta nadie, y la
 * tarjeta lo dice en vez de ofrecer un botón que no llevaría a ninguna parte.
 *
 * ⚠️ **Nada de lo que llega aquí desde el chat es de fiar**, y no hace falta que
 * lo sea: la propuesta viaja por el navegador, así que el `columnId` se vuelve a
 * resolver contra el proyecto de verdad y el permiso lo comprueba el gateway.
 *
 * Comprueban la sesión por su cuenta, como las del tablero: una Server Function
 * viaja como POST a la ruta donde se usa y un cambio de `matcher` en `proxy.ts`
 * podría dejarla fuera del guard.
 *
 * ⚠️ **Ninguna llama a `revalidatePath`, y es a propósito.** Lo que cambian
 * —una tarea, un comentario, un mensaje del chat— vive en **otra zona**, que no
 * comparte caché con la que está pintando la conversación. Revalidar aquí solo
 * conseguiría volver a renderizar la pantalla actual para no cambiar ni un píxel
 * de lo que se está viendo.
 *
 * Y ahora que esto es compartido hay un motivo más fuerte: **desde aquí no se
 * sabe en qué zona se está**, así que cualquier ruta que se pasara a
 * `revalidatePath` sería correcta como mucho en una de las dos.
 */

export interface RespuestaChat {
  reply: string | null;
  /** Lo que costó el turno en tokens (D9). Solo si salió bien. */
  uso?: AssistantChatResult['uso'];
  /** Los pasos que dio PRAX. Solo si salió bien. */
  pensamiento?: AssistantChatResult['pensamiento'];
  proposals: AssistantChatResult['proposals'];
  /** Siempre que se pueda saber: también cuando el turno falla por cuota. */
  cuota: AssistantQuota | null;
  /** La conversación en la que cayó el turno. El cliente lo guarda para el siguiente. */
  conversationId: string | null;
  error: string | null;
  /**
   * El detalle del 402 cuando se acabaron los mensajes del mes.
   *
   * ⚠️ **Es otra cosa que `cuota`**, aunque las dos hablen de lo mismo. `cuota`
   * es el contador —para que la barra quede en el tope y no en el número de
   * antes de intentarlo— y esto es el **fallo**, con el plan dentro, que es lo
   * que permite ofrecer la salida. Sin él, quedarse sin mensajes en mitad de
   * una conversación es una frase roja y un callejón.
   */
  topeAgotado: QuotaExceededDetails | null;
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
  /**
   * De qué proyecto se habla, o **`null` para hablar sin ninguno**.
   *
   * ⚠️ Es lo que elige la ruta, y las dos existen por un motivo distinto: la de
   * proyecto pasa por `ProjectPermissionGuard` y trae briefing, gente y las doce
   * herramientas; la de `/me` no tiene contra qué comprobar permisos y trae tres.
   * Mandar `null` a la primera sería `/projects/null/assistant/chat`, que es un
   * 400 con un mensaje sobre UUIDs que no dice nada de lo que pasó.
   */
  projectId: string | null,
  message: string,
  conversationId?: string,
  attachmentIds?: string[],
): Promise<RespuestaChat> {
  const api = await requireApi();
  if (!api) {
    return {
      reply: null,
      proposals: [],
      cuota: null,
      topeAgotado: null,
      conversationId: null,
      error: 'Tu sesión ha caducado.',
    };
  }

  const texto = message.trim();
  /**
   * ⚠️ **También con archivos hace falta texto.**
   *
   * El DTO exige `message`, así que mandar solo un adjunto devolvía un
   * «Validation failed» que no dice qué falta. Y la regla es buena: un PDF sin
   * pregunta obliga al modelo a adivinar si lo resume, lo critica o saca tareas
   * de él.
   */
  if (texto.length === 0) {
    return {
      reply: null,
      proposals: [],
      cuota: null,
      topeAgotado: null,
      conversationId: null,
      error:
        (attachmentIds ?? []).length > 0
          ? 'Escribe qué quieres que haga PRAX con el archivo.'
          : 'Escribe algo primero.',
    };
  }
  if (texto.length > 2000) {
    return {
      reply: null,
      proposals: [],
      cuota: null,
      topeAgotado: null,
      conversationId: null,
      error: 'El mensaje no puede pasar de 2 000 caracteres.',
    };
  }

  try {
    const ruta = projectId ? `/projects/${projectId}/assistant/chat` : '/me/assistant/chat';

    /* 🔴 **Sin proyecto hay que decir desde qué organización se pregunta.** El
       tope de IA lo pone su plan y el gasto se cuenta con esa clave, así que
       omitirlo cobraría el mensaje en la personal —gratuita— aunque se esté
       trabajando en el equipo que paga.

       ⚠️ **Y es la resuelta, no la cookie en crudo.** Estaba en
       `getOrganizacionActiva()`, que devuelve lo que puso el navegador sin
       comprobar: si la cookie apunta a una organización de la que ya te fueron,
       la barra lateral repliega a la personal —`resolverOrganizacionActiva`— y
       esto seguía mandando la vieja. El gateway respondía `403 NOT_IN_ORG` y en
       pantalla solo se leía que PRAX no había contestado, con el selector
       diciendo otra cosa. `loadPrivateChrome()` es donde ese repliegue ya está
       hecho, y no cuesta una petición más: la lista de organizaciones se pide
       igualmente en cada carga.

       Sigue sin ser una llave: el gateway comprueba la pertenencia antes de
       usarla (`QuotaService.organizacionElegida`). Es un filtro, como siempre.

       En la ruta de proyecto la organización sale del propio proyecto, que es
       lo que no se puede falsificar; allí se manda solo para que el gateway
       compruebe que ese proyecto es de la activa (D6 de
       docs/PLAN-PRAX-SEMIAGENTICO.md): hablar desde una organización de un
       proyecto de otra da 403 `NOT_IN_ORG`. */
    const organizationId = (await loadPrivateChrome()).organizacionActivaId;

    const resultado = await api.post<AssistantChatResult>(
      ruta,
      {
        message: texto,
        ...(conversationId ? { conversationId } : {}),
        ...(organizationId ? { organizationId } : {}),
        /* 🔴 **Solo los ids, nunca los bytes.** Esto viaja por una Server Action,
         cuyo cuerpo está topado en 1 MB: con el archivo dentro, cualquier foto
         de teléfono moría con un «Body exceeded 1 MB limit» de Next, sin
         traducir y sin decir qué archivo. Los bytes ya se subieron aparte.

         Y solo si los hay: un campo de más es un 400 (CLAUDE.md). */
        ...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : {}),
      },
      { plazoMs: PRAX_TIMEOUT_MS },
    );

    /* Contra el `data`, no contra el status: un 200 con el cuerpo vacío es la
       forma en que este backend ha fallado antes. */
    if (!resultado?.reply) {
      return {
        reply: null,
        proposals: [],
        cuota: resultado?.cuota ?? null,
        topeAgotado: null,
        conversationId: resultado?.conversationId ?? null,
        error: 'El asistente no ha respondido nada.',
      };
    }

    return {
      reply: resultado.reply,
      proposals: resultado.proposals ?? [],
      cuota: resultado.cuota ?? null,
      topeAgotado: null,
      conversationId: resultado.conversationId ?? null,
      error: null,
      ...(resultado.uso ? { uso: resultado.uso } : {}),
    };
  } catch (error) {
    return {
      reply: null,
      proposals: [],
      conversationId: conversationIdDelError(error),
      /* En el 402 la cuota viaja en el error: el contador tiene que quedar en
         el tope, no en el número de antes de intentarlo. */
      cuota: cuotaDelError(error),
      topeAgotado: detallesDeCuota(error),
      error: describe(error, 'El asistente no ha podido responder. Inténtalo otra vez.'),
    };
  }
}

/**
 * **Mis** conversaciones, la última movida arriba.
 *
 * ⚠️ **Ya no van bajo `/projects/:id`.** Una conversación es de la persona y el
 * proyecto es el foco de cada turno, que puede cambiar a mitad: con la ruta
 * anterior, pedir un hilo que había pasado por otro proyecto daba 404. Y el
 * historial estaba partido en tantas listas como proyectos tuvieras, así que para
 * encontrar aquella conversación de la semana pasada había que acordarse primero
 * de sobre qué proyecto fue.
 *
 * Lo que las protege sigue siendo el `userId` del token, no el permiso de
 * proyecto — que nunca las protegió: siendo del proyecto, con él cualquier
 * compañero del mismo rol habría podido leerlas.
 */
export async function conversacionesAction(): Promise<ConversationSummary[]> {
  const api = await requireApi();
  if (!api) return [];
  /* Solo las de la organización activa (D6): las de otra no se continúan, así
     que ofrecerlas sería ofrecer un 403. */
  return api
    .get<ConversationSummary[]>(`/me/assistant/conversations${await conOrganizacion()}`)
    .catch(() => []);
}

/** `?organizationId=<activa>`, la resuelta y no la cookie en crudo (trampa 21). */
async function conOrganizacion(): Promise<string> {
  const { organizacionActivaId } = await loadPrivateChrome();
  return organizacionActivaId ? `?organizationId=${organizacionActivaId}` : '';
}

/** Una conversación entera, para volver a pintarla. */
export async function cargarConversacionAction(
  conversationId: string,
): Promise<FullConversation | null> {
  const api = await requireApi();
  if (!api) return null;
  return api
    .get<FullConversation>(
      `/me/assistant/conversations/${conversationId}${await conOrganizacion()}`,
    )
    .catch(() => null);
}

export async function renombrarConversacionAction(
  conversationId: string,
  title: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  const limpio = title.trim().slice(0, 60);
  if (limpio.length === 0) return { error: 'El título no puede estar vacío.' };

  try {
    await api.patch(`/me/assistant/conversations/${conversationId}`, { title: limpio });
    return { error: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo renombrar.') };
  }
}

export async function borrarConversacionAction(
  conversationId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/me/assistant/conversations/${conversationId}`);
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
  /** `null` en una conversación sin foco: la ruta de proyecto daría 404. */
  projectId: string | null,
  proposalId: string,
  status: 'ACCEPTED' | 'DISCARDED',
): Promise<void> {
  const api = await requireApi();
  if (!api) return;
  const ruta = projectId
    ? `/projects/${projectId}/assistant/proposals/${proposalId}/resolve`
    : `/me/assistant/proposals/${proposalId}/resolve`;
  await api.post(ruta, { status }).catch(() => null);
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
  propuesta: TaskProposal,
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
      ...(typeof propuesta.estimatePoints === 'number' && {
        estimatePoints: propuesta.estimatePoints,
      }),
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

export interface AceptarLoteState {
  error: string | null;
  creadas: number;
  fallidas: string[];
  boardId: string | null;
}

/**
 * Crear un lote de tareas propuesto por PRAX (`proponer_tareas`).
 *
 * Una a una y **en orden**, por el mismo `POST /boards/:id/tasks` del «+» de la
 * columna: así cada una pasa la validación y los permisos de siempre, y el orden
 * del backlog de origen se conserva. El proyecto se lee una vez para resolver la
 * columna y su tablero, no una vez por tarea.
 *
 * No se para al primer fallo: si una no entra (un título raro, un límite), las
 * demás sí, y se dice cuáles faltaron. Reintentar el lote entero las duplicaría.
 */
export async function aceptarLoteDeTareasAction(
  projectId: string,
  propuesta: TaskBatchProposal,
): Promise<AceptarLoteState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', creadas: 0, fallidas: [], boardId: null };

  const project = await api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null);
  const columna = (project?.workspaces ?? [])
    .flatMap((workspace) => workspace.boards ?? [])
    .flatMap((board) => (board.columns ?? []).map((column) => ({ column, board })))
    .find(({ column }) => column.id === propuesta.columnId);
  if (!columna) {
    return {
      error: 'La columna de la propuesta ya no existe en el tablero.',
      creadas: 0,
      fallidas: [],
      boardId: null,
    };
  }

  let creadas = 0;
  const fallidas: string[] = [];
  for (const tarea of propuesta.tareas) {
    const title = String(tarea.title ?? '')
      .trim()
      .slice(0, 120);
    if (!title) continue;
    try {
      const creada = await api.post<Task>(`/boards/${columna.board.id}/tasks`, {
        columnId: columna.column.id,
        title,
        status: columna.column.name,
        ...(tarea.description && { description: tarea.description }),
        ...(tarea.priority && { priority: tarea.priority }),
        ...(typeof tarea.estimatePoints === 'number' && { estimatePoints: tarea.estimatePoints }),
        /* `null` explícito = backlog del tablero (D12 de PLAN-SCRUM-KANBAN). */
        ...(propuesta.alBacklog && { sprintId: null }),
      });
      if (creada?.id) creadas += 1;
      else fallidas.push(title);
    } catch {
      fallidas.push(title);
    }
  }

  return {
    error: creadas === 0 ? 'No se pudo crear ninguna tarea.' : null,
    creadas,
    fallidas,
    boardId: columna.board.id,
  };
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
  propuesta: AssignmentProposal,
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
  propuesta: EditProposal,
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
  if (propuesta.estimatePoints !== undefined) {
    if (
      !Number.isInteger(propuesta.estimatePoints) ||
      propuesta.estimatePoints < 0 ||
      propuesta.estimatePoints > 999
    ) {
      return { error: 'Los puntos tienen que ser un entero de 0 a 999.', hecha: null };
    }
    cuerpo.estimatePoints = propuesta.estimatePoints;
  }

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
  propuesta: MoveProposal,
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
  propuesta: ChecklistProposal,
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
 * Marcar pasos del checklist como hechos.
 *
 * Va a `POST /tasks/:id/checklists/:item/toggle`, que pide **`canMoveTask`** y no
 * `canEditTask`: marcar un paso es decir que se hizo el trabajo, no redefinir en
 * qué consistía.
 *
 * ⚠️ **Se comprueba el estado real antes de alternar.** `toggle` invierte, así
 * que uno que ya estuviera hecho —porque alguien lo marcó entre la propuesta y
 * el clic— se **desmarcaría**. Eso convertiría una propuesta de «dar por hecho»
 * en deshacer trabajo ajeno, que es justo lo que el asistente no puede hacer.
 */
export async function aceptarMarcarPasosAction(
  projectId: string,
  propuesta: CheckStepsProposal,
): Promise<AceptarSobreTareaState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecha: null };

  const encontrada = await tareaDelProyecto(api, projectId, String(propuesta.taskId ?? '').trim());
  if ('error' in encontrada) return { error: encontrada.error, hecha: null };

  const { tarea } = encontrada;
  const pedidos = new Set((propuesta.itemIds ?? []).map((id: string) => String(id)));

  /* Solo los que siguen pendientes **ahora**, no cuando se propuso. */
  const porMarcar = (tarea.checklists ?? []).filter(
    (paso) => pedidos.has(paso.id) && !paso.completed,
  );

  if (porMarcar.length === 0) {
    return { error: 'Esos pasos ya estaban marcados.', hecha: null };
  }

  let marcados = 0;
  try {
    for (const paso of porMarcar) {
      await api.post(`/tasks/${tarea.id}/checklists/${paso.id}/toggle`, { completed: true });
      marcados += 1;
    }
  } catch (error) {
    if (marcados === 0) {
      return { error: describe(error, 'No se pudieron marcar los pasos.'), hecha: null };
    }
    return {
      error: `Se marcaron ${marcados} de ${porMarcar.length} pasos antes de fallar.`,
      hecha: null,
    };
  }

  return {
    error: null,
    hecha: {
      id: tarea.id,
      title: tarea.title,
      boardId: tarea.boardId,
      detalle: marcados === 1 ? 'Se marcó 1 paso.' : `Se marcaron ${marcados} pasos.`,
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
  propuesta: CommentProposal,
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
 * Borrar una tarea. **La única acción del asistente que no se deshace.**
 *
 * Va a `DELETE /tasks/:id`, que pide `canDeleteTask` — el mismo endpoint y el
 * mismo permiso que el botón de borrar del diálogo de tarea. No hay ninguna vía
 * nueva: si esta persona no puede borrarla a mano, esto responde el mismo 403.
 *
 * ## Las dos comprobaciones de más, y por qué solo aquí
 *
 * `tareaDelProyecto` ya confirma que la tarea existe y que es **de este
 * proyecto** —eso lo hacen las ocho— pero aquí importa el doble: la propuesta ha
 * viajado por el navegador, y un `taskId` cambiado a mano apuntando a otro
 * proyecto sería un borrado dirigido. La comprobación de `projectId` es lo que
 * lo corta antes de llegar al gateway; el gateway lo cortaría igual con su
 * permiso, pero aquí el mensaje se puede explicar.
 *
 * Y se devuelve **el título en el resultado**, no un enlace: en las demás la
 * tarjeta ofrece «verla en el tablero», y aquí ya no hay nada que ver. Decir qué
 * se borró es lo único que queda por decir.
 *
 * ⚠️ **No confirma nada.** La confirmación es de la interfaz —`DeleteProposalCard`
 * pide un segundo gesto— y meterla también aquí no añadiría seguridad: una
 * Server Action se puede invocar sin pasar por su tarjeta, y lo que protege eso
 * es el permiso del gateway, no un `confirm`.
 */
export async function aceptarBorradoAction(
  projectId: string,
  propuesta: DeleteProposal,
): Promise<{ error: string | null; borrada: { title: string } | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', borrada: null };

  const encontrada = await tareaDelProyecto(api, projectId, String(propuesta.taskId ?? '').trim());
  if ('error' in encontrada) return { error: encontrada.error, borrada: null };

  const { tarea } = encontrada;

  try {
    await api.delete(`/tasks/${tarea.id}`);
    /* Contra el `data` no se puede: un DELETE correcto no devuelve cuerpo. Aquí
       la ausencia de excepción **es** la confirmación, que es la única de las
       nueve donde eso vale — en las demás hay una entidad que comprobar. */
    return { error: null, borrada: { title: tarea.title } };
  } catch (error) {
    return { error: describe(error, 'No se pudo borrar la tarea.'), borrada: null };
  }
}

/**
 * Borrar un lote de tareas (`proponer_borrados`), una a una por
 * `DELETE /tasks/:id` —el mismo endpoint y el mismo permiso que el menú de la
 * tarea—. Cada una se comprueba antes contra el proyecto: la lista ha pasado
 * por el navegador. No se para al primer fallo; se dice cuáles no se borraron.
 */
export async function aceptarBorradosAction(
  projectId: string,
  propuesta: DeleteBatchProposal,
): Promise<{ error: string | null; borradas: number; fallidas: string[] }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', borradas: 0, fallidas: [] };

  let borradas = 0;
  const fallidas: string[] = [];
  for (const { taskId, taskTitle } of propuesta.tareas) {
    const encontrada = await tareaDelProyecto(api, projectId, String(taskId ?? '').trim());
    if ('error' in encontrada) {
      /* Ya no existe: para quien quería borrarla, es lo mismo. */
      if (encontrada.error === 'Esa tarea ya no existe.') borradas += 1;
      else fallidas.push(taskTitle);
      continue;
    }
    try {
      await api.delete(`/tasks/${encontrada.tarea.id}`);
      borradas += 1;
    } catch {
      fallidas.push(taskTitle);
    }
  }
  return {
    error: borradas === 0 ? 'No se pudo borrar ninguna tarea.' : null,
    borradas,
    fallidas,
  };
}

/**
 * Crear el tablero propuesto, con sus columnas.
 *
 * Llama a los **mismos tres endpoints y en el mismo orden** que la plantilla de
 * proyecto nuevo (`commons/template/apply.ts`), que lleva funcionando desde que
 * existe el asistente:
 *
 * | Paso | Endpoint | Permiso |
 * |---|---|---|
 * | El espacio, si no existe | `POST /projects/:id/workspaces` | `canEditBoard` |
 * | El tablero | `POST /workspaces/:id/boards` | `canCreateBoard` |
 * | Cada columna | `POST /boards/:id/columns` | `canCreateColumn` |
 * | El color de la columna | `PATCH /boards/:id/columns/:columnId` | `canEditColumn` |
 *
 * Ninguna ruta nueva, ninguna vía de escritura nueva.
 *
 * ## ⚠️ El espacio se resuelve contra el proyecto, no se cree
 *
 * La propuesta trae un **nombre** —el modelo no ve los ids— así que aquí se pide
 * el proyecto de verdad y se busca uno que se llame así, sin distinguir mayúsculas
 * ni acentos sobrantes de espacio. Solo se crea si de verdad no hay ninguno.
 * Fiarse del nombre a ciegas habría acabado en un espacio «General» duplicado
 * cada vez que alguien acepta.
 *
 * ## ⚠️ El color va en un `PATCH` aparte, y si falla no se pierde la columna
 *
 * `POST /boards/:id/columns` solo acepta `name` y `order`: un campo de más es un
 * 400. Y un color que no se pudo poner **no es una columna perdida** — la columna
 * está, le falta el color, y contarla como fallo diría que hay que rehacer algo
 * que ya está hecho.
 *
 * ## Fallar a mitad, y decirlo
 *
 * Si el tablero se crea y una columna no, no se deshace nada: no hay transacción
 * que abarque tres endpoints, y borrar lo ya creado para «dejarlo limpio» sería
 * destruir trabajo por un fallo de red. Se devuelve lo que se creó y lo que no,
 * y la tarjeta lo dice — el mismo criterio que la plantilla.
 */
export async function aceptarTableroAction(
  projectId: string,
  propuesta: BoardProposal,
): Promise<{
  error: string | null;
  creado: { boardId: string; nombre: string; columnas: number; fallos: string[] } | null;
}> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', creado: null };

  const nombreTablero = String(propuesta.nombre ?? '').trim();
  const nombreEspacio = String(propuesta.espacio ?? '').trim();
  const columnas = Array.isArray(propuesta.columnas) ? propuesta.columnas : [];
  if (!nombreTablero || columnas.length === 0) {
    return { error: 'La propuesta no dice qué tablero crear.', creado: null };
  }

  const fallos: string[] = [];

  try {
    const proyecto = await api.get<ProjectDetail>(`/projects/${projectId}`);

    /* El espacio: el que ya se llame así, o uno nuevo. Ver la nota de arriba. */
    const normalizar = (texto: string) => texto.trim().toLocaleLowerCase('es');
    let espacio = (proyecto.workspaces ?? []).find(
      (candidato) => normalizar(candidato.name) === normalizar(nombreEspacio),
    );

    if (!espacio) {
      espacio = await api.post<Workspace>(`/projects/${projectId}/workspaces`, {
        name: nombreEspacio || 'General',
      });
      if (!espacio?.id) return { error: 'El servidor no guardó el espacio.', creado: null };
    }

    const tablero = await api.post<Board>(`/workspaces/${espacio.id}/boards`, {
      name: nombreTablero,
    });
    /* Contra el `data`, no contra el status. */
    if (!tablero?.id) return { error: 'El servidor no guardó el tablero.', creado: null };

    let creadas = 0;
    for (const [orden, columna] of columnas.entries()) {
      const nombreColumna = String(columna.nombre ?? '').trim();
      if (!nombreColumna) continue;

      try {
        const creada = await api.post<Column>(`/boards/${tablero.id}/columns`, {
          name: nombreColumna,
          order: orden,
        });
        if (!creada?.id) {
          fallos.push(`La columna «${nombreColumna}» no se guardó.`);
          continue;
        }
        creadas += 1;

        if (columna.color) {
          await api
            .patch(`/boards/${tablero.id}/columns/${creada.id}`, { color: columna.color })
            /* La columna está; lo que falta es el color. No se cuenta como fallo
               de columna ni se avisa: sería ruido sobre algo cosmético. */
            .catch(() => null);
        }
      } catch (error) {
        fallos.push(`La columna «${nombreColumna}»: ${describe(error, 'no se pudo crear.')}`);
      }
    }

    return {
      error: null,
      creado: { boardId: tablero.id, nombre: tablero.name, columnas: creadas, fallos },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo crear el tablero.'), creado: null };
  }
}

/**
 * Un documento nuevo, con su contenido.
 *
 * `POST /workspaces/:id/documents` con `content` en Markdown —la única vez que el
 * contenido entra por REST (E4 de PLAN-DOCUMENTOS)—, y `canEditDocuments`. El
 * espacio va por nombre, como el del tablero: el de documentos que se llame así,
 * o uno nuevo. Nunca uno de tableros: el backend lo rechaza con 400 (D7).
 */
export async function aceptarDocumentoAction(
  projectId: string,
  propuesta: DocumentProposal,
): Promise<{ error: string | null; hecho: string | null; href?: string }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecho: null };

  const titulo = String(propuesta.titulo ?? '').trim();
  if (!titulo || titulo.length > 200) {
    return { error: 'El título tiene que tener entre 1 y 200 caracteres.', hecho: null };
  }
  const nombreEspacio = String(propuesta.espacio ?? '').trim() || 'Documentos';

  try {
    const proyecto = await api.get<ProjectDetail>(`/projects/${projectId}`);
    const normalizar = (texto: string) => texto.trim().toLocaleLowerCase('es');
    let espacio = (proyecto.workspaces ?? []).find(
      (candidato) =>
        candidato.kind === 'DOCUMENTS' && normalizar(candidato.name) === normalizar(nombreEspacio),
    );
    if (!espacio) {
      espacio = await api.post<Workspace>(`/projects/${projectId}/workspaces`, {
        name: nombreEspacio,
        kind: 'DOCUMENTS',
      });
      if (!espacio?.id) return { error: 'El servidor no guardó el espacio.', hecho: null };
    }

    const creado = await api.post<{ id: string; title: string }>(
      `/workspaces/${espacio.id}/documents`,
      { title: titulo, content: String(propuesta.contenido ?? '') },
    );
    if (!creado?.id) return { error: 'El servidor no guardó el documento.', hecho: null };
    return {
      error: null,
      hecho: `Se creó «${creado.title}» en ${espacio.name}.`,
      href: `/projects/${projectId}?tab=espacios&ws=${espacio.id}&doc=${creado.id}`,
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo crear el documento.'), hecho: null };
  }
}

/**
 * Una regla nueva, **pausada**.
 *
 * `POST /projects/:id/automations` con `canManageAutomations` y el cuerpo que ya
 * trae la propuesta. Nace `DISABLED` aunque el modelo pidiera otra cosa: una
 * regla que actúa sola sobre el trabajo del equipo no se enciende de rebote.
 */
export async function aceptarAutomatizacionAction(
  projectId: string,
  propuesta: AutomationProposal,
): Promise<{ error: string | null; hecho: string | null; href?: string }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecho: null };
  const nombre = String(propuesta.nombre ?? '').trim();
  if (!nombre || !Array.isArray(propuesta.actions) || propuesta.actions.length === 0) {
    return { error: 'La propuesta no trae una regla completa.', hecho: null };
  }
  try {
    const creada = await api.post<{ id: string; name: string; status: string }>(
      `/projects/${projectId}/automations`,
      {
        name: nombre.slice(0, 120),
        status: 'DISABLED',
        trigger: propuesta.trigger,
        conditions: propuesta.conditions ?? [],
        actions: propuesta.actions,
      },
    );
    if (!creada?.id) return { error: 'El servidor no guardó la regla.', hecho: null };
    return {
      error: null,
      hecho: `Se creó «${creada.name}», pausada. Enciéndela cuando quieras.`,
      href: `/projects/${projectId}?tab=automation`,
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la regla.'), hecho: null };
  }
}

/**
 * Encender o pausar una regla. La ruta pide la definición entera, así que se
 * lee y se reenvía con el estado cambiado, como el interruptor de la pestaña
 * (`toggleAutomationRuleAction`). Encender cuenta en el tope del plan: el 402
 * llega con su mensaje.
 */
export async function aceptarEstadoAutomatizacionAction(
  projectId: string,
  propuesta: AutomationStateProposal,
): Promise<{ error: string | null; hecho: string | null; href?: string }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecho: null };
  const siguiente = propuesta.activar ? 'ENABLED' : 'DISABLED';
  try {
    const regla = await api.get<{
      name: string;
      description?: string | null;
      trigger: { type: string; config: unknown };
      conditions: { field: string; operator: string; value: unknown }[];
      actions: { type: string; config: unknown }[];
    }>(`/projects/${projectId}/automations/${propuesta.reglaId}`);
    const guardada = await api.patch<{ status: string; name: string }>(
      `/projects/${projectId}/automations/${propuesta.reglaId}`,
      {
        name: regla.name,
        ...(regla.description != null && { description: regla.description }),
        status: siguiente,
        trigger: { type: regla.trigger.type, config: regla.trigger.config },
        conditions: regla.conditions.map(({ field, operator, value }) => ({
          field,
          operator,
          value,
        })),
        actions: regla.actions.map(({ type, config }) => ({ type, config })),
      },
    );
    if (guardada?.status !== siguiente) {
      return { error: 'El servidor no cambió el estado de la regla.', hecho: null };
    }
    return {
      error: null,
      hecho: `«${guardada.name}» está ${propuesta.activar ? 'encendida' : 'pausada'}.`,
      href: `/projects/${projectId}?tab=automation`,
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar la regla.'), hecho: null };
  }
}

/**
 * El tablero es de este proyecto y tiene Scrum.
 *
 * Mismo motivo que `tareaDelProyecto`: la propuesta ha pasado por el navegador,
 * y un id de otro proyecto daría un 403 que se leería como falta de permisos.
 */
async function tableroConScrum(
  api: NonNullable<Awaited<ReturnType<typeof requireApi>>>,
  projectId: string,
  tableroId: string,
): Promise<{ tablero: Board } | { error: string }> {
  const proyecto = await api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null);
  const tablero = (proyecto?.workspaces ?? [])
    .flatMap((espacio) => espacio.boards ?? [])
    .find((candidato) => candidato.id === tableroId);
  if (!tablero) return { error: 'Ese tablero ya no existe en este proyecto.' };
  if (!tablero.scrumEnabled) return { error: 'Ese tablero ya no trabaja con sprints.' };
  return { tablero };
}

/**
 * Un sprint nuevo, planeado y sin fechas.
 *
 * `POST /boards/:id/sprints`, que pide `canManageSprint` — el mismo que el «+»
 * de la franja del sprint.
 */
export async function aceptarSprintAction(
  projectId: string,
  propuesta: SprintProposal,
): Promise<{ error: string | null; hecho: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecho: null };

  const nombre = String(propuesta.nombre ?? '').trim();
  if (nombre.length < 2 || nombre.length > 100) {
    return { error: 'El nombre tiene que tener entre 2 y 100 caracteres.', hecho: null };
  }
  const encontrado = await tableroConScrum(api, projectId, String(propuesta.tableroId ?? ''));
  if ('error' in encontrado) return { error: encontrado.error, hecho: null };

  try {
    const meta = propuesta.meta?.trim();
    const creado = await api.post<{ id: string; name: string }>(
      `/boards/${encontrado.tablero.id}/sprints`,
      { name: nombre, ...(meta ? { goal: meta.slice(0, 500) } : {}) },
    );
    if (!creado?.id) return { error: 'El servidor no guardó el sprint.', hecho: null };
    return { error: null, hecho: `Se creó «${creado.name}» en ${encontrado.tablero.name}.` };
  } catch (error) {
    return { error: describe(error, 'No se pudo crear el sprint.'), hecho: null };
  }
}

/**
 * Empezar un sprint planeado con sus fechas.
 *
 * `POST /boards/:id/sprints/:sprintId/start`. El gateway rechaza empezarlo si el
 * tablero ya tiene uno en curso; el mensaje llega tal cual.
 */
export async function aceptarInicioSprintAction(
  projectId: string,
  propuesta: StartSprintProposal,
  /** `getTimezoneOffset()` del navegador: el día empieza y acaba en SU hora. */
  tzOffset = 0,
): Promise<{ error: string | null; hecho: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecho: null };

  const desde = String(propuesta.desde ?? '');
  const hasta = String(propuesta.hasta ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta <= desde) {
    return { error: 'Las fechas del sprint no son válidas.', hecho: null };
  }
  const encontrado = await tableroConScrum(api, projectId, String(propuesta.tableroId ?? ''));
  if ('error' in encontrado) return { error: encontrado.error, hecho: null };

  try {
    const empezado = await api.post<{ id: string; status: string; name: string }>(
      `/boards/${encontrado.tablero.id}/sprints/${propuesta.sprintId}/start`,
      /* Igual que `fechasDelFormulario` de la franja del sprint: principio y
         final del día en la hora de quien acepta, no en la del servidor. */
      {
        startDate: diaAIso(desde, '00:00:00.000', tzOffset),
        endDate: diaAIso(hasta, '23:59:59.999', tzOffset),
      },
    );
    /* Contra el `data`: el estado tiene que haber cambiado de verdad. */
    if (empezado?.status !== 'ACTIVE') {
      return { error: 'El servidor no empezó el sprint.', hecho: null };
    }
    return { error: null, hecho: `«${empezado.name}» está en curso.` };
  } catch (error) {
    return { error: describe(error, 'No se pudo empezar el sprint.'), hecho: null };
  }
}

/**
 * Repartir tareas entre backlog y sprint.
 *
 * - **Al sprint**: `POST /boards/:id/sprints/:sprintId/tasks`, en bloque y con
 *   `canManageSprint`, que es como lo hace el panel Backlog.
 * - **Al backlog**: `PATCH /tasks/:id` con `sprintId: null`, una a una, como
 *   «devolver al backlog» desde el tablero. Si alguna falla, se dice cuáles.
 */
export async function aceptarPlanificacionAction(
  projectId: string,
  propuesta: PlanningProposal,
): Promise<{ error: string | null; hecho: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecho: null };

  const taskIds = (Array.isArray(propuesta.taskIds) ? propuesta.taskIds : []).map(String);
  if (taskIds.length === 0) return { error: 'La propuesta no trae tareas.', hecho: null };
  const encontrado = await tableroConScrum(api, projectId, String(propuesta.tableroId ?? ''));
  if ('error' in encontrado) return { error: encontrado.error, hecho: null };

  try {
    if (propuesta.sprintId) {
      await api.post(`/boards/${encontrado.tablero.id}/sprints/${propuesta.sprintId}/tasks`, {
        taskIds,
      });
      return {
        error: null,
        hecho: `${taskIds.length} ${taskIds.length === 1 ? 'tarea entró' : 'tareas entraron'} en «${propuesta.sprint ?? 'el sprint'}».`,
      };
    }

    const fallidas: string[] = [];
    for (const id of taskIds) {
      const guardada = await api.patch<Task>(`/tasks/${id}`, { sprintId: null }).catch(() => null);
      if (!guardada?.id || guardada.projectId !== projectId) fallidas.push(id);
    }
    if (fallidas.length === taskIds.length) {
      return { error: 'No se pudo devolver ninguna tarea al backlog.', hecho: null };
    }
    const vueltas = taskIds.length - fallidas.length;
    return {
      error: null,
      hecho:
        `${vueltas} ${vueltas === 1 ? 'tarea volvió' : 'tareas volvieron'} al backlog.` +
        (fallidas.length > 0 ? ` ${fallidas.length} no se pudieron mover.` : ''),
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo repartir las tareas.'), hecho: null };
  }
}

/**
 * Enviar un mensaje al chat del equipo.
 *
 * Va a `POST /projects/:id/chat/messages`, que pide `canComment` — el mismo
 * permiso que el asistente necesitaba para que se le declarara la herramienta.
 * El autor sale del token, así que **el mensaje queda a nombre de quien acepta**,
 * no del asistente.
 *
 * ⚠️ Es la propuesta **con más alcance de todas**: un comentario queda en una
 * tarea, pero esto suena en el teléfono de todo el equipo. Por eso la tarjeta
 * enseña el texto entero antes de enviarlo — nadie debería firmar algo que no ha
 * leído, y menos algo que va a interrumpir a otros.
 *
 * ⚠️ **No devuelve `AceptarSobreTareaState`** como las demás: no hay tarea a la
 * que enlazar después. Se devuelve solo el resultado, y por eso la tarjeta usa
 * un marco distinto.
 */
export async function aceptarMensajeAction(
  projectId: string,
  propuesta: { body?: unknown },
  /**
   * La conversación de PRAX de la que sale. Con ella el gateway firma el
   * mensaje «enviado con PRAX» —después de comprobar que es tuya—; sin ella,
   * sale como un mensaje normal.
   */
  praxConversationId?: string | null,
): Promise<{ error: string | null; enviado: boolean }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', enviado: false };

  const body = String(propuesta.body ?? '').trim();
  if (body.length === 0) return { error: 'El mensaje está vacío.', enviado: false };

  try {
    /* Se confirma contra el `data`, no contra el status: un 200 sin cuerpo ya
       nos ha mentido antes. */
    const creado = await api.post<{ id: string }>(`/projects/${projectId}/chat/messages`, {
      body,
      ...(praxConversationId ? { praxConversationId } : {}),
    });
    if (!creado?.id) return { error: 'El servidor no envió el mensaje.', enviado: false };

    return { error: null, enviado: true };
  } catch (error) {
    return { error: describe(error, 'No se pudo enviar el mensaje.'), enviado: false };
  }
}

/**
 * Un mensaje privado a alguien del proyecto.
 *
 * `POST /me/chats/:peerId/messages`: el gateway decide si podéis hablar —por
 * organización (trampa 22)— y firma «enviado con PRAX» si la conversación es
 * tuya. El destinatario ya lo validó el servicio contra los miembros.
 */
export async function aceptarMensajePrivadoAction(
  propuesta: PrivateMessageProposal,
  praxConversationId?: string | null,
): Promise<{ error: string | null; hecho: string | null; href?: string }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', hecho: null };

  const body = String(propuesta.body ?? '').trim();
  const peerId = String(propuesta.destinatarioId ?? '');
  if (!body || !peerId) return { error: 'La propuesta no dice qué ni a quién.', hecho: null };

  try {
    const creado = await api.post<{ id: string }>(`/me/chats/${peerId}/messages`, {
      body,
      ...(praxConversationId ? { praxConversationId } : {}),
    });
    if (!creado?.id) return { error: 'El servidor no envió el mensaje.', hecho: null };
    return {
      error: null,
      hecho: `Mensaje enviado a ${propuesta.destinatario}.`,
      href: `/chat/${peerId}`,
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo enviar el mensaje.'), hecho: null };
  }
}

/**
 * Crea el proyecto de una plantilla propuesta en la conversación.
 *
 * ## No hay ninguna ruta nueva, y ese es todo el asunto
 *
 * Delega en `aplicarPlantilla`, que ya existía para el diálogo de proyecto
 * nuevo: `POST /projects`, y después las rutas de etiquetas, roles, espacios,
 * tableros y columnas, una a una, con la sesión de quien pulsa. **Lo que
 * propone PRAX se materializa exactamente por donde lo haría una persona.**
 *
 * ⚠️ Y por eso esta acción es de tres líneas: si hubiera que escribir aquí la
 * orquestación, sería la segunda copia de un orden que ya tiene un bug
 * arreglado dentro (§36.4 — las columnas van en secuencia, no en paralelo).
 */
export async function aceptarPlantillaAction(plantilla: ProjectTemplate): Promise<TemplateResult> {
  const session = await getSession();
  if (!session) {
    return {
      proyecto: null,
      creado: { etiquetas: 0, roles: 0, espacios: 0, tableros: 0, columnas: 0 },
      fallos: [],
      error: 'Tu sesión ha caducado.',
    };
  }

  /* 🔴 **La organización activa, resuelta.** Sin ella `POST /projects` cae en la
     personal, así que aceptar una plantilla de PRAX estando en el equipo creaba
     el proyecto donde nadie lo iba a ver. Es el mismo campo que manda el
     formulario manual; a las dos rutas de plantilla se les había olvidado. */
  const { organizacionActivaId } = await loadPrivateChrome();

  return aplicarPlantilla(plantilla, organizacionActivaId);
}

/**
 * `YYYY-MM-DD` → ISO al final de ese día.
 *
 * Igual que en el tablero: una fecha de vencimiento se cumple **durante** el día,
 * no a las 00:00. Sin esto, «para el viernes» vence el jueves por la noche.
 */
function diaAIso(dia: string, hora: string, tzOffset: number): string {
  return new Date(new Date(`${dia}T${hora}Z`).getTime() + tzOffset * 60_000).toISOString();
}

function toIsoDueDate(value: string): string {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}

/**
 * «Recursos»: qué proyectos puede consultar PRAX en la organización activa (D5
 * de docs/PLAN-PRAX-SEMIAGENTICO.md). Se guarda en el servidor, por persona y
 * organización; antes vivía en `localStorage` y no llegaba nunca al backend.
 */
export interface AlcanceDePrax {
  organizationId: string | null;
  modo: 'ALL' | 'SELECTED';
  proyectos: { id: string; nombre: string; incluido: boolean }[];
}

export async function alcanceAction(): Promise<AlcanceDePrax | null> {
  const api = await requireApi();
  if (!api) return null;
  return api.get<AlcanceDePrax>(`/me/assistant/scope${await conOrganizacion()}`);
}

export async function guardarAlcanceAction(
  modo: 'ALL' | 'SELECTED',
  projectIds: string[],
): Promise<{ alcance: AlcanceDePrax | null; error: string | null }> {
  const api = await requireApi();
  if (!api) return { alcance: null, error: 'Tu sesión ha caducado.' };
  const { organizacionActivaId } = await loadPrivateChrome();
  try {
    const alcance = await api.put<AlcanceDePrax>('/me/assistant/scope', {
      ...(organizacionActivaId ? { organizationId: organizacionActivaId } : {}),
      modo,
      projectIds: modo === 'SELECTED' ? projectIds : [],
    });
    /* Contra el `data`: un 200 sin alcance no es un guardado. */
    if (!alcance?.modo) return { alcance: null, error: 'El servidor no guardó los recursos.' };
    return { alcance, error: null };
  } catch (error) {
    return { alcance: null, error: describe(error, 'No se han podido guardar los recursos.') };
  }
}
