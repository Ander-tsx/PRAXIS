'use client';

import { respondInvitationAction } from '@/app/(private)/[id]/invitation-actions';
import { INVITATION_RESPONSE_INITIAL_STATE } from '@/lib/action-state';
import { Badge, Button, type MyInvitation, alpha, colors, useAccion } from '@praxis/commons';

export interface PendingInvitationGateProps {
  invitation: MyInvitation;
}

/**
 * Lo que se ve al abrir un proyecto al que te invitaron y todavía no aceptaste.
 *
 * Antes esto era un error: la invitación llega con un enlace al proyecto, pero
 * **la membresía se crea al aceptar**, así que seguir ese enlace daba una
 * pantalla de fallo por algo que no lo era —te estaban invitando, no negando el
 * paso—. La puerta correcta era esta.
 *
 * Aceptar desde aquí lleva **al proyecto**, no de vuelta al panel: quien pulsa
 * un enlace de invitación quiere entrar, y devolverlo a la lista le obligaría a
 * buscar otra vez lo que ya tenía delante.
 */
export function PendingInvitationGate({ invitation }: PendingInvitationGateProps) {
  const [state, formAction, pending] = useAccion(
    respondInvitationAction,
    INVITATION_RESPONSE_INITIAL_STATE,
  );

  return (
    <section
      aria-label="Invitación pendiente"
      className="mx-auto flex max-w-xl flex-col gap-5 rounded-2xl border p-8"
      style={{
        borderColor: alpha(colors.accent, 25),
        background: `radial-gradient(120% 120% at 0% 0%, ${alpha(colors.accent, 9)}, transparent 55%), ${colors.surface}`,
      }}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: alpha(colors.accent, 15), color: colors.accent }}
      >
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 8l7.9 5.3a2 2 0 002.2 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl text-text-primary">
          Te invitaron a «{invitation.project.name}»
        </h2>
        <p className="font-sans text-sm text-text-secondary">
          Todavía no formas parte del proyecto, así que no puedes ver su contenido. Entrarás en
          cuanto aceptes.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-sans text-xs text-text-secondary">Entrarás como</span>
        <Badge variant="primary">{invitation.projectRole.name}</Badge>
      </div>

      {invitation.project.description && (
        <p className="font-sans text-sm text-text-secondary">{invitation.project.description}</p>
      )}

      {state.error && (
        <p role="alert" className="font-sans text-sm" style={{ color: colors.error }}>
          {state.error}
        </p>
      )}

      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="invitationId" value={invitation.id} />
        {/* Al aceptar se recarga esta misma página, y entonces sí hay proyecto
            que enseñar. La acción lo resuelve con el id que va aquí. */}
        <input type="hidden" name="projectId" value={invitation.project.id} />

        <Button type="submit" name="decision" value="accept" isLoading={pending}>
          Aceptar y entrar
        </Button>
        <Button type="submit" name="decision" value="reject" variant="ghost" disabled={pending}>
          Rechazar
        </Button>
      </form>
    </section>
  );
}
