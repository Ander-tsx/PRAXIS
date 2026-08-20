'use client';
import { useState } from 'react';
import {
  Badge,
  Button,
  type ProjectInvitation,
  type ProjectMember,
  type ProjectRole,
  type UserProfile,
  avatarHref,
  personLabel,
} from '@praxis/commons';
import { InviteMemberDialog } from './InviteMemberDialog';
import { LeaveProjectButton } from './LeaveProjectButton';
import { MemberAvatar } from './MemberAvatar';
import { MemberRoleSelect } from './MemberRoleSelect';
import { PendingInvitations } from './PendingInvitations';
import { RemoveMemberButton } from './RemoveMemberButton';

export interface ProjectMembersProps {
  projectId: string;
  members: ProjectMember[];
  roles: ProjectRole[];
  /** Perfiles indexados por id: los miembros solo traen `userId`. */
  usersById: Map<string, UserProfile>;
  ownerId: string;
  canManage: boolean;
  /** Enviadas y sin responder: todavía no son miembros. */
  invitations: ProjectInvitation[];
  projectName: string;
  /** Para ofrecer «salir»: solo a quien es miembro y no es el dueño. */
  currentUserId: string;
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Equipo del proyecto.
 *
 * Las invitaciones son de verdad desde `a88e804`: se envían, quedan pendientes
 * y la persona entra al aceptarlas. Lo único que sigue faltando es el aviso —no
 * hay correo ni notificaciones—, así que se entera al abrir su panel.
 */
export function ProjectMembers({
  projectId,
  members,
  roles,
  usersById,
  ownerId,
  canManage,
  invitations,
  projectName,
  currentUserId,
}: ProjectMembersProps) {
  const [isInviting, setIsInviting] = useState(false);
  const memberIds = new Set(members.map((member) => member.userId));
  const invitedIds = new Set(invitations.map((invitation) => invitation.userId));

  /**
   * A quién **no** ofrecer al invitar: quienes ya están dentro, quienes tienen
   * una invitación sin responder, y el dueño.
   *
   * Antes se filtraba una lista de candidatos que llegaba desde la página. Ya no
   * llega: buscar en el directorio entero es cosa del diálogo, que lo hace
   * contra el servidor. Aquí solo se dice a quién descartar de esos resultados.
   */
  const excluirIds = [...memberIds, ...invitedIds, ownerId];

  const isMember = memberIds.has(currentUserId);
  const canLeave = isMember && currentUserId !== ownerId;

  return (
    <section className="flex flex-col gap-4" aria-label="Equipo del proyecto">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h3 className="font-sans font-medium text-text-primary shrink-0">Equipo</h3>
          <span className="text-text-disabled font-light shrink-0">/</span>
          <p className="truncate font-sans text-sm text-text-secondary">
            Quien invites entra al aceptar la invitación, con el rol que le des.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canLeave && <LeaveProjectButton projectId={projectId} projectName={projectName} />}
          {canManage && (
            <Button
              variant={isInviting ? 'secondary' : 'primary'}
              onClick={() => setIsInviting(!isInviting)}
            >
              {isInviting ? 'Cancelar' : 'Invitar persona'}
            </Button>
          )}
        </div>
      </div>

      {/* ⚠️ Aquí ponía `animate-in slide-in-from-top-4 fade-in duration-300`, del
          plugin `tailwindcss-animate`, **que no está instalado**: Tailwind no
          genera nada para una utilidad que no conoce y no avisa, así que el
          panel llevaba meses apareciendo de golpe mientras el código decía que
          se deslizaba.

          El `<div>` interior no sobra: `.animate-desplegar-panel` es un grid de
          una fila y su hijo es quien lleva el `overflow: hidden` que impide que
          el contenido se vea entero desde el primer fotograma. */}
      {isInviting && canManage && (
        <div className="animate-desplegar-panel">
          <div>
            <InviteMemberDialog
              projectId={projectId}
              roles={roles}
              excluirIds={excluirIds}
              onClose={() => setIsInviting(false)}
            />
          </div>
        </div>
      )}

      <PendingInvitations
        projectId={projectId}
        invitations={invitations}
        usersById={usersById}
        canManage={canManage}
      />

      {members.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-elevated px-6 py-8 text-center font-sans text-sm text-text-secondary shadow-sm">
          Todavía no hay nadie en este proyecto.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-elevated shadow-sm">
          <ul className="flex flex-col divide-y divide-border">
            {members.map((member) => {
              const user = usersById.get(member.userId);
              const label = user ? personLabel(user) : member.userId;
              const isOwner = member.userId === ownerId;

              return (
                /**
                 * ⚠️ **En móvil es una tarjeta, no una fila.**
                 *
                 * Era una sola línea con todo dentro, y los controles no se
                 * encogen —el desplegable de rol mide lo que mide—, así que lo
                 * único que podía ceder sitio era la identidad: en un teléfono el
                 * nombre y el correo se recortaban hasta desaparecer justo debajo
                 * del avatar, que es lo que hacía falta leer.
                 *
                 * Apilar en dos filas no solo lo arregla; deja el desplegable a
                 * ancho completo, que además se toca mejor con el dedo.
                 */
                <li
                  key={member.id}
                  className="flex flex-col gap-4 p-5 transition-colors hover:bg-surface first:rounded-t-2xl last:rounded-b-2xl sm:flex-row sm:flex-wrap sm:items-center"
                >
                  {/* Identidad. Va junta en su propio bloque para que el avatar y
                      el nombre no se separen al apilar. */}
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    {/* El mismo círculo que el tablero y la barra lateral: el rojo
                        dice «eres tú» en todo el producto, y el punto de estado
                        importa aquí más que en ninguna parte —la pestaña de equipo
                        es donde se mira quién hay—. Va **en vivo**: era la única
                        superficie con esferas que no escuchaba el flujo, así que
                        se quedaba congelada hasta recargar. Ver `MemberAvatar`. */}
                    <MemberAvatar
                      userId={member.userId}
                      label={label}
                      mine={member.userId === currentUserId}
                      src={avatarHref(user?.avatarUrl, '/projects/api/gateway')}
                      presence={user?.presence ?? null}
                    />

                    <div className="flex min-w-0 flex-1 flex-col">
                      {/**
                       * Siempre dos líneas, con o sin nombre: si no lo hay,
                       * `personLabel` usa la parte local del correo.
                       *
                       * El nombre lleva a la conversación privada con esa persona,
                       * salvo el tuyo — escribirte a ti mismo no existe, y el
                       * backend lo rechaza con un 400.
                       *
                       * ⚠️ Es un `<a>` y no `next/link`: el chat privado vive en
                       * la zona `dashboard` y esto es `projects`, así que la
                       * navegación tiene que ser dura (ESTADO-ACTUAL §16).
                       */}
                      {member.userId === currentUserId ? (
                        <span className="truncate font-sans text-sm font-semibold text-text-primary">
                          {label}
                        </span>
                      ) : (
                        <div className="flex min-w-0 self-start">
                          <a
                            href={`/chat/${member.userId}`}
                            title={`Escribir a ${label} en privado`}
                            className="truncate font-sans text-sm font-semibold text-text-primary underline-offset-2 hover:underline"
                          >
                            {label}
                          </a>
                        </div>
                      )}
                      <span className="truncate font-sans text-xs text-text-secondary mt-0.5">
                        {/* Puede faltar si el directorio se cortó por paginación. */}
                        {user?.credential.email ?? 'Correo no disponible'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                    {isOwner && <Badge variant="accent">DUEÑO</Badge>}
                    {/**
                     * Al dueño no se le cambia el rol: tiene bypass en el guard,
                     * así que el desplegable prometería un efecto que no ocurre.
                     *
                     * A ti mismo **sí** puedes cambiártelo, incluso rebajarte.
                     * Impedirlo no protegería de nada —siempre puedes pedírselo a
                     * otro administrador— y esconderlo dejaría la duda de por qué
                     * tu fila se comporta distinto.
                     */}
                    {canManage && !isOwner ? (
                      <MemberRoleSelect
                        projectId={projectId}
                        userId={member.userId}
                        roles={roles}
                        currentRoleId={member.projectRoleId}
                        label={label}
                      />
                    ) : (
                      <Badge variant="primary">{member.projectRole.name}</Badge>
                    )}
                    <span className="hidden font-sans text-xs font-medium text-text-disabled sm:inline">
                      desde {dateFormatter.format(new Date(member.joinedAt))}
                    </span>

                    {/**
                     * Al dueño no se le puede quitar: perdería su propio proyecto.
                     * Y **nadie se saca a sí mismo**: al salir pierdes los
                     * permisos, así que tampoco podrías volver a entrar. Para irse
                     * está «Salir del proyecto», que es otra decisión y lo dice.
                     * El backend lo rechaza igualmente con un 400.
                     */}
                    {canManage && !isOwner && member.userId !== currentUserId && (
                      <RemoveMemberButton
                        projectId={projectId}
                        userId={member.userId}
                        label={label}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
