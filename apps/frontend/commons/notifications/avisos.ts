import { projectHref } from '../api/routes';

/**
 * Qué dice un aviso y a dónde lleva, **en un solo sitio**.
 *
 * ## Por qué existe
 *
 * Porque existía dos veces. La misma tabla de dieciséis `NotificationType`
 * estaba escrita en `LiveNotices` (la tarjeta emergente) y otra vez dentro de
 * `SidebarInboxList` (la pestaña de la bandeja), con **redacciones distintas**:
 * la tarjeta decía «Ana te ha asignado «Revisar copia» en «Rediseño».» y la fila
 * de la bandeja, para el mismo aviso, «Ana te asignó una tarea en Rediseño».
 * El mismo hecho contado de dos maneras según dónde lo leyeras.
 *
 * Peor era el destino: una copia usaba `projectHref`, la otra construía
 * `/projects/${projectId}` a mano — que es exactamente lo que CLAUDE.md prohíbe
 * y ya se coló en cinco sitios (trampa 10).
 *
 * ## Las dos superficies no reciben lo mismo, y por eso hay un tipo normalizado
 *
 * La tarjeta trabaja sobre un `NoticeEvent` del flujo, que trae `actorName` ya
 * resuelto por el gateway y `projectSlug`. La bandeja trabaja sobre un
 * `AppNotification` de la tabla, que trae `actorId` —el nombre lo resuelve la
 * pantalla contra el directorio— y **no trae slug**.
 *
 * Así que la tabla no recibe ninguno de los dos: recibe `AvisoLegible`, que es
 * lo poco que hace falta para redactar. Cada superficie lo compone con lo que
 * tiene, y ahí es donde se nota la diferencia, no en dieciséis `case`.
 */
export interface AvisoLegible {
  /**
   * El `NotificationType`. **Texto libre a propósito**: el servidor puede
   * estrenar valores, y una unión cerrada aquí sería otra copia que envejece.
   * Lo que no reconoce cae en la frase genérica.
   */
  type: string;
  /** Quién lo provocó, ya resuelto a nombre. `null` = impersonal. */
  quien: string | null;
  /** Copia del momento, no una referencia: el aviso sobrevive al proyecto. */
  proyecto: string | null;
  /** Ídem. */
  tarea: string | null;
}

/**
 * La frase de un aviso.
 *
 * Con nombre siempre que se sepa: en un equipo, «te han asignado algo» sin decir
 * quién obliga a abrirlo para saber si te incumbe. Degrada a impersonal cuando
 * no hay nombre —credentials caído, una cuenta borrada—, que es perder un dato,
 * no el aviso.
 */
export function describirAviso({ type, quien, proyecto, tarea }: AvisoLegible): string {
  const elProyecto = proyecto ?? 'un proyecto';
  const laTarea = tarea ?? 'una tarea';
  /* «en «Proyecto»» o nada. Se compone una vez para que ninguna rama se olvide
     de contemplar el caso sin proyecto. */
  const donde = proyecto ? ` en «${proyecto}»` : '';

  switch (type) {
    case 'INVITATION_RECEIVED':
      return quien
        ? `${quien} te ha invitado a «${elProyecto}».`
        : `Te han invitado a «${elProyecto}».`;
    case 'INVITATION_ACCEPTED':
      return quien
        ? `${quien} ha aceptado tu invitación a «${elProyecto}».`
        : `Han aceptado tu invitación a «${elProyecto}».`;
    case 'INVITATION_REJECTED':
      return quien
        ? `${quien} ha rechazado tu invitación a «${elProyecto}».`
        : `Han rechazado tu invitación a «${elProyecto}».`;
    case 'MEMBER_LEFT':
      return quien
        ? `${quien} ha salido de «${elProyecto}».`
        : `Alguien ha salido de «${elProyecto}».`;
    case 'MEMBER_REMOVED':
      return `Te han sacado de «${elProyecto}».`;
    case 'TASK_ASSIGNED':
      return quien
        ? `${quien} te ha asignado «${laTarea}»${donde}.`
        : `Te han asignado «${laTarea}»${donde}.`;
    case 'TASK_UNASSIGNED':
      return quien
        ? `${quien} te ha quitado de «${laTarea}»${donde}.`
        : `Te han quitado de «${laTarea}»${donde}.`;
    /**
     * ⚠️ **Los de automatización sí tienen texto, y en la bandeja no lo tenían.**
     *
     * En la copia de la barra lateral existían, pero en la de la tarjeta hubo un
     * tiempo en que caían al `default` —«Tienes un aviso nuevo»—. Un aviso que
     * no dice qué ha pasado obliga a abrirlo para averiguarlo, que es justo lo
     * que un aviso viene a evitar. Con una sola tabla eso deja de poder pasar en
     * un sitio y no en el otro.
     */
    case 'AUTOMATION_TASK_DUE_SOON':
      return `«${laTarea}» vencerá pronto${donde}.`;
    case 'AUTOMATION_TASK_STALE':
      return `«${laTarea}» lleva varios días sin movimiento${donde}.`;
    case 'AUTOMATION_TASK_OVERDUE':
      return `«${laTarea}» ha pasado su fecha de vencimiento${donde}.`;
    case 'AUTOMATION_TASK_UNASSIGNED':
      return `«${laTarea}» sigue sin encargado${donde}.`;
    case 'AUTOMATION_TASK_CREATED':
      return `Se ha creado «${laTarea}»${donde}.`;
    case 'AUTOMATION_TASK_MOVED':
      return `«${laTarea}» ha cambiado de columna${donde}.`;
    case 'AUTOMATION_TASK_COMPLETED':
      return `«${laTarea}» se ha dado por terminada${donde}.`;
    case 'AUTOMATION_TASK_REOPENED':
      return `«${laTarea}» se ha vuelto a abrir${donde}.`;
    case 'AUTOMATION_TASK_ASSIGNEES_CHANGED':
      return `Han cambiado los encargados de «${laTarea}»${donde}.`;
    case 'AUTOMATION_TASK_DUE_DATE_CHANGED':
      return `Ha cambiado el vencimiento de «${laTarea}»${donde}.`;
    default:
      return 'Tienes un aviso nuevo.';
  }
}

