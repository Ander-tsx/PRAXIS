'use client';

import {
  type AppNotification,
  type NotificationType,
  type UserProfile,
  alpha,
  colors,
  personLabel,
} from '@praxis/commons';
import { useActionState } from 'react';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/notificaciones/actions';
import { NOTIFICATION_INITIAL_STATE } from '@/lib/action-state';

export interface NotificationListProps {
  notifications: AppNotification[];
  unread: number;
  /** Para poner nombre a los `actorId`. */
  usersById: Map<string, UserProfile>;
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
 * **No leído = un punto y el fondo un poco más vivo.** Nada de negrita: con
 * quince avisos, media bandeja en negrita no distingue nada.
 */
export function NotificationList({ notifications, unread, usersById }: NotificationListProps) {
  const [allState, markAllAction, markingAll] = useActionState(
    markAllNotificationsReadAction,
    NOTIFICATION_INITIAL_STATE,
  );

  if (notifications.length === 0) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-center">
        <h3 className="font-display text-xl text-text-primary">Nada por aquí</h3>
        <p className="max-w-md font-sans text-sm text-text-secondary">
          Aquí llegarán las invitaciones, los cambios de equipo y las tareas que te asignen.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Notificaciones">
      <header className="flex items-center justify-between gap-3">
        <p className="font-sans text-sm text-text-secondary">
          {unread === 0
            ? 'Todo leído.'
            : unread === 1
              ? 'Tienes una notificación sin leer.'
              : `Tienes ${unread} notificaciones sin leer.`}
        </p>

        {unread > 0 && (
          <form action={markAllAction}>
            <button
              type="submit"
              disabled={markingAll}
              className="cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: alpha(colors.primary, 20) }}
            >
              {markingAll ? 'Marcando…' : 'Marcar todo como leído'}
            </button>
          </form>
        )}
      </header>

      {allState.error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {allState.error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            actor={notification.actorId ? usersById.get(notification.actorId) : undefined}
          />
        ))}
      </ul>
    </section>
  );
}

function NotificationRow({
  notification,
  actor,
}: {
  notification: AppNotification;
  actor: UserProfile | undefined;
}) {
  const [state, markReadAction, marking] = useActionState(
    markNotificationReadAction,
    NOTIFICATION_INITIAL_STATE,
  );

  const unread = notification.readAt === null;
  const tone = TYPE_TONE[notification.type];
  const who = actor ? personLabel(actor) : 'Alguien';
  const href = destinationOf(notification);

  return (
    <li
      className="flex items-start gap-3 rounded-xl border p-3.5 transition-colors"
      style={{
        borderColor: unread ? alpha(tone, 30) : alpha(colors.border, 60),
        background: unread ? alpha(tone, 6) : 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: alpha(tone, 15), color: tone }}
      >
        <TypeIcon type={notification.type} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-sans text-sm text-text-primary">
          {describe(notification, who)}
        </p>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-sans text-[11px] text-text-disabled">
            {formatWhen(notification.createdAt)}
          </span>

          {/**
           * El enlace solo aparece si hay a dónde ir. Un aviso de un proyecto
           * borrado sigue leyéndose —guarda el nombre— pero llevaría a un 404.
           */}
          {href && (
            <a
              href={href}
              className="font-sans text-[11px] text-primary underline-offset-2 hover:underline"
            >
              Ver
            </a>
          )}
        </span>

        {state.error && (
          <span role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
            {state.error}
          </span>
        )}
      </div>

      {unread && (
        <form action={markReadAction} className="shrink-0">
          <input type="hidden" name="notificationId" value={notification.id} />
          <button
            type="submit"
            disabled={marking}
            title="Marcar como leído"
            aria-label="Marcar como leído"
            className="cursor-pointer rounded-lg p-1.5 text-text-disabled transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed"
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
      )}
    </li>
  );
}

/**
 * El texto del aviso.
 *
 * Se compone aquí y no se guarda en la base a propósito: guardar la frase
 * congelaría el idioma y la redacción en el momento del evento, y cambiar una
 * coma obligaría a una migración.
 */
function describe(notification: AppNotification, who: string): string {
  const project = notification.projectName ?? 'un proyecto';
  const task = notification.taskTitle ?? 'una tarea';

  switch (notification.type) {
    case 'INVITATION_RECEIVED':
      return `${who} te invitó a «${project}».`;
    case 'INVITATION_ACCEPTED':
      return `${who} aceptó tu invitación a «${project}».`;
    case 'INVITATION_REJECTED':
      return `${who} rechazó tu invitación a «${project}».`;
    case 'MEMBER_LEFT':
      return `${who} salió de «${project}».`;
    case 'MEMBER_REMOVED':
      return `${who} te sacó de «${project}».`;
    case 'TASK_ASSIGNED':
      return `${who} te asignó «${task}» en «${project}».`;
    case 'TASK_UNASSIGNED':
      return `${who} te quitó de «${task}» en «${project}».`;
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

/** Un color por familia: equipo en ámbar, tareas en violeta, salidas en rojo. */
const TYPE_TONE: Record<NotificationType, string> = {
  INVITATION_RECEIVED: colors.accent,
  INVITATION_ACCEPTED: colors.success,
  INVITATION_REJECTED: colors.textSecondary,
  MEMBER_LEFT: colors.warning,
  MEMBER_REMOVED: colors.error,
  TASK_ASSIGNED: colors.primary,
  TASK_UNASSIGNED: colors.textSecondary,
};

function TypeIcon({ type }: { type: NotificationType }) {
  const props = {
    className: 'h-4 w-4',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 2,
    'aria-hidden': true,
  } as const;

  if (type.startsWith('TASK_')) {
    return (
      <svg {...props}>
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
      <svg {...props}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 20h5v-2a3 3 0 00-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.8M7 20H2v-2a3 3 0 015.4-1.8M7 20v-2c0-.7.1-1.3.4-1.8m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.9 5.3a2 2 0 002.2 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

/** «hace un momento» pesa menos que una marca de tiempo completa. */
function formatWhen(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);

  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  if (mins < 10080) return `hace ${Math.round(mins / 1440)} d`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
