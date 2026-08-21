import { AutomationActionType, NotificationType } from '@praxis/contracts';

import { triggerSpec } from '../rules/catalog';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import type { TaskShape } from './task-context';

/**
 * Lo que una regla puede **hacer**, y con qué identidad lo hace.
 *
 * ## 🔴 La identidad de una acción: `createdBy`, y no un actor de sistema
 *
 * Una regla se ejecuta sin que nadie la esté mirando, así que hay que decidir
 * en nombre de quién escribe. Se decidió actor «sistema»… y al ir a
 * implementarlo apareció algo mejor, que además ya estaba: **`tasks-service`
 * comprueba permisos por `requesterId` en cada escritura**
 * (`assertPermission` → `project_check_permission`). No es el gateway quien los
 * comprueba: es el propio servicio.
 *
 * Así que las acciones viajan con `requesterId = rule.createdBy`, y eso da tres
 * cosas gratis:
 *
 * 1. **Una regla no puede hacer nada que su autor no pudiera hacer a mano.** No
 *    hay actor omnipotente al que colarse: si el autor pierde `canEditTask`, la
 *    escritura responde 403 y la acción falla. En el momento, no en el que se
 *    guardó la regla.
 * 2. **La auditoría dice la verdad.** El evento de dominio que sale de mover
 *    una tarea lleva a esa persona como actor, que es de quien salió la orden.
 * 3. **Cero código de permisos aquí.** La comprobación al guardar la regla sigue
 *    existiendo, pero como cortesía —para dar el error pronto y claro—, no como
 *    la única defensa.
 *
 * ⚠️ **Que ninguna acción abra una ruta nueva es la otra mitad del trato.** Todo
 * lo de aquí llama al mismo RPC que usa el botón de la pantalla, con la misma
 * validación y los mismos 400 y 403. Es la misma regla que gobierna al
 * asistente, y por el mismo motivo.
 */

export interface ActionContext {
  projectId: string;
  /** Qué disparó la regla. Decide el aviso que se manda. */
  triggerType: string;
  projectName?: string | undefined;
  projectOwnerId: string;
  /** Quien escribió la regla. Es la identidad con la que se escribe. */
  requesterId: string;
  task: TaskShape;
  /** Los encargados actuales, ya resueltos: es a quién avisa `ASSIGNEES`. */
  recipients: string[];
}

export interface ActionClients {
  tasks: ClientProxy;
  projects: ClientProxy;
}

/**
 * Sustituye los huecos de una plantilla de texto.
 *
 * Dos y no más: `{tarea}` y `{proyecto}`. Un motor de plantillas de verdad
 * abriría la puerta a que el texto de una regla leyera campos que nadie ha
 * pensado si se pueden enseñar — y esto se publica en el chat, que ve todo el
 * proyecto.
 */
export function rellenar(plantilla: string, contexto: ActionContext): string {
  return plantilla
    .replaceAll('{tarea}', contexto.task.title)
    .replaceAll('{proyecto}', contexto.projectName ?? 'el proyecto');
}

/** Los ids de etiqueta que la tarea ya tiene. */
function etiquetasActuales(task: TaskShape): string[] {
  return (task.labels ?? [])
    .map((relacion) => relacion.label?.id ?? relacion.labelId)
    .filter((id): id is string => typeof id === 'string');
}

export async function runAction(
  action: { type: string; config: Record<string, unknown> },
  contexto: ActionContext,
  clientes: ActionClients,
): Promise<unknown> {
  switch (action.type) {
    case AutomationActionType.CREATE_NOTIFICATION:
      return crearAviso(action.config, contexto, clientes);
    case AutomationActionType.MOVE_TASK:
      return moverTarea(action.config, contexto, clientes);
    case AutomationActionType.ASSIGN_TASK:
      return asignarTarea(action.config, contexto, clientes);
    case AutomationActionType.SET_PRIORITY:
      return editarTarea({ priority: action.config.priority }, contexto, clientes);
    case AutomationActionType.ADD_LABEL:
      return ponerEtiqueta(action.config, contexto, clientes);
    case AutomationActionType.POST_CHAT_MESSAGE:
      return escribirEnElChat(action.config, contexto, clientes);
    default:
      /* Una acción guardada que este motor ya no conoce **falla**, no se ignora:
         una regla que dice que hace algo y no lo hace es peor que una que
         avisa de que no puede. */
      throw new Error(`Acción no registrada: ${action.type}`);
  }
}

