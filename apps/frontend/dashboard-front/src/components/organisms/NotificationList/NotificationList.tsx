'use client';

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(private)/avisos-actions';
import { NOTIFICATION_INITIAL_STATE } from '@/lib/action-state';
import { type GrupoDeAvisos, fechaCompleta, tiempoRelativo } from '@/lib/notifications';
import {
  type AppNotification,
  Avatar,
  type NotificationType,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { type ReactNode, useEffect, useState } from 'react';

export interface NotificationListProps {
  /** La página de avisos, ya repartida en tramos por la page. */
  grupos: GrupoDeAvisos[];
  /** Sin leer en **toda** la bandeja, no en esta página. */
  unread: number;
  /** Para poner cara y nombre a los `actorId`. */
  usersById: Map<string, UserProfile>;
  /**
   * Las pestañas «Todas / Sin leer», ya renderizadas como enlaces por la page.
   *
   * Slot y no props: el filtro vive en la URL, así que son `<a>` de verdad y
   * este organismo no tiene que saber cómo se construye la ruta de la zona.
   */
  filtroSlot?: ReactNode;
  /** Qué pestaña está puesta. Solo decide el texto del estado vacío. */
  soloSinLeer?: boolean;
}

/**
 * La bandeja de notificaciones.
 *
 * Cada aviso cuenta **algo que ya pasó**, así que no hay nada que decidir: se
 * lee y, como mucho, se va al sitio del que habla. Lo que sí espera una decisión
 * —una invitación sin responder— sigue en el panel con sus botones, y aquí solo
 * aparece el aviso de que llegó. Duplicarlo con botones habría creado dos sitios
 * donde aceptar lo mismo, y el segundo en enterarse habría fallado.
 *
 * ## Qué significa cada color
 *
 * Era todo lo mismo: el borde y el fondo de una fila sin leer se teñían **del
 * color de su tipo**, así que siete tonos distintos competían por decir dos
 * cosas a la vez y ninguna se leía. Ahora hay una regla y es fija:
 *
 * | Dónde | Qué dice |
 * |---|---|
 * | Fondo y punto de la fila | **si está leído o no**, siempre el mismo violeta |
 * | Insignia sobre la cara | **de qué tipo es** el aviso: equipo, tarea, salida |
 *
 * **No leído nunca es negrita.** Con quince avisos, media bandeja en negrita no
 * distingue nada. El peso se reserva para los nombres propios de la frase —quién,
 * qué proyecto, qué tarea— que es lo que se busca al barrer la lista con la
 * vista.
 *
 * ## La cara de quien lo hizo
 *
 * Cada fila llevaba un icono genérico del tipo. Un aviso es siempre **alguien
 * haciendo algo**, y la cara identifica más rápido que la frase: es el mismo
 * avatar que esa persona tiene en el chat y en el tablero, con la insignia del
 * tipo encima en la esquina.
 */
export function NotificationList({
  grupos,
  unread,
  usersById,
  filtroSlot,
  soloSinLeer = false,
}: NotificationListProps) {
  const [allState, markAllAction, markingAll] = useAccion(
    markAllNotificationsReadAction,
    NOTIFICATION_INITIAL_STATE,
  );

  /**
   * El instante contra el que se calcula «hace X».
   *
   * ⚠️ **Empieza en `null` y se rellena al montar, a propósito.** Este
   * componente también se renderiza en el servidor, y un `Date.now()` en el
   * cuerpo daría dos valores distintos —el del servidor y el del navegador—
   * para el mismo HTML: es el desajuste de hidratación clásico de las marcas de
   * tiempo. Mientras es `null` se pinta la hora absoluta, que no depende de
   * cuándo se lea, y el minuto después de montar ya va sola.
   */
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const vacia = grupos.length === 0;

  return (
    <section className="flex flex-col gap-4" aria-label="Notificaciones">
      {/**
       * La barra de la bandeja: cuántas faltan, el filtro y el gesto de
       * vaciarla. Va en una tarjeta y no suelta sobre el fondo porque es lo
       * único fijo de la pantalla —la lista de abajo cambia con cada filtro— y
       * conviene que se lea como el mando de la bandeja, no como una fila más.
       */}
      <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm"
            style={{
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: unread > 0 ? colors.primary : colors.textDisabled,
            }}
          >
            <IconoCampana activa={unread > 0} />
          </span>

          <div className="flex min-w-0 flex-col">
            <p className="font-sans text-sm font-semibold text-text-primary">
              {unread === 0
                ? 'Todo leído'
                : unread === 1
                  ? '1 aviso sin leer'
                  : `${unread} avisos sin leer`}
            </p>
            <p className="font-sans text-xs text-white">
              {unread === 0
                ? 'No te queda nada pendiente por mirar.'
                : 'Tienes notificaciones por mirar.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {filtroSlot}

          {unread > 0 && (
            <form action={markAllAction}>
              <button
                type="submit"
                disabled={markingAll}
                className="cursor-pointer rounded-sm border border-border px-3 py-1.5 font-sans text-xs font-semibold text-text-primary transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingAll ? 'Marcando…' : 'Marcar todo como leído'}
              </button>
            </form>
          )}
        </div>
      </div>

      {allState.error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {allState.error}
        </p>
      )}

      {vacia ? (
        <Vacia soloSinLeer={soloSinLeer} />
      ) : (
        grupos.map((grupo) => (
          <div key={grupo.etiqueta} className="flex flex-col gap-2">
            {/* El tramo, en una línea con su cuenta: separa sin gastar una
                tarjeta ni una regla de lado a lado. */}
            <div className="flex items-center gap-3 px-1">
              <h2 className="font-sans text-xs font-semibold uppercase tracking-wide text-white">
                {grupo.etiqueta}
              </h2>
              <span className="h-px flex-1" style={{ background: colors.border }} />
              <span className="font-sans text-[11px] tabular-nums text-white">
                {grupo.avisos.length}
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {grupo.avisos.map((aviso) => (
                <NotificationRow
                  key={aviso.id}
                  notification={aviso}
                  actor={aviso.actorId ? usersById.get(aviso.actorId) : undefined}
                  ahora={ahora}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function Vacia({ soloSinLeer }: { soloSinLeer: boolean }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-border p-10 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-sm"
        style={{ background: alpha(colors.textSecondary, 8), color: colors.textDisabled }}
      >
        <IconoCampana activa={false} />
      </span>

      <h3 className="font-display text-xl text-text-primary">
        {soloSinLeer ? 'Nada sin leer' : 'Nada por aquí'}
      </h3>
      <p className="max-w-md font-sans text-sm text-white">
        {soloSinLeer
          ? 'Ya has mirado todo lo que había. Quita el filtro para releer los avisos anteriores.'
          : 'Aquí llegarán las invitaciones, los cambios de equipo y las tareas que te asignen.'}
      </p>
    </section>
  );
}

function NotificationRow({
  notification,
  actor,
  ahora,
}: {
  notification: AppNotification;
  actor: UserProfile | undefined;
  /** `null` hasta que monta: entonces se pinta la hora absoluta. Ver arriba. */
  ahora: number | null;
}) {
  const [state, markReadAction, marking] = useAccion(
    markNotificationReadAction,
    NOTIFICATION_INITIAL_STATE,
  );

  const unread = notification.readAt === null;
  const tone = TYPE_TONE[notification.type];
  const who = actor ? personLabel(actor) : 'Alguien';
  const href = destinationOf(notification);
  const cuando = fechaCompleta(notification.createdAt);

  return (
    <li
      /* `group` para que el botón de marcar aparezca al pasar por encima, y
         `relative` para el enlace estirado que cubre la fila entera. */
      className="group relative flex items-start gap-3 rounded-sm border p-3.5 transition-colors"
      style={{
        borderColor: unread ? colors.borderStrong : colors.borderSubtle,
        background: 'transparent',
      }}
    >
      {/**
       * ⚠️ **La fila entera es el enlace, y por eso es un `<a>` estirado y no
       * un `<a>` alrededor de todo.**
       *
       * Dentro hay un botón —marcar como leído— y un botón dentro de un enlace
       * es HTML inválido: el navegador lo saca fuera al parsear y el diseño se
       * desmonta. Con la capa absoluta, el enlace cubre la fila, el botón se
       * queda por encima con su `z-10` y los dos son hermanos.
       *
       * Antes esto era un «Ver» de 11 px al lado de la fecha: el destino estaba,
       * pero había que apuntarle.
       */}
      {href && (
        <a
          href={href}
          onClick={(evento) => marcarYSeguir(evento, notification.id, unread, markReadAction)}
          className="absolute inset-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {/* El nombre accesible va **dentro**, no en un `aria-label` sobre un
              enlace vacío: un enlace sin contenido es un enlace que algunos
              lectores de pantalla se saltan, y así la frase es la misma que se
              ve en la fila. */}
          <span className="sr-only">{describirTexto(notification, who)} — abrir</span>
        </a>
      )}

      {/**
       * ⚠️ **`pointer-events-none`, o la cara se come el clic.**
       *
       * Este envoltorio es `relative` —lo necesita la insignia de la esquina— y
       * un hermano posicionado que va **después** del enlace estirado se pinta
       * por encima de él. Sin esto, pulsar justo sobre el avatar no abría nada:
       * el sitio más grande y más apetecible de la fila era el único punto
       * muerto. El texto de al lado no tiene el problema porque no está
       * posicionado y pasa por debajo.
       */}
      <span className="pointer-events-none relative shrink-0">
        {actor ? (
          <Avatar label={who} size="md" src={avatarHref(actor.avatarUrl, '/main/api/gateway')} />
        ) : (
          /* Sin actor —un aviso del sistema— la insignia se queda sola y en
             grande: es lo único que hay que enseñar. */
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'transparent', border: `1px solid ${tone}`, color: tone }}
          >
            <TypeIcon type={notification.type} />
          </span>
        )}

        {actor && (
          /**
           * La insignia del tipo, en la esquina del avatar: el mismo sitio y el
           * mismo tamaño que el punto de presencia, para que la cara no cambie
           * de forma de una pantalla a otra.
           *
           * ⚠️ **El disco es del color de la tarjeta y el dibujo del color del
           * tipo, no al revés.** Con el disco relleno del tono, el dibujo tenía
           * que ir en `textInverse`, que es blanco en claro y negro en oscuro:
           * blanco sobre el verde de «invitación aceptada» no se ve, y negro
           * sobre el violeta de «tarea asignada» tampoco. Al revés, el contraste
           * es el mismo que el design system ya garantiza para estos tonos como
           * color de texto, y vale igual en los dos temas.
           */
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-surface"
            style={{
              background: colors.surface,
              color: tone,
              boxShadow: `inset 0 0 0 1px ${alpha(tone, 45)}`,
            }}
          >
            <TypeIcon type={notification.type} pequeno />
          </span>
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-sans text-sm text-white">
          <Descripcion notification={notification} who={who} />
        </p>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* `title` con la fecha entera: la agrupación por tramos orienta, esto
              resuelve. */}
          <time
            dateTime={notification.createdAt}
            title={cuando}
            className="font-sans text-[11px] text-white"
          >
            {ahora === null ? cuando : tiempoRelativo(notification.createdAt, ahora)}
          </time>

          {!href && (
            /* Un aviso de expulsión habla de un sitio al que ya no se entra, y
               uno de un proyecto borrado llevaría a un 404. Decirlo es mejor
               que dejar una fila que no responde al clic sin explicar por qué. */
            <span className="font-sans text-[11px] text-white">· sin destino</span>
          )}
        </span>

        {state.error && (
          <span role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
            {state.error}
          </span>
        )}
      </div>

      {unread && (
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          <span
            aria-label="Sin leer"
            title="Sin leer"
            className="h-2 w-2 rounded-full"
            style={{ background: colors.primary }}
          />

          <form action={markReadAction}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <button
              type="submit"
              disabled={marking}
              title="Marcar como leído"
              aria-label="Marcar como leído"
              /* Visible siempre en táctil, y al pasar por encima en escritorio:
                 `group-hover` no existe sin puntero, y un botón que solo
                 aparece con el ratón es un botón que en el móvil no está. */
              className="cursor-pointer rounded-sm p-1.5 text-white opacity-100 transition-all hover:bg-surface-elevated hover:text-text-primary focus-visible:opacity-100 disabled:cursor-not-allowed sm:opacity-0 sm:group-hover:opacity-100"
            >
              {marking ? (
                <span className="font-sans text-[11px]">…</span>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

/**
 * Abrir un aviso lo da por leído.
 *
 * Es lo que ya se esperaba de una bandeja: si has ido al sitio del que habla, lo
 * has visto. Antes había que pulsar la casilla aparte, así que la bandeja se
 * quedaba llena de avisos que sí se habían atendido.
 *
 * ⚠️ **Se marca y *después* se navega, a mano.** El destino está en otra zona
 * del multi-zone, así que el clic es una carga de página completa: dejar la
 * petición del `action` en vuelo la habría cortado a mitad la mitad de las
 * veces. Cuesta el tiempo de una petición local, que en una navegación que ya
 * va a recargar la página entera no se nota.
 *
 * Con `cmd`/`ctrl`/`shift` o con el botón central **no se toca nada**: eso abre
 * en otra pestaña y esta página se queda donde está, así que basta con lanzar el
 * marcado y dejar que el navegador haga lo suyo.
 */
function marcarYSeguir(
  evento: React.MouseEvent<HTMLAnchorElement>,
  id: string,
  unread: boolean,
  markReadAction: (formData: FormData) => void,
) {
  const enOtraPestana =
    evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0;

  if (!unread) return;

  const datos = new FormData();
  datos.append('notificationId', id);

  if (enOtraPestana) {
    markReadAction(datos);
    return;
  }

  evento.preventDefault();
  const destino = evento.currentTarget.href;
  markReadAction(datos);
  /* Un respiro para que la acción salga antes de que la página se vaya. La
     navegación es dura de todas formas: 120 ms no se distinguen del salto. */
  setTimeout(() => window.location.assign(destino), 120);
}

/**
 * El texto del aviso, con los nombres propios destacados.
 *
 * Se compone aquí y no se guarda en la base a propósito: guardar la frase
 * congelaría el idioma y la redacción en el momento del evento, y cambiar una
 * coma obligaría a una migración.
 *
 * Las comillas angulares se cayeron: quién, qué proyecto y qué tarea van en
 * color de texto principal y peso medio sobre una frase en secundario, que
 * separa mejor que un signo de puntuación y deja la lista legible de un barrido.
 */
function Descripcion({ notification, who }: { notification: AppNotification; who: string }) {
  const quien = <Nombre>{who}</Nombre>;
  const proyecto = <Nombre>{notification.projectName ?? 'un proyecto'}</Nombre>;
  const tarea = <Nombre>{notification.taskTitle ?? 'una tarea'}</Nombre>;

  switch (notification.type) {
    case 'INVITATION_RECEIVED':
      return (
        <>
          {quien} te invitó a {proyecto}.
        </>
      );
    case 'INVITATION_ACCEPTED':
      return (
        <>
          {quien} aceptó tu invitación a {proyecto}.
        </>
      );
    case 'INVITATION_REJECTED':
      return (
        <>
          {quien} rechazó tu invitación a {proyecto}.
        </>
      );
    case 'MEMBER_LEFT':
      return (
        <>
          {quien} salió de {proyecto}.
        </>
      );
    case 'MEMBER_REMOVED':
      return (
        <>
          {quien} te sacó de {proyecto}.
        </>
      );
    case 'TASK_ASSIGNED':
      return (
        <>
          {quien} te asignó {tarea} en {proyecto}.
        </>
      );
    case 'TASK_UNASSIGNED':
      return (
        <>
          {quien} te quitó de {tarea} en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_DUE_SOON':
      return (
        <>
          {tarea} vencerá pronto en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_STALE':
      return (
        <>
          {tarea} lleva varios días sin movimiento en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_OVERDUE':
      return (
        <>
          {tarea} ha pasado su fecha de vencimiento en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_UNASSIGNED':
      return (
        <>
          {tarea} sigue sin encargado en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_CREATED':
      return (
        <>
          Se ha creado {tarea} en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_MOVED':
      return (
        <>
          {tarea} ha cambiado de columna en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_COMPLETED':
      return (
        <>
          {tarea} se ha dado por terminada en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_REOPENED':
      return (
        <>
          {tarea} se ha vuelto a abrir en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_ASSIGNEES_CHANGED':
      return (
        <>
          Han cambiado los encargados de {tarea} en {proyecto}.
        </>
      );
    case 'AUTOMATION_TASK_DUE_DATE_CHANGED':
      return (
        <>
          Ha cambiado el vencimiento de {tarea} en {proyecto}.
        </>
      );
  }
}

function Nombre({ children }: { children: ReactNode }) {
  return <span className="font-medium text-text-primary">{children}</span>;
}

/** La misma frase en texto plano, para el nombre accesible del enlace. */
function describirTexto(notification: AppNotification, who: string): string {
  const project = notification.projectName ?? 'un proyecto';
  const task = notification.taskTitle ?? 'una tarea';

  switch (notification.type) {
    case 'INVITATION_RECEIVED':
      return `${who} te invitó a ${project}`;
    case 'INVITATION_ACCEPTED':
      return `${who} aceptó tu invitación a ${project}`;
    case 'INVITATION_REJECTED':
      return `${who} rechazó tu invitación a ${project}`;
    case 'MEMBER_LEFT':
      return `${who} salió de ${project}`;
    case 'MEMBER_REMOVED':
      return `${who} te sacó de ${project}`;
    case 'TASK_ASSIGNED':
      return `${who} te asignó ${task} en ${project}`;
    case 'TASK_UNASSIGNED':
      return `${who} te quitó de ${task} en ${project}`;
    case 'AUTOMATION_TASK_DUE_SOON':
      return `${task} vencerá pronto en ${project}`;
    case 'AUTOMATION_TASK_STALE':
      return `${task} lleva varios días sin movimiento en ${project}`;
    case 'AUTOMATION_TASK_OVERDUE':
      return `${task} ha pasado su fecha de vencimiento en ${project}`;
    case 'AUTOMATION_TASK_UNASSIGNED':
      return `${task} sigue sin encargado en ${project}`;
    case 'AUTOMATION_TASK_CREATED':
      return `Se ha creado ${task} en ${project}`;
    case 'AUTOMATION_TASK_MOVED':
      return `${task} ha cambiado de columna en ${project}`;
    case 'AUTOMATION_TASK_COMPLETED':
      return `${task} se ha dado por terminada en ${project}`;
    case 'AUTOMATION_TASK_REOPENED':
      return `${task} se ha vuelto a abrir en ${project}`;
    case 'AUTOMATION_TASK_ASSIGNEES_CHANGED':
      return `Han cambiado los encargados de ${task} en ${project}`;
    case 'AUTOMATION_TASK_DUE_DATE_CHANGED':
      return `Ha cambiado el vencimiento de ${task} en ${project}`;
  }
}

/**
 * A dónde lleva el aviso.
 *
 * Al proyecto, y a la tarea concreta cuando la hay — con `?task=`, el mismo
 * parámetro que usan los avisos de vencimiento. Sin `projectId` no hay destino:
 * los avisos de expulsión y de salida hablan de un sitio al que ya no se entra.
 */
function destinationOf(notification: AppNotification): string | null {
  if (!notification.projectId) return null;
  if (notification.type === 'MEMBER_REMOVED') return null;

  return notification.taskId
    ? `/projects/${notification.projectId}?task=${notification.taskId}`
    : `/projects/${notification.projectId}`;
}

/**
 * Un color por familia: invitación en ámbar, tareas en violeta, salidas en rojo.
 *
 * ⚠️ Este color vive **solo en la insignia** de la esquina del avatar. El fondo
 * y el punto de la fila son siempre violeta y dicen otra cosa —si está sin
 * leer—: cuando los dos usaban la misma paleta, siete tonos intentaban decir
 * dos cosas a la vez y no se leía ninguna.
 */
const TYPE_TONE: Record<NotificationType, string> = {
  INVITATION_RECEIVED: colors.accent,
  INVITATION_ACCEPTED: colors.success,
  INVITATION_REJECTED: colors.textSecondary,
  MEMBER_LEFT: colors.warning,
  MEMBER_REMOVED: colors.error,
  TASK_ASSIGNED: colors.primary,
  TASK_UNASSIGNED: colors.textSecondary,
  /**
   * **Los diez de automatización, en ámbar.**
   *
   * ⚠️ **El rojo es para lo que está mal, no para lo que es automático.**
   * `AUTOMATION_TASK_STALE` estuvo en `error` y salía igual de alarmante que
   * «te sacaron del proyecto». Pero repartirlos luego por urgencia —vencido en
   * aviso, creado en violeta, terminado en verde— tenía el mismo problema al
   * revés: el color decía qué había pasado, que ya lo dice la frase, y no decía
   * lo único que no se puede leer de un vistazo — que **esto lo hizo una
   * regla**, no una persona.
   *
   * Así que el ámbar es de la automatización entera, y va con el rayo. Es el
   * mismo color que llevan estos avisos en el toast (`LiveNotices/styles.ts`):
   * el que aparece en pantalla y el que queda en la bandeja tienen que
   * reconocerse como lo mismo.
   */
  AUTOMATION_TASK_DUE_SOON: colors.warning,
  AUTOMATION_TASK_STALE: colors.warning,
  AUTOMATION_TASK_OVERDUE: colors.warning,
  AUTOMATION_TASK_UNASSIGNED: colors.warning,
  AUTOMATION_TASK_CREATED: colors.warning,
  AUTOMATION_TASK_MOVED: colors.warning,
  AUTOMATION_TASK_COMPLETED: colors.warning,
  AUTOMATION_TASK_REOPENED: colors.warning,
  AUTOMATION_TASK_ASSIGNEES_CHANGED: colors.warning,
  AUTOMATION_TASK_DUE_DATE_CHANGED: colors.warning,
};

function TypeIcon({ type, pequeno = false }: { type: NotificationType; pequeno?: boolean }) {
  /* `aria-hidden` va literal en cada `<svg>` y no aquí dentro: el icono es
     decorativo —la frase de al lado dice lo mismo— y el analizador no ve los
     atributos que llegan por propagación, así que los daba por icono sin
     alternativa textual. */
  const props = {
    className: pequeno ? 'h-2.5 w-2.5' : 'h-4 w-4',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: pequeno ? 3 : 2,
  } as const;

  /**
   * 🔴 **Un aviso de automatización salía con el icono de un sobre.**
   *
   * Las ramas de abajo miran el prefijo del tipo, y `AUTOMATION_TASK_CREATED`
   * no empieza por `TASK_` ni por `MEMBER_`: caía al icono por defecto, que es
   * el del correo. Un aviso que nadie envió, con un sobre y en rojo.
   *
   * Va primero porque `AUTOMATION_TASK_…` **también** contiene `TASK_`: con la
   * comprobación al revés, seguiría sin verse nunca.
   */
  if (type.startsWith('AUTOMATION_')) {
    return (
      <svg {...props} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }

  if (type.startsWith('TASK_')) {
    return (
      <svg {...props} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-6 4h6"
        />
      </svg>
    );
  }

  if (type.startsWith('MEMBER_')) {
    return (
      <svg {...props} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 20h5v-2a3 3 0 00-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.8M7 20H2v-2a3 3 0 015.4-1.8M7 20v-2c0-.7.1-1.3.4-1.8m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    );
  }

  return (
    <svg {...props} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.9 5.3a2 2 0 002.2 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

/** La campana de la barra: con badajo cuando queda algo, quieta cuando no. */
function IconoCampana({ activa }: { activa: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 8a6 6 0 10-12 0c0 3.6-.7 5.4-1.6 6.4-.4.4-.1 1.1.5 1.1h14.2c.6 0 .9-.7.5-1.1C18.7 13.4 18 11.6 18 8z"
      />
      {activa && <path strokeLinecap="round" strokeLinejoin="round" d="M10 18.5a2.2 2.2 0 004 0" />}
    </svg>
  );
}