/** Lo que hace falta para saber a dónde lleva un aviso. */
export interface DestinoDeAviso {
  type: string;
  /**
   * Slug o UUID del proyecto. Los dos resuelven en `/projects/:idOrSlug`; el
   * slug sale más legible, así que se prefiere cuando quien llama lo tiene.
   */
  proyectoRef: string | null;
  taskId: string | null;
}

/**
 * A dónde lleva un aviso, o `null` si a ningún sitio.
 *
 * ⚠️ **Se usa `projectHref` y no una plantilla a mano.** El slug va en la URL y
 * el UUID en la API, los dos son `string`, y confundirlos no da error de
 * compilación (CLAUDE.md, trampa 10). La copia de la barra lateral escribía
 * `/projects/${projectId}` a pelo, que es cómo se empieza.
 *
 * ## 🔴 `null` para los de automatización, y eso es un arreglo
 *
 * Llevaban a `'/main#avisos'`, con un comentario que decía que el ancla
 * `id="avisos"` la ponía `dashboard-front`. **Ya no la pone nadie**, y la raíz
 * de `/main` es hoy un `useEffect` que hace `location.replace('/projects')`. O
 * sea que pulsar «Ver» en la tarjeta de un aviso de automatización te dejaba en
 * la lista de proyectos, sin relación con el aviso.
 *
 * La bandeja ya no es una URL: es una pestaña de la barra lateral. Así que este
 * caso devuelve `null` y quien pinta la tarjeta ofrece **abrir la pestaña** en
 * vez de navegar. Ver `LiveNotices` y `ABRIR_BANDEJA_EVENT`.
 *
 * El motivo original sigue en pie: un aviso de automatización cuenta algo que
 * hizo **una regla**, y abrir la tarea deja a quien pulsó mirando una tarjeta
 * normal, sin la frase que explicaba por qué le avisaron.
 */
export function destinoDeAviso({ type, proyectoRef, taskId }: DestinoDeAviso): string | null {
  if (type.startsWith('AUTOMATION_')) return null;
  if (!proyectoRef) return null;

  /* Los avisos de tarea abren la tarea directamente. La página resuelve el
     tablero desde `?task=`, así que no hace falta saberlo aquí. */
  if (taskId) return projectHref({ slug: proyectoRef }, { task: taskId });

  /* Los de equipo llevan al proyecto sin más. `MEMBER_REMOVED` es la excepción:
     te acaban de sacar, así que el enlace daría 403 y sería peor que nada. */
  if (type === 'MEMBER_REMOVED') return null;

  return projectHref({ slug: proyectoRef });
}

/**
 * Abrir el popover de avisos (la campana junto al avatar), desde cualquier sitio.
 *
 * ## Por qué un evento del navegador y no una ruta
 *
 * Porque la bandeja **dejó de tener URL** cuando pasó a ser una pestaña. Quien
 * quiere abrirla —la tarjeta emergente de un aviso de automatización— vive en el
 * mismo árbol que el armazón pero no es descendiente suyo, y navegar a una ruta
 * inventada es justo el fallo que esto viene a cerrar (ver `destinoDeAviso`).
 *
 * Un evento de `window` lo resuelve sin proveedor y sin recarga: el armazón lo
 * escucha, cambia de pestaña, y en móvil abre además el cajón —que es donde
 * viven las pestañas en un teléfono—.
 */
export const ABRIR_BANDEJA_EVENT = 'praxis:abrir-bandeja';

export function abrirBandeja(): void {
  window.dispatchEvent(new Event(ABRIR_BANDEJA_EVENT));
}