function crearAviso(
  config: Record<string, unknown>,
  contexto: ActionContext,
  clientes: ActionClients,
) {
  const selector = config.recipientSelector;
  const destinatarios =
    selector === 'PROJECT_OWNER' ? [contexto.projectOwnerId] : contexto.recipients;
  /**
   * 🔴 **El motivo sale del disparador; el destinatario, de la regla.**
   *
   * Esto elegía el tipo de aviso mirando `recipientSelector`, y con dos
   * disparadores coincidía por casualidad. Con diez, «cuando se cree una tarea,
   * avisa a quien lleva el proyecto» mandaba un aviso que decía **«lleva varios
   * días sin movimiento»** sobre una tarea recién creada. El texto describía a
   * quién se le contaba, no lo que había ocurrido.
   */
  const spec = triggerSpec(contexto.triggerType);

  /* Sin nadie a quien avisar no se llama a nadie: mandar una lista vacía
     devuelve un 200 que parece un éxito y no deja ningún aviso. */
  if (destinatarios.length === 0) {
    throw new Error('La tarea no tiene a quién avisar');
  }

  return firstValueFrom(
    clientes.projects.send(
      { cmd: 'notification_create' },
      {
        notifications: destinatarios.map((userId) => ({
          userId,
          type: spec?.notificationType ?? NotificationType.AUTOMATION_TASK_DUE_SOON,
          projectId: contexto.projectId,
          projectName: contexto.projectName,
          taskId: contexto.task.id,
          taskTitle: contexto.task.title,
        })),
      },
    ),
  );
}

/**
 * Mueve la tarea a otra columna.
 *
 * ⚠️ **Hay que resolver antes si la columna destino es de cierre.** El color de
 * una columna vive en `projects-service` y `tasks-service` no puede verlo, así
 * que quien mueve tiene que decírselo — en la pantalla lo hace el gateway. Sin
 * ese dato, mover a la columna verde deja `completedAt` sin poner: la tarea se
 * ve terminada en el tablero, **no cuenta como cerrada en los informes** y
 * sigue avisando de que va a vencer. Es un fallo mudo de los caros.
 */
async function moverTarea(
  config: Record<string, unknown>,
  contexto: ActionContext,
  clientes: ActionClients,
) {
  const targetColumnId = String(config.targetColumnId);
  if (contexto.task.columnId === targetColumnId) {
    /* Ya está donde tenía que estar. No es un fallo, y repetir la escritura
       generaría un evento de movimiento que no ocurrió. */
    return { movida: false, motivo: 'La tarea ya estaba en esa columna' };
  }

  const columnas = await firstValueFrom<Array<{ id: string; name: string; color?: string | null }>>(
    clientes.projects.send({ cmd: 'column_find_by_ids' }, { ids: [targetColumnId] }),
  );
  const columna = columnas?.[0];
  if (!columna) throw new Error('La columna de destino ya no existe');

  return firstValueFrom(
    clientes.tasks.send(
      { cmd: 'task_move' },
      {
        id: contexto.task.id,
        projectId: contexto.projectId,
        requesterId: contexto.requesterId,
        columnId: targetColumnId,
        status: columna.name,
        isClosingColumn: columna.color === 'success',
      },
    ),
  );
}

/**
 * Añade a alguien a los encargados.
 *
 * ⚠️ **`task_assign` sustituye la lista entera**, no añade: es lo que hace un
 * selector múltiple al cerrarse. Mandar solo el nuevo dejaría la tarea con esa
 * persona sola y **echaría en silencio a todos los demás** — el catálogo promete
 * «se añade a los que ya tenga», y esta línea es lo que lo cumple.
 */
function asignarTarea(
  config: Record<string, unknown>,
  contexto: ActionContext,
  clientes: ActionClients,
) {
  const assigneeId = String(config.assigneeId);
  const actuales = (contexto.task.assignees ?? []).map((asignado) => asignado.userId);
  if (actuales.includes(assigneeId)) {
    return { asignada: false, motivo: 'Esa persona ya era encargada' };
  }
  return firstValueFrom(
    clientes.tasks.send(
      { cmd: 'task_assign' },
      {
        id: contexto.task.id,
        projectId: contexto.projectId,
        requesterId: contexto.requesterId,
        assigneeIds: [...actuales, assigneeId],
      },
    ),
  );
}

/** Igual que asignar: `labelIds` es el conjunto completo, así que se acumula. */
function ponerEtiqueta(
  config: Record<string, unknown>,
  contexto: ActionContext,
  clientes: ActionClients,
) {
  const labelId = String(config.labelId);
  const actuales = etiquetasActuales(contexto.task);
  if (actuales.includes(labelId)) {
    return Promise.resolve({ puesta: false, motivo: 'La tarea ya llevaba esa etiqueta' });
  }
  return editarTarea({ labelIds: [...actuales, labelId] }, contexto, clientes);
}

function editarTarea(
  cambios: Record<string, unknown>,
  contexto: ActionContext,
  clientes: ActionClients,
) {
  return firstValueFrom(
    clientes.tasks.send(
      { cmd: 'task_update' },
      {
        ...cambios,
        id: contexto.task.id,
        projectId: contexto.projectId,
        requesterId: contexto.requesterId,
      },
    ),
  );
}

function escribirEnElChat(
  config: Record<string, unknown>,
  contexto: ActionContext,
  clientes: ActionClients,
) {
  return firstValueFrom(
    clientes.projects.send(
      { cmd: 'chat_project_send' },
      {
        projectId: contexto.projectId,
        requesterId: contexto.requesterId,
        body: rellenar(String(config.text), contexto),
      },
    ),
  );
}
